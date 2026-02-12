import { Server as SocketIOServer } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerRanking,
} from "@/types";
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
import { ensureDbMigrations } from "@/lib/db/migrations";
import { logger } from "@/lib/logger";
import {
  createActiveSession,
  getActiveSession,
  removeActiveSession,
  registerPlayerSocket,
  getPlayerBySocket,
  removePlayerSocket,
  getCurrentQuestion,
  type ActiveSession,
} from "./session-manager";

type TypedServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("tr");
}

async function getLiveConnectedPlayerCount(
  io: TypedServer,
  sessionId: number
): Promise<number> {
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

export function setupSocketHandlers(io: TypedServer) {
  void ensureDbMigrations();

  io.on("connection", (socket) => {
    logger.socket.debug(`Connected: ${socket.id}`);

    socket.on("admin:join-session", async ({ sessionId }) => {
      try {
        const session = getActiveSession(sessionId);
        if (session) {
          session.adminSocketId = socket.id;
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

    socket.on("admin:start-live", async ({ sessionId }) => {
      try {
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

    socket.on("player:join", async ({ pin, nickname }) => {
      try {
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

    socket.on("player:rejoin", async ({ pin, playerId, nickname }) => {
      try {
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

        const [player] = await db
          .select()
          .from(players)
          .where(
            and(
              eq(players.id, playerId),
              eq(players.sessionId, dbSession.id),
              eq(players.nickname, nickname)
            )
          );

        if (!player) {
          socket.emit("error", { message: "Player not found, join again" });
          return;
        }

        await db
          .update(players)
          .set({ isConnected: true, socketId: socket.id })
          .where(eq(players.id, playerId));

        registerPlayerSocket(socket.id, playerId, dbSession.id);
        socket.join(`session:${dbSession.id}`);

        const [quiz] = await db
          .select()
          .from(quizzes)
          .where(eq(quizzes.id, dbSession.quizId));

        const session = getActiveSession(dbSession.id);
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
            const allPlayers = (await db
              .select()
              .from(players)
              .where(eq(players.sessionId, session.sessionId))
              .orderBy(desc(players.totalScore))) as any[];

            const rankings: PlayerRanking[] = allPlayers.map(
              (p: any, i: number) => ({
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

        logger.socket.info(`Player "${nickname}" rejoined session ${dbSession.id}`);
      } catch (err) {
        logger.socket.error("player:rejoin error", err);
        socket.emit("error", { message: "Failed to rejoin" });
      }
    });

    socket.on("admin:start-quiz", async ({ sessionId }) => {
      try {
        await ensureDbMigrations();

        const [dbSession] = await db
          .select()
          .from(quizSessions)
          .where(eq(quizSessions.id, sessionId));

        if (!dbSession || dbSession.status !== "lobby") {
          socket.emit("error", { message: "Session not in lobby state" });
          return;
        }

        const dbQuestions = (await db
          .select()
          .from(questions)
          .where(eq(questions.quizId, dbSession.quizId))
          .orderBy(asc(questions.orderIndex))) as any[];

        const questionsWithChoices = await Promise.all(
          dbQuestions.map(async (q: any) => {
            const choices = (await db
              .select()
              .from(answerChoices)
              .where(eq(answerChoices.questionId, q.id))
              .orderBy(asc(answerChoices.orderIndex))) as any[];

            const correctChoice = choices.find((c: any) => c.isCorrect);
            const correctChoiceIds = choices
              .filter((c: any) => c.isCorrect)
              .map((c: any) => c.id);
            const correctOrderChoiceIds = [...choices]
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((c: any) => c.id);
            const acceptedAnswers = choices.map((c: any) => normalizeText(c.choiceText));

            return {
              id: q.id,
              questionText: q.questionText,
              questionType: q.questionType as
                | "multiple_choice"
                | "true_false"
                | "multi_select"
                | "text_input"
                | "ordering",
              timeLimitSeconds: q.timeLimitSeconds,
              mediaUrl: q.mediaUrl,
              backgroundUrl: q.backgroundUrl,
              choices: choices.map((c: any) => ({
                id: c.id,
                choiceText: c.choiceText,
                orderIndex: c.orderIndex,
              })),
              correctChoiceId: correctChoice?.id || 0,
              correctChoiceIds,
              correctOrderChoiceIds,
              acceptedAnswers,
              basePoints: q.basePoints,
              deductionPoints: q.deductionPoints,
              deductionInterval: q.deductionInterval,
            };
          })
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

    socket.on("admin:next-question", async ({ sessionId }) => {
      const session = getActiveSession(sessionId);
      if (!session) {
        socket.emit("error", { message: "No active session" });
        return;
      }
      await sendNextQuestion(io, session);
    });

    socket.on(
      "player:answer",
      async ({ questionId, choiceId, choiceIds, orderedChoiceIds, textAnswer }) => {
      let session: ActiveSession | undefined;
      try {
        const playerInfo = getPlayerBySocket(socket.id);
        if (!playerInfo) {
          socket.emit("error", { message: "Player not found" });
          return;
        }

        session = getActiveSession(playerInfo.sessionId);
        if (!session) {
          socket.emit("error", { message: "No active session" });
          return;
        }

        const currentQ = getCurrentQuestion(session);
        if (!currentQ || currentQ.id !== questionId) {
          socket.emit("error", { message: "Wrong question" });
          return;
        }

        if (session.answeredPlayerIds.has(playerInfo.playerId)) {
          socket.emit("error", { message: "Already answered" });
          return;
        }

        session.answeredPlayerIds.add(playerInfo.playerId);
        const rejectAnswer = (message: string) => {
          session?.answeredPlayerIds.delete(playerInfo.playerId);
          socket.emit("error", { message });
        };

        const serverResponseTime = Date.now() - session.questionStartTime;
        const actualResponseTime = Math.min(
          serverResponseTime,
          currentQ.timeLimitSeconds * 1000
        );
        const safeChoiceIds = Array.isArray(choiceIds)
          ? choiceIds.filter((id) => Number.isInteger(id))
          : [];
        const safeOrderedChoiceIds = Array.isArray(orderedChoiceIds)
          ? orderedChoiceIds.filter((id) => Number.isInteger(id))
          : [];
        const safeTextAnswer = typeof textAnswer === "string" ? textAnswer.trim() : "";

        let isCorrect = false;
        let persistedChoiceId: number | null = null;
        let partialRatio = 1;

        if (
          currentQ.questionType === "multiple_choice" ||
          currentQ.questionType === "true_false"
        ) {
          if (!choiceId || !Number.isInteger(choiceId)) {
            rejectAnswer("Choice is required");
            return;
          }
          persistedChoiceId = choiceId;
          isCorrect = choiceId === currentQ.correctChoiceId;
          session.choiceCounts[choiceId] = (session.choiceCounts[choiceId] || 0) + 1;
        } else if (currentQ.questionType === "multi_select") {
          if (safeChoiceIds.length === 0) {
            rejectAnswer("At least one choice is required");
            return;
          }
          persistedChoiceId = safeChoiceIds[0] || null;
          const correctSet = new Set(currentQ.correctChoiceIds);
          const selectedCorrect = safeChoiceIds.filter((id) => correctSet.has(id)).length;
          const selectedWrong = safeChoiceIds.filter((id) => !correctSet.has(id)).length;
          isCorrect = selectedCorrect > 0 && selectedWrong === 0;
          partialRatio = isCorrect ? selectedCorrect / correctSet.size : 0;
          for (const id of safeChoiceIds) {
            session.choiceCounts[id] = (session.choiceCounts[id] || 0) + 1;
          }
        } else if (currentQ.questionType === "ordering") {
          if (safeOrderedChoiceIds.length !== currentQ.correctOrderChoiceIds.length) {
            rejectAnswer("Ordering answer is incomplete");
            return;
          }
          persistedChoiceId = safeOrderedChoiceIds[0] || null;
          isCorrect = safeOrderedChoiceIds.every(
            (id, idx) => id === currentQ.correctOrderChoiceIds[idx]
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

        let currentStreak = session.playerStreaks.get(playerInfo.playerId) || 0;
        if (isCorrect) {
          currentStreak++;
        } else {
          currentStreak = 0;
        }
        session.playerStreaks.set(playerInfo.playerId, currentStreak);

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

        const [player] = await db
          .select()
          .from(players)
          .where(eq(players.id, playerInfo.playerId));

        const newTotal = (player?.totalScore || 0) + points;
        await db
          .update(players)
          .set({ totalScore: newTotal })
          .where(eq(players.id, playerInfo.playerId));

        session.pendingAnswers.set(playerInfo.playerId, {
          playerId: playerInfo.playerId,
          socketId: socket.id,
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
        });

        socket.emit("game:answer-ack", { received: true });
        session.totalConnectedPlayers = await getLiveConnectedPlayerCount(
          io,
          session.sessionId
        );

        if (session.answeredPlayerIds.size >= session.totalConnectedPlayers) {
          if (session.timer) {
            clearTimeout(session.timer);
            session.timer = null;
          }
          await handleTimeUp(io, session);
        }
      } catch (err) {
        if (session) {
          const playerInfo = getPlayerBySocket(socket.id);
          if (playerInfo) {
            session.answeredPlayerIds.delete(playerInfo.playerId);
          }
        }
        logger.socket.error("player:answer error", err);
        socket.emit("error", { message: "Failed to process answer" });
      }
      }
    );

    socket.on("admin:end-quiz", async ({ sessionId }) => {
      await endQuiz(io, sessionId);
    });

    socket.on("disconnect", async () => {
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

  session.currentQuestionIndex++;
  session.answeredPlayerIds.clear();
  session.choiceCounts = {};
  session.pendingAnswers.clear();

  if (session.currentQuestionIndex >= session.questions.length) {
    await endQuiz(io, session.sessionId);
    return;
  }

  const question = session.questions[session.currentQuestionIndex];
  session.questionStartTime = Date.now();

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

  io.to(`session:${session.sessionId}`).emit("game:question-start", {
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
  });

  logger.socket.info(`Question ${session.currentQuestionIndex + 1}/${session.questions.length} sent for session ${session.sessionId}`);

  session.timer = setTimeout(() => {
    handleTimeUp(io, session);
  }, question.timeLimitSeconds * 1000);
}

async function handleTimeUp(io: TypedServer, session: ActiveSession) {
  if (!session) return;

  const currentQ = getCurrentQuestion(session);
  if (!currentQ) return;

  io.to(`session:${session.sessionId}`).emit("game:time-up");

  const allPlayers = await db
    .select()
    .from(players)
    .where(
      and(
        eq(players.sessionId, session.sessionId),
        eq(players.isConnected, true)
      )
    );

  const connectedSocketByPlayerId = new Map<number, string>(
    allPlayers
      .filter((p: any) => Boolean(p.socketId))
      .map((p: any) => [p.id, p.socketId as string])
  );

  // Send batch results to each player who answered
  for (const [, answer] of Array.from(session.pendingAnswers)) {
    let playerAnswerDisplay: any = null;

    if (currentQ.questionType === "ordering") {
      const choiceTexts = answer.orderedChoiceIds
        .map((choiceId) => {
          const choice = currentQ.choices.find((c) => c.id === choiceId);
          return choice?.choiceText || `Choice ${choiceId}`;
        })
        .filter((text) => text);
      playerAnswerDisplay = choiceTexts.length > 0 ? choiceTexts : null;
    } else if (currentQ.questionType === "text_input") {
      playerAnswerDisplay = answer.textAnswer || null;
    }

    const targetSocketId =
      connectedSocketByPlayerId.get(answer.playerId) || answer.socketId;
    if (!targetSocketId) continue;

    io.to(targetSocketId).emit("game:batch-results", {
      isCorrect: answer.isCorrect,
      pointsAwarded: answer.points,
      streakBonus: answer.streakBonus,
      totalScore: answer.totalScore,
      correctChoiceId: currentQ.correctChoiceId,
      correctChoiceIds: currentQ.correctChoiceIds,
      streak: answer.streak,
      playerAnswer: playerAnswerDisplay,
      correctAnswerText: currentQ.choices
        .filter((c) => currentQ.correctChoiceIds.includes(c.id))
        .map((c) => c.choiceText),
    });
  }

  // Send empty result to unanswered players
  for (const p of allPlayers) {
    if (!session.answeredPlayerIds.has(p.id) && p.socketId) {
      io.to(p.socketId).emit("game:batch-results", {
        isCorrect: false,
        pointsAwarded: 0,
        streakBonus: 0,
        totalScore: p.totalScore,
        correctChoiceId: currentQ.correctChoiceId,
        correctChoiceIds: currentQ.correctChoiceIds,
        streak: 0,
        correctAnswerText: currentQ.choices
          .filter((c) => currentQ.correctChoiceIds.includes(c.id))
          .map((c) => c.choiceText),
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
    allPlayers.map((p: any) => [
      p.id,
      { playerId: p.id, nickname: p.nickname, avatar: p.avatar || "🎮" },
    ])
  );

  const choiceTextById = new Map(
    currentQ.choices.map((c) => [c.id, c.choiceText] as const)
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
      c.id,
      { choiceId: c.id, choiceText: c.choiceText, players: [] },
    ])
  );

  const answeredPlayers = Array.from(session.pendingAnswers.entries()).flatMap(
    ([playerId, answer]) => {
      const player = playerById.get(playerId);
      if (!player) return [];

      const selectedChoiceIds = Array.from(
        new Set(
          [
            ...(answer.choiceId ? [answer.choiceId] : []),
            ...answer.choiceIds,
            ...answer.orderedChoiceIds,
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

      return [
        {
          ...player,
          selectedChoiceIds,
          selectedChoiceTexts,
          orderedChoiceTexts,
          textAnswer: answer.textAnswer || null,
          isCorrect: answer.isCorrect,
        },
      ];
    }
  );

  const unansweredPlayers = allPlayers
    .filter((p: any) => !session.pendingAnswers.has(p.id))
    .map((p: any) => ({
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

  io.to(session.adminSocketId).emit("game:question-stats", {
    choiceSelections,
    unansweredPlayers,
    answeredPlayers,
    choiceCounts: session.choiceCounts,
    correctChoiceId: currentQ.correctChoiceId,
    correctChoiceIds: currentQ.correctChoiceIds,
    totalPlayers: allPlayers.length,
    correctCount,
    answeredCount: session.answeredPlayerIds.size,
    questionNumber: session.currentQuestionIndex + 1,
    totalQuestions: session.questions.length,
    remainingQuestions:
      session.questions.length - (session.currentQuestionIndex + 1),
  });

  await sendLeaderboard(io, session);
}

async function sendLeaderboard(io: TypedServer, session: ActiveSession) {
  if (!session) return;

  const allPlayers = (await db
    .select()
    .from(players)
    .where(eq(players.sessionId, session.sessionId))
    .orderBy(desc(players.totalScore))) as any[];

  const rankings: PlayerRanking[] = allPlayers.map((p: any, i: number) => ({
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

    const finalRankings: PlayerRanking[] = allPlayers.map((p: any, i: number) => ({
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
    removeActiveSession(sessionId);
    resetAvatars();

    logger.socket.info(`Quiz ended for session ${sessionId}, ${finalRankings.length} players`);
  }
}
