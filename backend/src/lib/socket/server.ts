import { Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerRanking,
} from "@/types";
import { isRedisEnabled, getRedisClient } from "@/lib/redis";
import { db, nowSql } from "@/lib/db";
import {
  quizSessions,
  questions,
  answerChoices,
  players,
  playerAnswers,
  quizzes,
} from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { calculateScore } from "@/lib/scoring";
import { getRandomAvatar, resetAvatars } from "@/lib/avatars";
import { logger } from "@/lib/logger";
import type { AnswerChoiceRecord, QuestionRecord, QuestionType } from "@/lib/domain/quiz.types";
import {
  createActiveSession,
  getActiveSession,
  getActiveSessionByAdminSocket,
  removeActiveSession,
  registerPlayerSocket,
  getPlayerBySocket,
  removePlayerSocket,
  getCurrentQuestion,
  updateAdminSocket,
  syncSessionMeta,
  type ActiveSession,
} from "./session-manager";
import {
  redisSyncStreak,
  redisSyncAnswered,
  redisClearAnswered,
  redisSyncChoiceCount,
  redisSyncPendingAnswer,
  redisGetSessionMeta,
  POD_ID,
} from "./redis-session-store";
import {
  socketConnectionsGauge,
  socketEventsReceivedCounter,
  gameSessionsGauge,
  gamePlayersGauge,
  gameAnswersCounter,
} from "@/lib/metrics";
import { queueAnswer } from "@/lib/answer-batch-writer";
import { scheduleTimer, cancelTimer } from "@/lib/timer-worker";

interface InterServerEvents {
  "internal:player-answer": (payload: ProxiedPlayerAnswerPayload) => void;
}

type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents
>;
type PlayerAnswerDisplay = string[] | string | null;

// Module-level io reference for timer worker callback
let _io: TypedServer | null = null;

// --- Socket.IO event validation schemas ---
const socketPlayerJoinSchema = z.object({
  pin: z.string().length(6).regex(/^\d{6}$/),
  nickname: z.string().min(1).max(20).trim(),
  browserClientId: z.string().min(8).max(128),
});

const socketPlayerRejoinSchema = z
  .object({
    pin: z.string().length(6).regex(/^\d{6}$/),
    playerId: z.number().int().positive().optional(),
    nickname: z.string().min(1).max(20).trim().optional(),
    browserClientId: z.string().min(8).max(128),
  })
  .superRefine((data, ctx) => {
    const hasPlayerId = Number.isInteger(data.playerId);
    const hasNickname =
      typeof data.nickname === "string" && data.nickname.trim().length > 0;
    if (hasPlayerId !== hasNickname) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "playerId and nickname must be provided together",
      });
    }
  });

const socketPlayerAnswerSchema = z
  .object({
    questionId: z.coerce.number().int().positive(),
    choiceId: z.coerce.number().int().nullable().optional(),
    choiceIds: z.array(z.coerce.number().int()).optional().default([]),
    orderedChoiceIds: z.array(z.coerce.number().int()).optional().default([]),
    textAnswer: z.string().max(500).optional().default(""),
    responseTimeMs: z.coerce.number().nonnegative().optional(),
  })
  .passthrough();

const socketSessionIdSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

type ParsedPlayerAnswer = z.infer<typeof socketPlayerAnswerSchema>;

type SessionPlayerBinding = {
  playerId: number;
  sessionId: number;
};

const proxiedPlayerAnswerSchema = z.object({
  targetPodId: z.string().min(1),
  sessionId: z.coerce.number().int().positive(),
  playerId: z.coerce.number().int().positive(),
  socketId: z.string().min(1),
  answer: socketPlayerAnswerSchema,
});

type ProxiedPlayerAnswerPayload = z.infer<typeof proxiedPlayerAnswerSchema>;

// --- Socket.IO rate limiting ---
const ipConnectionCounts = new Map<string, number>();

async function checkSocketRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<boolean> {
  if (!isRedisEnabled()) return true; // No rate limiting without Redis
  try {
    const client = await getRedisClient();
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, windowSeconds);
    return count <= maxAttempts;
  } catch {
    return true; // Fail open on Redis errors
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("tr");
}

function normalizeBrowserClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length < 8 || normalized.length > 128) return null;
  return normalized;
}

function toIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item));
}

function normalizeCorrectChoiceIds(
  choices: Array<{ id: number; isCorrect?: boolean }>,
  questionType: "multiple_choice" | "true_false" | "multi_select" | "text_input" | "ordering"
): number[] {
  const ids = choices.filter((c) => Boolean(c.isCorrect)).map((c) => c.id);
  if (ids.length > 0) return ids;

  // Safety fallback for legacy/bad data: keep UI and scoring deterministic.
  if (
    choices.length > 0 &&
    (questionType === "multiple_choice" ||
      questionType === "true_false" ||
      questionType === "multi_select")
  ) {
    return [choices[0].id];
  }

  return [];
}

function buildPlayerAnswerDisplay(
  question: {
    questionType: "multiple_choice" | "true_false" | "multi_select" | "text_input" | "ordering";
    choices: Array<{ id: number; choiceText: string }>;
  },
  answer: {
    choiceId: number | null;
    choiceIds: number[];
    orderedChoiceIds: number[];
    textAnswer: string;
  }
): PlayerAnswerDisplay {
  if (question.questionType === "text_input") {
    return answer.textAnswer?.trim() ? answer.textAnswer : null;
  }

  if (question.questionType === "ordering") {
    const orderedTexts = answer.orderedChoiceIds
      .map((choiceId) => {
        const choice = question.choices.find((c) => Number(c.id) === Number(choiceId));
        return choice?.choiceText || `Choice ${choiceId}`;
      })
      .filter((text) => text);
    return orderedTexts.length > 0 ? orderedTexts : null;
  }

  const selectedIds =
    question.questionType === "multi_select"
      ? Array.from(
          new Set(
            [
              ...answer.choiceIds.map((id) => Number(id)),
              ...(Number.isInteger(answer.choiceId) ? [Number(answer.choiceId)] : []),
            ].filter((id) => Number.isInteger(id))
          )
        )
      : [
          Number.isInteger(answer.choiceId)
            ? Number(answer.choiceId)
            : Number(answer.choiceIds[0]),
        ].filter((id) => Number.isInteger(id));

  const selectedTexts = selectedIds
    .map((choiceId) => question.choices.find((c) => Number(c.id) === choiceId)?.choiceText)
    .filter((text): text is string => Boolean(text));

  if (selectedTexts.length === 0) return null;
  if (question.questionType === "multi_select") return selectedTexts;
  return selectedTexts[0] || null;
}

function buildCorrectAnswerText(question: {
  questionType: "multiple_choice" | "true_false" | "multi_select" | "text_input" | "ordering";
  choices: Array<{ id: number; choiceText: string; orderIndex: number }>;
  correctChoiceId: number;
  correctChoiceIds: number[];
}): string[] {
  if (question.questionType === "text_input") {
    return Array.from(
      new Set(
        question.choices
          .map((choice) => choice.choiceText.trim())
          .filter((choiceText) => choiceText.length > 0)
      )
    );
  }

  if (question.questionType === "ordering") {
    return [...question.choices]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((choice) => choice.choiceText.trim())
      .filter((choiceText) => choiceText.length > 0);
  }

  const normalizedCorrectIds =
    question.correctChoiceIds.length > 0
      ? question.correctChoiceIds
      : Number.isInteger(question.correctChoiceId) && question.correctChoiceId > 0
      ? [question.correctChoiceId]
      : [];

  if (normalizedCorrectIds.length === 0) {
    return [];
  }

  const correctIdSet = new Set(normalizedCorrectIds.map((choiceId) => Number(choiceId)));
  return question.choices
    .filter((choice) => correctIdSet.has(Number(choice.id)))
    .map((choice) => choice.choiceText.trim())
    .filter((choiceText) => choiceText.length > 0);
}

function getActivePlayerSocketMap(
  io: TypedServer,
  sessionId: number
): Map<number, string> {
  const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
  const playerSocketMap = new Map<number, string>();
  if (!room) return playerSocketMap;

  for (const socketId of Array.from(room)) {
    if (!io.sockets.sockets.has(socketId)) continue;
    const playerInfo = getPlayerBySocket(socketId);
    if (!playerInfo) continue;
    if (playerInfo.sessionId !== sessionId) continue;
    playerSocketMap.set(playerInfo.playerId, socketId);
  }

  return playerSocketMap;
}

async function getLiveConnectedPlayerCount(
  io: TypedServer,
  sessionId: number
): Promise<number> {
  const roomMap = getActivePlayerSocketMap(io, sessionId);
  if (roomMap.size > 0) {
    return roomMap.size;
  }

  const connectedPlayers = await db
    .select({
      id: players.id,
      socketId: players.socketId,
    })
    .from(players)
    .where(
      and(
        eq(players.sessionId, sessionId),
        eq(players.isConnected, true)
      )
    );

  return connectedPlayers.filter(
    (player: { id: number; socketId: string | null }) =>
      Boolean(player.socketId) &&
      io.sockets.sockets.has(player.socketId as string)
  ).length;
}

const sessionRecoveryLocks = new Map<number, Promise<ActiveSession | undefined>>();

async function loadQuestionsWithChoices(
  quizId: number
): Promise<
  Array<{
    id: number;
    questionText: string;
    questionType: QuestionType;
    timeLimitSeconds: number;
    mediaUrl: string | null;
    backgroundUrl: string | null;
    choices: Array<{ id: number; choiceText: string; orderIndex: number }>;
    correctChoiceId: number;
    correctChoiceIds: number[];
    correctOrderChoiceIds: number[];
    acceptedAnswers: string[];
    basePoints: number;
    deductionPoints: number;
    deductionInterval: number;
  }>
> {
  const dbQuestions: QuestionRecord[] = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.orderIndex));

  return Promise.all(
    dbQuestions.map(async (q) => {
      const choices: AnswerChoiceRecord[] = await db
        .select()
        .from(answerChoices)
        .where(eq(answerChoices.questionId, q.id))
        .orderBy(asc(answerChoices.orderIndex));

      const questionType = q.questionType as QuestionType;
      const correctChoiceIds = normalizeCorrectChoiceIds(
        choices.map((c) => ({ id: c.id, isCorrect: c.isCorrect })),
        questionType
      );

      logger.socket.info(
        `[QUIZ-LOAD] Q${q.id} Type=${questionType}: Choices=[${choices
          .map((c) => `${c.id}(${c.isCorrect ? "ok" : "x"})`)
          .join(", ")}], CorrectIds=[${correctChoiceIds.join(", ")}]`
      );

      const correctOrderChoiceIds = [...choices]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c) => c.id);
      const acceptedAnswers = choices.map((c) => normalizeText(c.choiceText));

      return {
        id: q.id,
        questionText: q.questionText,
        questionType,
        timeLimitSeconds: q.timeLimitSeconds,
        mediaUrl: q.mediaUrl,
        backgroundUrl: q.backgroundUrl,
        choices: choices.map((c) => ({
          id: c.id,
          choiceText: c.choiceText,
          orderIndex: c.orderIndex,
        })),
        correctChoiceId: correctChoiceIds[0] || 0,
        correctChoiceIds,
        correctOrderChoiceIds,
        acceptedAnswers,
        basePoints: q.basePoints,
        deductionPoints: q.deductionPoints,
        deductionInterval: q.deductionInterval,
      };
    })
  );
}

async function recoverActiveSessionIfPossible(
  io: TypedServer,
  sessionId: number
): Promise<ActiveSession | undefined> {
  const existingSession = getActiveSession(sessionId);
  if (existingSession) {
    return existingSession;
  }

  const existingLock = sessionRecoveryLocks.get(sessionId);
  if (existingLock) {
    return existingLock;
  }

  const recoveryPromise = (async () => {
    const [dbSession] = await db
      .select()
      .from(quizSessions)
      .where(eq(quizSessions.id, sessionId));

    if (!dbSession || dbSession.status !== "in_progress") {
      return undefined;
    }

    const questionsWithChoices = await loadQuestionsWithChoices(dbSession.quizId);
    if (questionsWithChoices.length === 0) {
      return undefined;
    }

    const recovered = createActiveSession(
      sessionId,
      dbSession.pin,
      "",
      questionsWithChoices
    );

    const sessionMeta = await redisGetSessionMeta(sessionId);
    const dbIndex = Number.isInteger(dbSession.currentQuestionIndex)
      ? Number(dbSession.currentQuestionIndex)
      : -1;
    const metaIndex =
      sessionMeta && Number.isInteger(sessionMeta.currentQuestionIndex)
        ? Number(sessionMeta.currentQuestionIndex)
        : -1;

    let recoveredIndex = Math.max(dbIndex, metaIndex, 0);
    if (recoveredIndex >= recovered.questions.length) {
      recoveredIndex = recovered.questions.length - 1;
    }

    recovered.currentQuestionIndex = recoveredIndex;
    recovered.questionStartTime =
      sessionMeta && sessionMeta.questionStartTime > 0
        ? sessionMeta.questionStartTime
        : Date.now();

    recovered.totalConnectedPlayers = await getLiveConnectedPlayerCount(
      io,
      sessionId
    );
    syncSessionMeta(recovered);

    const currentQuestion = getCurrentQuestion(recovered);
    if (currentQuestion) {
      const elapsedMs = Math.max(0, Date.now() - recovered.questionStartTime);
      const remainingMs = currentQuestion.timeLimitSeconds * 1000 - elapsedMs;
      if (remainingMs > 0) {
        recovered.timer = setTimeout(() => {
          void handleTimeUp(io, recovered);
        }, remainingMs);
        scheduleTimer(recovered.sessionId, remainingMs);
      } else {
        recovered.timer = null;
      }
    }

    logger.socket.warn(
      `Recovered active session ${sessionId} (questionIndex=${recovered.currentQuestionIndex})`
    );
    return recovered;
  })();

  sessionRecoveryLocks.set(sessionId, recoveryPromise);
  try {
    return await recoveryPromise;
  } finally {
    sessionRecoveryLocks.delete(sessionId);
  }
}

async function forwardPlayerAnswerToOwningPod(
  io: TypedServer,
  socketId: string,
  playerInfo: SessionPlayerBinding,
  answer: ParsedPlayerAnswer
): Promise<boolean> {
  try {
    const sessionMeta = await redisGetSessionMeta(playerInfo.sessionId);
    if (!sessionMeta?.podId || sessionMeta.podId === POD_ID) {
      return false;
    }

    io.serverSideEmit("internal:player-answer", {
      targetPodId: sessionMeta.podId,
      sessionId: playerInfo.sessionId,
      playerId: playerInfo.playerId,
      socketId,
      answer,
    });
    return true;
  } catch (err) {
    logger.socket.warn("Failed to proxy player answer to owning pod", err);
    return false;
  }
}

async function processPlayerAnswer(
  io: TypedServer,
  socketId: string,
  playerInfo: SessionPlayerBinding,
  answer: ParsedPlayerAnswer
): Promise<void> {
  const { questionId, choiceId, choiceIds, orderedChoiceIds, textAnswer } = answer;
  const emitError = (message: string) => {
    io.to(socketId).emit("error", { message });
  };

  let session: ActiveSession | undefined;
  try {
    session = getActiveSession(playerInfo.sessionId);
    if (!session) {
      session = await recoverActiveSessionIfPossible(io, playerInfo.sessionId);
    }
    if (!session) {
      emitError("No active session");
      return;
    }

    const currentQ = getCurrentQuestion(session);
    if (!currentQ || currentQ.id !== questionId) {
      emitError("Wrong question");
      return;
    }

    if (session.answeredPlayerIds.has(playerInfo.playerId)) {
      emitError("Already answered");
      return;
    }

    session.answeredPlayerIds.add(playerInfo.playerId);
    redisSyncAnswered(session.sessionId, playerInfo.playerId);
    socketEventsReceivedCounter.inc({ event_name: "player:answer" });
    const rejectAnswer = (message: string) => {
      session?.answeredPlayerIds.delete(playerInfo.playerId);
      emitError(message);
    };

    const serverResponseTime = Date.now() - session.questionStartTime;
    const actualResponseTime = Math.min(
      serverResponseTime,
      currentQ.timeLimitSeconds * 1000
    );
    const safeChoiceIds = toIntegerArray(choiceIds);
    const safeOrderedChoiceIds = toIntegerArray(orderedChoiceIds);
    const safeTextAnswer = typeof textAnswer === "string" ? textAnswer.trim() : "";

    let isCorrect = false;
    let persistedChoiceId: number | null = null;
    let partialRatio = 1;

    if (
      currentQ.questionType === "multiple_choice" ||
      currentQ.questionType === "true_false"
    ) {
      const normalizedChoiceId = Number(choiceId);
      if (!Number.isInteger(normalizedChoiceId)) {
        rejectAnswer("Choice is required");
        return;
      }
      const normalizedCorrectId = Number(currentQ.correctChoiceId);
      persistedChoiceId = normalizedChoiceId;
      isCorrect = normalizedChoiceId === normalizedCorrectId;

      logger.socket.info(`[SCORING] Q${questionId}: Player selected=${normalizedChoiceId} (type: ${typeof choiceId}), Correct=${normalizedCorrectId} (type: ${typeof currentQ.correctChoiceId}), isCorrect=${isCorrect}, ChoiceIds in Q: ${currentQ.choices.map(c => c.id).join(',')}`);

      session.choiceCounts[normalizedChoiceId] = (session.choiceCounts[normalizedChoiceId] || 0) + 1;
      redisSyncChoiceCount(session.sessionId, normalizedChoiceId, session.choiceCounts[normalizedChoiceId]);
    } else if (currentQ.questionType === "multi_select") {
      if (safeChoiceIds.length === 0) {
        rejectAnswer("At least one choice is required");
        return;
      }
      persistedChoiceId = safeChoiceIds[0] || null;
      const correctSet = new Set(currentQ.correctChoiceIds.map(id => Number(id)));
      const selectedIds = safeChoiceIds.map(id => Number(id));
      const selectedCorrect = selectedIds.filter((id) => correctSet.has(id)).length;
      const selectedWrong = selectedIds.filter((id) => !correctSet.has(id)).length;
      isCorrect = selectedCorrect > 0 && selectedWrong === 0;
      partialRatio = isCorrect ? selectedCorrect / correctSet.size : 0;
      for (const id of selectedIds) {
        session.choiceCounts[id] = (session.choiceCounts[id] || 0) + 1;
        redisSyncChoiceCount(session.sessionId, id, session.choiceCounts[id]);
      }
    } else if (currentQ.questionType === "ordering") {
      if (safeOrderedChoiceIds.length !== currentQ.correctOrderChoiceIds.length) {
        rejectAnswer("Ordering answer is incomplete");
        return;
      }
      persistedChoiceId = safeOrderedChoiceIds[0] || null;
      const normalizedOrdered = safeOrderedChoiceIds.map(id => Number(id));
      const normalizedCorrectOrder = currentQ.correctOrderChoiceIds.map(id => Number(id));
      isCorrect = normalizedOrdered.every(
        (id, idx) => id === normalizedCorrectOrder[idx]
      );
    } else {
      if (!safeTextAnswer) {
        rejectAnswer("Answer text is required");
        return;
      }
      const normalized = normalizeText(safeTextAnswer);
      isCorrect = currentQ.acceptedAnswers.includes(normalized);
      const matchedChoice = currentQ.choices.find(
        (choice) => normalizeText(choice.choiceText) === normalized
      );
      persistedChoiceId = matchedChoice?.id || null;
    }

    gameAnswersCounter.inc({ is_correct: String(isCorrect) });

    let currentStreak = session.playerStreaks.get(playerInfo.playerId) || 0;
    if (isCorrect) {
      currentStreak++;
    } else {
      currentStreak = 0;
    }
    session.playerStreaks.set(playerInfo.playerId, currentStreak);
    redisSyncStreak(session.sessionId, playerInfo.playerId, currentStreak);

    let points = calculateScore(
      {
        basePoints: currentQ.basePoints,
        timeLimitSeconds: currentQ.timeLimitSeconds,
        deductionPoints: currentQ.deductionPoints,
        deductionInterval: currentQ.deductionInterval,
      },
      actualResponseTime,
      isCorrect
    );
    if (partialRatio < 1 && partialRatio > 0) {
      points = Math.round(points * partialRatio);
    }

    let streakBonus = 0;
    if (isCorrect && currentStreak >= 5) {
      streakBonus = Math.round(points * 0.2);
    } else if (isCorrect && currentStreak >= 3) {
      streakBonus = Math.round(points * 0.1);
    }
    points += streakBonus;

    const queued = await queueAnswer({
      playerId: playerInfo.playerId,
      questionId,
      sessionId: playerInfo.sessionId,
      choiceId: persistedChoiceId,
      isCorrect,
      responseTimeMs: actualResponseTime,
      pointsAwarded: points,
      answeredAt: new Date().toISOString(),
    });
    if (!queued) {
      // Fallback: direct DB write when Redis is unavailable
      await db.insert(playerAnswers).values({
        playerId: playerInfo.playerId,
        questionId,
        sessionId: playerInfo.sessionId,
        choiceId: persistedChoiceId,
        isCorrect,
        responseTimeMs: actualResponseTime,
        pointsAwarded: points,
        answeredAt: nowSql,
      });
    }

    const [player] = await db
      .select()
      .from(players)
      .where(
        and(
          eq(players.id, playerInfo.playerId),
          eq(players.sessionId, playerInfo.sessionId)
        )
      );

    if (!player) {
      rejectAnswer("Player not found");
      return;
    }

    const newTotal = player.totalScore + points;
    await db
      .update(players)
      .set({ totalScore: newTotal })
      .where(eq(players.id, playerInfo.playerId));

    const pendingAnswer = {
      playerId: playerInfo.playerId,
      socketId,
      choiceId: persistedChoiceId,
      choiceIds: safeChoiceIds,
      orderedChoiceIds: safeOrderedChoiceIds,
      textAnswer: safeTextAnswer,
      isCorrect,
      points,
      streakBonus,
      totalScore: newTotal,
      streak: currentStreak,
      responseTimeMs: actualResponseTime,
    };
    session.pendingAnswers.set(playerInfo.playerId, pendingAnswer);
    redisSyncPendingAnswer(session.sessionId, playerInfo.playerId, pendingAnswer);

    io.to(socketId).emit("game:answer-ack", { received: true });
    session.totalConnectedPlayers = await getLiveConnectedPlayerCount(
      io,
      session.sessionId
    );

    if (session.answeredPlayerIds.size >= session.totalConnectedPlayers) {
      if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
      }
      cancelTimer(session.sessionId);
      await handleTimeUp(io, session);
    }
  } catch (err) {
    if (session) {
      session.answeredPlayerIds.delete(playerInfo.playerId);
    }
    logger.socket.error("player:answer error", err);
    emitError("Failed to process answer");
  }
}

export function setupSocketHandlers(io: TypedServer) {
  _io = io;
  // Migrations run at startup in server.ts before this function is called

  io.on("internal:player-answer", async (rawPayload) => {
    const parsed = proxiedPlayerAnswerSchema.safeParse(rawPayload);
    if (!parsed.success) {
      logger.socket.warn("Invalid internal:player-answer payload", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message,
        })),
      });
      return;
    }

    const payload = parsed.data;
    if (payload.targetPodId !== POD_ID) {
      return;
    }

    await processPlayerAnswer(
      io,
      payload.socketId,
      {
        playerId: payload.playerId,
        sessionId: payload.sessionId,
      },
      payload.answer
    );
  });

  io.on("connection", (socket) => {
    logger.socket.debug(`Connected: ${socket.id}`);
    socketConnectionsGauge.inc();

    // Per-IP connection limiting (max 20 concurrent connections per IP)
    const clientIp = socket.handshake.address;
    const currentCount = (ipConnectionCounts.get(clientIp) || 0) + 1;
    ipConnectionCounts.set(clientIp, currentCount);
    if (currentCount > 20) {
      logger.socket.warn(`Too many connections from IP ${clientIp}, disconnecting`);
      socket.disconnect(true);
      return;
    }
    socket.on("disconnect", () => {
      const count = ipConnectionCounts.get(clientIp) || 1;
      if (count <= 1) {
        ipConnectionCounts.delete(clientIp);
      } else {
        ipConnectionCounts.set(clientIp, count - 1);
      }
    });

    socket.on("admin:join-session", async (rawData) => {
      try {
        const parsed = socketSessionIdSchema.safeParse(rawData);
        if (!parsed.success) {
          socket.emit("error", { message: "Invalid session data" });
          return;
        }
        const { sessionId } = parsed.data;
        let session = getActiveSession(sessionId);
        if (!session) {
          session = await recoverActiveSessionIfPossible(io, sessionId);
        }
        if (session) {
          updateAdminSocket(session, socket.id);
        }
        socket.join(`session:${sessionId}`);

        // Opening admin live screen should make lobby joinable.
        await db
          .update(quizSessions)
          .set({ isLive: true })
          .where(
            and(
              eq(quizSessions.id, sessionId),
              eq(quizSessions.status, "lobby")
            )
          );
        io.to(`session:${sessionId}`).emit("session:live");

        logger.socket.info(`Admin joined session ${sessionId}`);
      } catch (err) {
        logger.socket.error("admin:join-session error", err);
        socket.emit("error", { message: "Failed to join admin session" });
      }
    });

    socket.on("admin:start-live", async (rawData) => {
      try {
        const parsed = socketSessionIdSchema.safeParse(rawData);
        if (!parsed.success) {
          socket.emit("error", { message: "Invalid session data" });
          return;
        }
        const { sessionId } = parsed.data;
        await db
          .update(quizSessions)
          .set({ isLive: true })
          .where(eq(quizSessions.id, sessionId));

        io.to(`session:${sessionId}`).emit("session:live");
        logger.socket.info(`Session ${sessionId} is now live`);
      } catch (err) {
        logger.socket.error("admin:start-live error", err);
        socket.emit("error", { message: "Failed to start live" });
      }
    });

    socket.on("player:join", async (rawData) => {
      try {
        const parsed = socketPlayerJoinSchema.safeParse(rawData);
        if (!parsed.success) {
          socket.emit("error", { message: "Invalid join data" });
          return;
        }
        const { pin, nickname, browserClientId } = parsed.data;

        // Rate limit: 5 join attempts per minute per IP
        const allowed = await checkSocketRateLimit(
          `ratelimit:join:${clientIp}`,
          5,
          60
        );
        if (!allowed) {
          socket.emit("error", { message: "Too many join attempts. Please wait." });
          return;
        }


        const normalizedBrowserClientId = normalizeBrowserClientId(browserClientId);
        if (!normalizedBrowserClientId) {
          socket.emit("error", { message: "Invalid browser session. Refresh and try again." });
          return;
        }

        const [dbSession] = await db
          .select()
          .from(quizSessions)
          .where(eq(quizSessions.pin, pin));

        if (!dbSession || dbSession.status !== "lobby") {
          socket.emit("error", { message: "Invalid PIN or quiz not in lobby" });
          return;
        }

        let canJoinLive = dbSession.isLive;
        if (!canJoinLive) {
          const room = io.sockets.adapter.rooms.get(`session:${dbSession.id}`);
          const hasHostPresence = Boolean(room && room.size > 0);
          if (hasHostPresence) {
            await db
              .update(quizSessions)
              .set({ isLive: true })
              .where(eq(quizSessions.id, dbSession.id));
            canJoinLive = true;
            io.to(`session:${dbSession.id}`).emit("session:live");
          }
        }

        if (!canJoinLive) {
          socket.emit("error", { message: "Session not live yet. Wait for the host." });
          return;
        }

        const [existingBrowserPlayer] = await db
          .select()
          .from(players)
          .where(
            and(
              eq(players.sessionId, dbSession.id),
              eq(players.browserClientId, normalizedBrowserClientId)
            )
          )
          .orderBy(desc(players.id));

        if (existingBrowserPlayer) {
          if (existingBrowserPlayer.nickname !== nickname) {
            const [nicknameOwner] = await db
              .select()
              .from(players)
              .where(
                and(
                  eq(players.sessionId, dbSession.id),
                  eq(players.nickname, nickname)
                )
              )
              .orderBy(desc(players.id));

            if (nicknameOwner && nicknameOwner.id !== existingBrowserPlayer.id) {
              socket.emit("error", { message: "Nickname already taken" });
              return;
            }
          }

          const existingSocketId = existingBrowserPlayer.socketId;
          const hasLiveSocket =
            Boolean(existingSocketId) && io.sockets.sockets.has(existingSocketId as string);
          if (existingBrowserPlayer.isConnected && hasLiveSocket) {
            socket.emit("error", { message: "This browser already joined this game." });
            return;
          }

          if (existingSocketId) {
            removePlayerSocket(existingSocketId);
          }

          await db
            .update(players)
            .set({
              isConnected: true,
              socketId: socket.id,
              nickname,
            })
            .where(eq(players.id, existingBrowserPlayer.id));

          registerPlayerSocket(socket.id, existingBrowserPlayer.id, dbSession.id);
          socket.join(`session:${dbSession.id}`);

          const [quiz] = await db
            .select()
            .from(quizzes)
            .where(eq(quizzes.id, dbSession.quizId));

          const avatar = existingBrowserPlayer.avatar || "🎮";
          socket.emit("player:joined-success", {
            playerId: existingBrowserPlayer.id,
            sessionId: dbSession.id,
            quizTitle: quiz?.title || "Quiz",
            avatar,
          });

          const allPlayers = await db
            .select()
            .from(players)
            .where(eq(players.sessionId, dbSession.id));

          io.to(`session:${dbSession.id}`).emit("lobby:player-joined", {
            playerId: existingBrowserPlayer.id,
            nickname,
            avatar,
            playerCount: allPlayers.length,
          });

          logger.socket.info(
            `Player "${nickname}" reclaimed by browser session in session ${dbSession.id}`
          );
          return;
        }

        const [existingPlayer] = await db
          .select()
          .from(players)
          .where(
            and(
              eq(players.sessionId, dbSession.id),
              eq(players.nickname, nickname)
            )
          );

        if (existingPlayer) {
          socket.emit("error", { message: "Nickname already taken" });
          return;
        }

        const avatar = getRandomAvatar();

        const [result] = await db
          .insert(players)
          .values({
            sessionId: dbSession.id,
            nickname,
            avatar,
            socketId: socket.id,
            browserClientId: normalizedBrowserClientId,
            joinedAt: nowSql,
          })
          .returning();

        registerPlayerSocket(socket.id, result.id, dbSession.id);
        socket.join(`session:${dbSession.id}`);

        const [quiz] = await db
          .select()
          .from(quizzes)
          .where(eq(quizzes.id, dbSession.quizId));

        socket.emit("player:joined-success", {
          playerId: result.id,
          sessionId: dbSession.id,
          quizTitle: quiz?.title || "Quiz",
          avatar,
        });

        const allPlayers = await db
          .select()
          .from(players)
          .where(eq(players.sessionId, dbSession.id));

        io.to(`session:${dbSession.id}`).emit("lobby:player-joined", {
          playerId: result.id,
          nickname,
          avatar,
          playerCount: allPlayers.length,
        });

        logger.socket.info(`Player "${nickname}" joined session ${dbSession.id}`);
      } catch (err) {
        logger.socket.error("player:join error", err);
        socket.emit("error", { message: "Failed to join" });
      }
    });

    socket.on("player:rejoin", async (rawData) => {
      const parsed = socketPlayerRejoinSchema.safeParse(rawData);
      if (!parsed.success) {
        socket.emit("error", { message: "Invalid rejoin data" });
        return;
      }
      const { pin, playerId, nickname, browserClientId } = parsed.data;
      try {

        const normalizedBrowserClientId = normalizeBrowserClientId(browserClientId);
        if (!normalizedBrowserClientId) {
          socket.emit("error", { message: "Invalid browser session. Refresh and try again." });
          return;
        }

        const [dbSession] = await db
          .select()
          .from(quizSessions)
          .where(eq(quizSessions.pin, pin));

        if (!dbSession) {
          socket.emit("error", { message: "Session not found" });
          return;
        }

        if (dbSession.status === "lobby" && !dbSession.isLive) {
          const room = io.sockets.adapter.rooms.get(`session:${dbSession.id}`);
          const hasHostPresence = Boolean(room && room.size > 0);
          if (hasHostPresence) {
            await db
              .update(quizSessions)
              .set({ isLive: true })
              .where(eq(quizSessions.id, dbSession.id));
            io.to(`session:${dbSession.id}`).emit("session:live");
          } else {
            socket.emit("error", { message: "Session not live yet. Wait for the host." });
            return;
          }
        }

        const hasIdentity =
          Number.isInteger(playerId) &&
          typeof nickname === "string" &&
          nickname.trim().length > 0;
        let player: typeof players.$inferSelect | undefined;

        if (hasIdentity) {
          const [matchedPlayer] = await db
            .select()
            .from(players)
            .where(
              and(
                eq(players.id, playerId as number),
                eq(players.sessionId, dbSession.id),
                eq(players.nickname, nickname as string)
              )
            );
          player = matchedPlayer;
        }

        const [browserOwner] = await db
          .select()
          .from(players)
          .where(
            and(
              eq(players.sessionId, dbSession.id),
              eq(players.browserClientId, normalizedBrowserClientId)
            )
          )
          .orderBy(desc(players.id));

        if (!player && browserOwner) {
          player = browserOwner;
        }

        if (!player) {
          socket.emit("error", { message: "Player not found, join again" });
          return;
        }

        if (browserOwner && browserOwner.id !== player.id) {
          const browserOwnerSocketIsLive =
            Boolean(browserOwner.socketId) &&
            io.sockets.sockets.has(browserOwner.socketId as string);
          if (browserOwner.isConnected && browserOwnerSocketIsLive) {
            socket.emit("error", { message: "This browser is linked to another player." });
            return;
          }
          socket.emit("error", { message: "Browser session does not match this player." });
          return;
        }

        if (
          player.browserClientId &&
          player.browserClientId !== normalizedBrowserClientId
        ) {
          socket.emit("error", { message: "This player belongs to another browser." });
          return;
        }

        if (player.socketId && player.socketId !== socket.id) {
          removePlayerSocket(player.socketId);
        }

        if (
          !player.isConnected ||
          player.socketId !== socket.id ||
          !player.browserClientId
        ) {
          const updateValues: Record<string, unknown> = {
            isConnected: true,
            socketId: socket.id,
          };
          if (!player.browserClientId) {
            updateValues.browserClientId = normalizedBrowserClientId;
          }
          await db
            .update(players)
            .set(updateValues)
            .where(eq(players.id, player.id));
        }

        registerPlayerSocket(socket.id, player.id, dbSession.id);
        socket.join(`session:${dbSession.id}`);

        const [quiz] = await db
          .select()
          .from(quizzes)
          .where(eq(quizzes.id, dbSession.quizId));

        let session = getActiveSession(dbSession.id);
        if (!session && dbSession.status === "in_progress") {
          session = await recoverActiveSessionIfPossible(io, dbSession.id);
        }
        let phase: "lobby" | "question" | "answered" | "leaderboard" | "ended" = "lobby";
        if (dbSession.status === "completed") {
          phase = "ended";
        } else if (dbSession.status === "in_progress") {
          if (session && getCurrentQuestion(session)) {
            phase = session.timer
              ? session.answeredPlayerIds.has(player.id)
                ? "answered"
                : "question"
              : "leaderboard";
          } else {
            phase = "question";
          }
        }

        if (session) {
          session.totalConnectedPlayers = await getLiveConnectedPlayerCount(
            io,
            dbSession.id
          );
        }

        socket.emit("player:rejoined-success", {
          playerId: player.id,
          sessionId: dbSession.id,
          quizTitle: quiz?.title || "Quiz",
          avatar: player.avatar || "🎮",
          totalScore: player.totalScore,
          phase,
        });

        if (session) {
          const currentQ = getCurrentQuestion(session);
          if (currentQ && (phase === "question" || phase === "answered")) {
            const publicChoices =
              currentQ.questionType === "text_input" ? [] : currentQ.choices;

            socket.emit("game:question-start", {
              question: {
                id: currentQ.id,
                questionText: currentQ.questionText,
                questionType: currentQ.questionType,
                timeLimitSeconds: currentQ.timeLimitSeconds,
                basePoints: currentQ.basePoints,
                deductionPoints: currentQ.deductionPoints,
                deductionInterval: currentQ.deductionInterval,
                mediaUrl: currentQ.mediaUrl,
                backgroundUrl: currentQ.backgroundUrl,
                choices: publicChoices,
              },
              questionNumber: session.currentQuestionIndex + 1,
              totalQuestions: session.questions.length,
              serverStartTime: session.questionStartTime,
            });

            if (phase === "answered") {
              socket.emit("game:answer-ack", { received: true });
            }
          } else if (phase === "leaderboard") {
            // First send batch results for this player if they answered
            const playerAnswer = session.pendingAnswers.get(player.id);
            if (playerAnswer && currentQ) {
              const playerAnswerDisplay = buildPlayerAnswerDisplay(currentQ, playerAnswer);

              socket.emit("game:batch-results", {
                questionId: currentQ.id,
                isCorrect: playerAnswer.isCorrect,
                pointsAwarded: playerAnswer.points,
                streakBonus: playerAnswer.streakBonus,
                totalScore: playerAnswer.totalScore,
                correctChoiceId: currentQ.correctChoiceId,
                correctChoiceIds: currentQ.correctChoiceIds,
                streak: playerAnswer.streak,
                playerAnswer: playerAnswerDisplay,
                correctAnswerText: buildCorrectAnswerText(currentQ),
              });
            }

            // Then send leaderboard
            const allPlayers = (await db
              .select()
              .from(players)
              .where(eq(players.sessionId, session.sessionId))
              .orderBy(desc(players.totalScore)));

            const rankings: PlayerRanking[] = allPlayers.map(
              (p, i: number) => ({
                playerId: p.id,
                nickname: p.nickname,
                avatar: p.avatar || "🎮",
                totalScore: p.totalScore,
                rank: i + 1,
                streak: session.playerStreaks.get(p.id) || 0,
              })
            );

            socket.emit("game:leaderboard", { rankings });
          }
        }

        logger.socket.debug(`Player "${player.nickname}" rejoined session ${dbSession.id}`);
      } catch (err) {
        logger.socket.error("player:rejoin error", err);
        socket.emit("error", { message: "Failed to rejoin" });
      }
    });

    socket.on("admin:start-quiz", async (rawData) => {
      try {
        const parsed = socketSessionIdSchema.safeParse(rawData);
        if (!parsed.success) {
          socket.emit("error", { message: "Invalid session data" });
          return;
        }
        const { sessionId } = parsed.data;

        const [dbSession] = await db
          .select()
          .from(quizSessions)
          .where(eq(quizSessions.id, sessionId));

        if (!dbSession || dbSession.status !== "lobby") {
          socket.emit("error", { message: "Session not in lobby state" });
          return;
        }
        const questionsWithChoices = await loadQuestionsWithChoices(
          dbSession.quizId
        );

        if (questionsWithChoices.length === 0) {
          socket.emit("error", { message: "Quiz has no questions" });
          return;
        }

        const activeSession = createActiveSession(
          sessionId,
          dbSession.pin,
          socket.id,
          questionsWithChoices
        );
        activeSession.totalConnectedPlayers = await getLiveConnectedPlayerCount(
          io,
          sessionId
        );

        await db
          .update(quizSessions)
          .set({ status: "in_progress", startedAt: nowSql })
          .where(eq(quizSessions.id, sessionId));

        gameSessionsGauge.inc();
        gamePlayersGauge.inc(activeSession.totalConnectedPlayers);
        logger.socket.info(`Quiz started for session ${sessionId} with ${questionsWithChoices.length} questions`);

        for (let i = 3; i >= 1; i--) {
          io.to(`session:${sessionId}`).emit("game:countdown", { count: i });
          await sleep(1000);
        }

        await sendNextQuestion(io, activeSession);
      } catch (err) {
        logger.socket.error("admin:start-quiz error", err);
        socket.emit("error", { message: "Failed to start quiz" });
      }
    });

    socket.on("admin:next-question", async (rawData) => {
      const parsed = socketSessionIdSchema.safeParse(rawData);
      if (!parsed.success) {
        socket.emit("error", { message: "Invalid session data" });
        return;
      }
      const { sessionId } = parsed.data;
      let session = getActiveSession(sessionId);
      if (!session) {
        session = await recoverActiveSessionIfPossible(io, sessionId);
      }
      if (!session) {
        socket.emit("error", { message: "No active session" });
        return;
      }
      if (session.adminSocketId !== socket.id) {
        updateAdminSocket(session, socket.id);
      }
      await sendNextQuestion(io, session);
    });

    socket.on(
      "player:answer",
      async (rawData) => {
        const parsed = socketPlayerAnswerSchema.safeParse(rawData);
        if (!parsed.success) {
          logger.socket.warn("Invalid player:answer payload", {
            socketId: socket.id,
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
              message: issue.message,
            })),
          });
          socket.emit("error", { message: "Invalid answer data" });
          return;
        }

        const playerInfo = getPlayerBySocket(socket.id);
        if (!playerInfo) {
          socket.emit("error", { message: "Player not found" });
          return;
        }

        if (!getActiveSession(playerInfo.sessionId)) {
          const forwarded = await forwardPlayerAnswerToOwningPod(
            io,
            socket.id,
            playerInfo,
            parsed.data
          );
          if (forwarded) {
            return;
          }
        }

        await processPlayerAnswer(io, socket.id, playerInfo, parsed.data);
      }
    );

    socket.on("admin:end-quiz", async (rawData) => {
      const parsed = socketSessionIdSchema.safeParse(rawData);
      if (!parsed.success) {
        socket.emit("error", { message: "Invalid session data" });
        return;
      }
      await endQuiz(io, parsed.data.sessionId);
    });

    socket.on("disconnect", async () => {
      socketConnectionsGauge.dec();
      try {
        const playerInfo = getPlayerBySocket(socket.id);
        if (playerInfo) {
          await db
            .update(players)
            .set({ isConnected: false, socketId: null })
            .where(eq(players.id, playerInfo.playerId));

          const [player] = await db
            .select()
            .from(players)
            .where(eq(players.id, playerInfo.playerId));

          const session = getActiveSession(playerInfo.sessionId);
          if (session) {
            session.totalConnectedPlayers = await getLiveConnectedPlayerCount(
              io,
              playerInfo.sessionId
            );
            if (
              session.timer &&
              session.answeredPlayerIds.size > 0 &&
              session.answeredPlayerIds.size >= session.totalConnectedPlayers
            ) {
              clearTimeout(session.timer);
              session.timer = null;
              cancelTimer(session.sessionId);
              await handleTimeUp(io, session);
            }
          }

          if (player) {
            io.to(`session:${playerInfo.sessionId}`).emit(
              "lobby:player-left",
              {
                playerId: playerInfo.playerId,
                nickname: player.nickname,
                playerCount: session?.totalConnectedPlayers ?? 0,
              }
            );
          }

          removePlayerSocket(socket.id);
          logger.socket.debug(`Player disconnected: ${socket.id}`);
          return;
        }

        const adminSession = getActiveSessionByAdminSocket(socket.id);
        if (adminSession) {
          updateAdminSocket(adminSession, "");
          io.to(`session:${adminSession.sessionId}`).emit(
            "session:admin-disconnected"
          );
          logger.socket.info(
            `Admin disconnected from session ${adminSession.sessionId}`
          );
        }
      } catch (err) {
        logger.socket.error("disconnect error", err);
      }
    });
  });
}

async function sendNextQuestion(io: TypedServer, session: ActiveSession) {
  if (!session) return;

  if (session.timer) clearTimeout(session.timer);
  cancelTimer(session.sessionId);

  session.currentQuestionIndex++;
  session.answeredPlayerIds.clear();
  session.choiceCounts = {};
  session.pendingAnswers.clear();
  redisClearAnswered(session.sessionId);

  if (session.currentQuestionIndex >= session.questions.length) {
    await endQuiz(io, session.sessionId);
    return;
  }

  const question = session.questions[session.currentQuestionIndex];
  session.questionStartTime = Date.now();
  syncSessionMeta(session);

  session.totalConnectedPlayers = await getLiveConnectedPlayerCount(
    io,
    session.sessionId
  );

  await db
    .update(quizSessions)
    .set({ currentQuestionIndex: session.currentQuestionIndex })
    .where(eq(quizSessions.id, session.sessionId));

  const publicChoices =
    question.questionType === "text_input" ? [] : question.choices;

  const questionStartPayload = {
    question: {
      id: question.id,
      questionText: question.questionText,
      questionType: question.questionType,
      timeLimitSeconds: question.timeLimitSeconds,
      basePoints: question.basePoints,
      deductionPoints: question.deductionPoints,
      deductionInterval: question.deductionInterval,
      mediaUrl: question.mediaUrl,
      backgroundUrl: question.backgroundUrl,
      choices: publicChoices,
    },
    questionNumber: session.currentQuestionIndex + 1,
    totalQuestions: session.questions.length,
    serverStartTime: session.questionStartTime,
  };

  io.to(`session:${session.sessionId}`).emit("game:question-start", questionStartPayload);

  const directTargetSocketsRaw = (await db
    .select({
      socketId: players.socketId,
    })
    .from(players)
    .where(and(eq(players.sessionId, session.sessionId), eq(players.isConnected, true))))
    .map((row) => row.socketId);

  const directTargetSockets = directTargetSocketsRaw.filter(
    (socketId): socketId is string =>
      typeof socketId === "string" && io.sockets.sockets.has(socketId)
  );

  Array.from(new Set(directTargetSockets)).forEach((socketId) => {
    io.to(socketId).emit("game:question-start", questionStartPayload);
  });

  logger.socket.info(`Question ${session.currentQuestionIndex + 1}/${session.questions.length} sent for session ${session.sessionId}`);

  const durationMs = question.timeLimitSeconds * 1000;
  session.timer = setTimeout(() => {
    handleTimeUp(io, session);
  }, durationMs);

  // Schedule a distributed backup timer in Redis (fires if this pod dies)
  scheduleTimer(session.sessionId, durationMs);
}

async function handleTimeUp(io: TypedServer, session: ActiveSession) {
  if (!session) return;

  const currentQ = getCurrentQuestion(session);
  if (!currentQ) return;

  // Mark question timer as finished so rejoin phase resolves to leaderboard/stats flow.
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  cancelTimer(session.sessionId);

  io.to(`session:${session.sessionId}`).emit("game:time-up");

  const allPlayersInSession = await db
    .select()
    .from(players)
    .where(eq(players.sessionId, session.sessionId));

  const connectedSocketByPlayerId = new Map<number, string>(
    allPlayersInSession
      .filter(
        (p) =>
          p.isConnected &&
          Boolean(p.socketId) &&
          io.sockets.sockets.has(p.socketId as string)
      )
      .map((p) => [p.id, p.socketId as string])
  );
  const roomSocketByPlayerId = getActivePlayerSocketMap(io, session.sessionId);

  // Send batch results to each player who answered
  for (const [, answer] of Array.from(session.pendingAnswers)) {
    const playerAnswerDisplay = buildPlayerAnswerDisplay(currentQ, answer);

    const targetSocketId =
      roomSocketByPlayerId.get(answer.playerId) ||
      connectedSocketByPlayerId.get(answer.playerId) ||
      answer.socketId;
    if (!targetSocketId) continue;

    io.to(targetSocketId).emit("game:batch-results", {
      questionId: currentQ.id,
      isCorrect: answer.isCorrect,
      pointsAwarded: answer.points,
      streakBonus: answer.streakBonus,
      totalScore: answer.totalScore,
      correctChoiceId: currentQ.correctChoiceId,
      correctChoiceIds: currentQ.correctChoiceIds,
      streak: answer.streak,
      playerAnswer: playerAnswerDisplay,
      correctAnswerText: buildCorrectAnswerText(currentQ),
    });
  }

  // Send empty result to unanswered players
  for (const p of allPlayersInSession) {
    const targetSocketId =
      roomSocketByPlayerId.get(p.id) ||
      (p.socketId && io.sockets.sockets.has(p.socketId) ? p.socketId : null);
    if (!session.answeredPlayerIds.has(p.id) && targetSocketId) {
      io.to(targetSocketId).emit("game:batch-results", {
        questionId: currentQ.id,
        isCorrect: false,
        pointsAwarded: 0,
        streakBonus: 0,
        totalScore: p.totalScore,
        correctChoiceId: currentQ.correctChoiceId,
        correctChoiceIds: currentQ.correctChoiceIds,
        streak: 0,
        playerAnswer: null,
        correctAnswerText: buildCorrectAnswerText(currentQ),
      });
      session.playerStreaks.set(p.id, 0);
    }
  }

  // Build stats for admin
  const correctCount = Array.from(session.pendingAnswers.values()).filter(
    (answer) => answer.isCorrect
  ).length;

  const playerById = new Map<
    number,
    { playerId: number; nickname: string; avatar: string }
  >(
    allPlayersInSession.map((p) => [
      p.id,
      { playerId: p.id, nickname: p.nickname, avatar: p.avatar || "🎮" },
    ])
  );

  const choiceTextById = new Map(
    currentQ.choices.map((c) => [Number(c.id), c.choiceText] as const)
  );

  const choiceSelectionBuckets = new Map<
    number,
    {
      choiceId: number;
      choiceText: string;
      players: { playerId: number; nickname: string; avatar: string }[];
    }
  >(
    currentQ.choices.map((c) => [
      Number(c.id),
      { choiceId: Number(c.id), choiceText: c.choiceText, players: [] },
    ])
  );

  const answeredPlayers = Array.from(session.pendingAnswers.entries()).map(
    ([playerId, answer]) => {
      const player = playerById.get(playerId) ?? {
        playerId,
        nickname: `Player ${playerId}`,
        avatar: "🎮",
      };

      const selectedChoiceIds = Array.from(
        new Set(
          [
            ...(answer.choiceId ? [Number(answer.choiceId)] : []),
            ...answer.choiceIds.map((id) => Number(id)),
            ...answer.orderedChoiceIds.map((id) => Number(id)),
          ].filter((id) => Number.isInteger(id))
        )
      );

      for (const cid of selectedChoiceIds) {
        const bucket = choiceSelectionBuckets.get(cid);
        if (bucket) bucket.players.push(player);
      }

      const selectedChoiceTexts = selectedChoiceIds
        .map((cid) => choiceTextById.get(cid))
        .filter((text): text is string => Boolean(text));

      const orderedChoiceTexts = answer.orderedChoiceIds
        .map((cid) => choiceTextById.get(cid))
        .filter((text): text is string => Boolean(text));

      return {
        ...player,
        selectedChoiceIds,
        selectedChoiceTexts,
        orderedChoiceTexts,
        textAnswer: answer.textAnswer || null,
        isCorrect: answer.isCorrect,
      };
    }
  );

  const unansweredPlayers = allPlayersInSession
    .filter((p) => !session.pendingAnswers.has(p.id))
    .map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      avatar: p.avatar || "🎮",
    }));

  const choiceSelections = Array.from(choiceSelectionBuckets.values()).map(
    (bucket) => ({
      choiceId: bucket.choiceId,
      choiceText: bucket.choiceText,
      count: bucket.players.length,
      players: bucket.players,
    })
  );

  if (session.adminSocketId) {
    io.to(session.adminSocketId).emit("game:question-stats", {
      choiceSelections,
      unansweredPlayers,
      answeredPlayers,
      choiceCounts: session.choiceCounts,
      correctChoiceId: currentQ.correctChoiceId,
      correctChoiceIds: currentQ.correctChoiceIds,
      totalPlayers: allPlayersInSession.length,
      correctCount,
      answeredCount: answeredPlayers.length,
      questionNumber: session.currentQuestionIndex + 1,
      totalQuestions: session.questions.length,
      remainingQuestions:
        session.questions.length - (session.currentQuestionIndex + 1),
    });
  }

  await sendLeaderboard(io, session);
}

async function sendLeaderboard(io: TypedServer, session: ActiveSession) {
  if (!session) return;

  const allPlayers = await db
    .select()
    .from(players)
    .where(eq(players.sessionId, session.sessionId))
    .orderBy(desc(players.totalScore));

  const rankings: PlayerRanking[] = allPlayers.map((p, i: number) => ({
    playerId: p.id,
    nickname: p.nickname,
    avatar: p.avatar || "🎮",
    totalScore: p.totalScore,
    rank: i + 1,
    streak: session.playerStreaks.get(p.id) || 0,
  }));

  io.to(`session:${session.sessionId}`).emit("game:leaderboard", {
    rankings,
  });

  for (const player of allPlayers) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit("game:leaderboard", { rankings });
  }
}

async function endQuiz(io: TypedServer, sessionId: number) {
  const session = getActiveSession(sessionId);

  await db
    .update(quizSessions)
    .set({ status: "completed", completedAt: nowSql })
    .where(eq(quizSessions.id, sessionId));

  if (session) {
    const allPlayers = await db
      .select()
      .from(players)
      .where(eq(players.sessionId, sessionId))
      .orderBy(desc(players.totalScore));

    const finalRankings: PlayerRanking[] = allPlayers.map((p, i: number) => ({
      playerId: p.id,
      nickname: p.nickname,
      avatar: p.avatar || "🎮",
      totalScore: p.totalScore,
      rank: i + 1,
    }));

    io.to(`session:${sessionId}`).emit("game:quiz-ended", {
      finalRankings,
    });

    if (session.timer) clearTimeout(session.timer);
    cancelTimer(sessionId);
    removeActiveSession(sessionId);
    resetAvatars();

    gameSessionsGauge.dec();
    gamePlayersGauge.dec(finalRankings.length);
    logger.socket.info(`Quiz ended for session ${sessionId}, ${finalRankings.length} players`);
  }
}

/**
 * Called by the distributed timer worker when a Redis timer expires.
 * Acts as a fallback — if the in-process setTimeout already fired,
 * handleTimeUp is a no-op (session.timer === null, question already advanced).
 */
export function handleTimerExpiry(sessionId: number): void {
  if (!_io) return;
  const session = getActiveSession(sessionId);
  if (!session) return;

  // If the in-process timer already fired, session.timer is null → skip
  if (!session.timer) return;

  clearTimeout(session.timer);
  session.timer = null;

  logger.socket.info(`Distributed timer fired for session ${sessionId} (in-process timer was stale)`);
  handleTimeUp(_io, session);
}

