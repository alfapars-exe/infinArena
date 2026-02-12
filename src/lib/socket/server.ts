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
import type { AnswerChoiceRecord, QuestionRecord, QuestionType } from "@/lib/domain/quiz.types";
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
type PlayerAnswerDisplay = string[] | string | null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("tr");
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

        if (!player.isConnected || player.socketId !== socket.id) {
          await db
            .update(players)
            .set({ isConnected: true, socketId: socket.id })
            .where(eq(players.id, playerId));
        }

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
            // First send batch results for this player if they answered
            const playerAnswer = session.pendingAnswers.get(player.id);
            if (playerAnswer && currentQ) {
              let playerAnswerDisplay: PlayerAnswerDisplay = null;

              if (currentQ.questionType === "ordering") {
                const choiceTexts = playerAnswer.orderedChoiceIds
                  .map((choiceId) => {
                    const choice = currentQ.choices.find((c) => c.id === choiceId);
                    return choice?.choiceText || `Choice ${choiceId}`;
                  })
                  .filter((text) => text);
                playerAnswerDisplay = choiceTexts.length > 0 ? choiceTexts : null;
              } else if (currentQ.questionType === "text_input") {
                playerAnswerDisplay = playerAnswer.textAnswer || null;
              }

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
                correctAnswerText: currentQ.choices
                  .filter((c) => currentQ.correctChoiceIds.includes(c.id))
                  .map((c) => c.choiceText),
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

        logger.socket.debug(`Player "${nickname}" rejoined session ${dbSession.id}`);
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

        const dbQuestions: QuestionRecord[] = await db
          .select()
          .from(questions)
          .where(eq(questions.quizId, dbSession.quizId))
          .orderBy(asc(questions.orderIndex));

        const questionsWithChoices = await Promise.all(
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
            
            logger.socket.info(`[QUIZ-LOAD] Q${q.id} Type=${questionType}: Choices=[${choices.map((c) => `${c.id}(${c.isCorrect ? '✓' : '✗'})`).join(', ')}], CorrectIds=[${correctChoiceIds.join(', ')}]`);
            
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

  // Mark question timer as finished so rejoin phase resolves to leaderboard/stats flow.
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }

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
    let playerAnswerDisplay: PlayerAnswerDisplay = null;

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
      correctAnswerText: currentQ.choices
        .filter((c) => currentQ.correctChoiceIds.includes(c.id))
        .map((c) => c.choiceText),
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
    removeActiveSession(sessionId);
    resetAvatars();

    logger.socket.info(`Quiz ended for session ${sessionId}, ${finalRankings.length} players`);
  }
}
