import { Server as SocketIOServer } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerRanking,
} from "@/types";
import { db } from "@/lib/db";
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

function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  if (setA.size !== b.length) return false;
  for (const id of b) {
    if (!setA.has(id)) return false;
  }
  return true;
}

export function setupSocketHandlers(io: TypedServer) {
  void ensureDbMigrations();

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("admin:join-session", ({ sessionId }) => {
      const session = getActiveSession(sessionId);
      if (session) {
        session.adminSocketId = socket.id;
      }
      socket.join(`session:${sessionId}`);
      console.log(`Admin joined session ${sessionId}`);
    });

    // Admin makes session live (players can now join)
    socket.on("admin:start-live", async ({ sessionId }) => {
      try {
        await db
          .update(quizSessions)
          .set({ isLive: true })
          .where(eq(quizSessions.id, sessionId));

        io.to(`session:${sessionId}`).emit("session:live");
        console.log(`Session ${sessionId} is now live`);
      } catch (err) {
        console.error("admin:start-live error", err);
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

        if (!dbSession.isLive) {
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
      } catch (err) {
        console.error("player:join error", err);
        socket.emit("error", { message: "Failed to join" });
      }
    });

    // Player rejoin after disconnect/refresh
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

        // Update player connection
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

        // Determine current phase
        let phase = "lobby";
        if (dbSession.status === "in_progress") {
          phase = "question";
        } else if (dbSession.status === "completed") {
          phase = "ended";
        }

        // Update connected count
        const session = getActiveSession(dbSession.id);
        if (session) {
          const connected = await db
            .select()
            .from(players)
            .where(
              and(
                eq(players.sessionId, dbSession.id),
                eq(players.isConnected, true)
              )
            );
          session.totalConnectedPlayers = connected.length;
        }

        socket.emit("player:rejoined-success", {
          playerId: player.id,
          sessionId: dbSession.id,
          quizTitle: quiz?.title || "Quiz",
          avatar: player.avatar || "🎮",
          totalScore: player.totalScore,
          phase,
        });
      } catch (err) {
        console.error("player:rejoin error", err);
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

        const dbQuestions = await db
          .select()
          .from(questions)
          .where(eq(questions.quizId, dbSession.quizId))
          .orderBy(asc(questions.orderIndex));

        const questionsWithChoices = await Promise.all(
          dbQuestions.map(async (q) => {
            const choices = await db
              .select()
              .from(answerChoices)
              .where(eq(answerChoices.questionId, q.id))
              .orderBy(asc(answerChoices.orderIndex));

            const correctChoice = choices.find((c) => c.isCorrect);
            const correctChoiceIds = choices
              .filter((c) => c.isCorrect)
              .map((c) => c.id);
            const correctOrderChoiceIds = [...choices]
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((c) => c.id);
            const acceptedAnswers = choices.map((c) => normalizeText(c.choiceText));

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
              choices: choices.map((c) => ({
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

        const connectedPlayers = await db
          .select()
          .from(players)
          .where(
            and(
              eq(players.sessionId, sessionId),
              eq(players.isConnected, true)
            )
          );

        const activeSession = createActiveSession(
          sessionId,
          dbSession.pin,
          socket.id,
          questionsWithChoices
        );
        activeSession.totalConnectedPlayers = connectedPlayers.length;

        await db
          .update(quizSessions)
          .set({ status: "in_progress", startedAt: new Date() })
          .where(eq(quizSessions.id, sessionId));

        // 3-2-1 countdown
        for (let i = 3; i >= 1; i--) {
          io.to(`session:${sessionId}`).emit("game:countdown", { count: i });
          await sleep(1000);
        }

        await sendNextQuestion(io, activeSession);
      } catch (err) {
        console.error("admin:start-quiz error", err);
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
      try {
        const playerInfo = getPlayerBySocket(socket.id);
        if (!playerInfo) {
          socket.emit("error", { message: "Player not found" });
          return;
        }

        const session = getActiveSession(playerInfo.sessionId);
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

        if (
          currentQ.questionType === "multiple_choice" ||
          currentQ.questionType === "true_false"
        ) {
          if (!choiceId || !Number.isInteger(choiceId)) {
            socket.emit("error", { message: "Choice is required" });
            return;
          }
          persistedChoiceId = choiceId;
          isCorrect = choiceId === currentQ.correctChoiceId;
          session.choiceCounts[choiceId] = (session.choiceCounts[choiceId] || 0) + 1;
        } else if (currentQ.questionType === "multi_select") {
          if (safeChoiceIds.length === 0) {
            socket.emit("error", { message: "At least one choice is required" });
            return;
          }
          persistedChoiceId = safeChoiceIds[0] || null;
          isCorrect = sameIdSet(safeChoiceIds, currentQ.correctChoiceIds);
        } else if (currentQ.questionType === "ordering") {
          if (safeOrderedChoiceIds.length !== currentQ.correctOrderChoiceIds.length) {
            socket.emit("error", { message: "Ordering answer is incomplete" });
            return;
          }
          persistedChoiceId = safeOrderedChoiceIds[0] || null;
          isCorrect = safeOrderedChoiceIds.every(
            (id, idx) => id === currentQ.correctOrderChoiceIds[idx]
          );
        } else {
          if (!safeTextAnswer) {
            socket.emit("error", { message: "Answer text is required" });
            return;
          }
          const normalized = normalizeText(safeTextAnswer);
          isCorrect = currentQ.acceptedAnswers.includes(normalized);
          const matchedChoice = currentQ.choices.find(
            (choice) => normalizeText(choice.choiceText) === normalized
          );
          persistedChoiceId = matchedChoice?.id || null;
        }

        // Update streak
        let currentStreak = session.playerStreaks.get(playerInfo.playerId) || 0;
        if (isCorrect) {
          currentStreak++;
        } else {
          currentStreak = 0;
        }
        session.playerStreaks.set(playerInfo.playerId, currentStreak);

        // Calculate base points
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

        // Streak bonus
        let streakBonus = 0;
        if (isCorrect && currentStreak >= 5) {
          streakBonus = Math.round(points * 0.2);
        } else if (isCorrect && currentStreak >= 3) {
          streakBonus = Math.round(points * 0.1);
        }
        points += streakBonus;

        // Save to DB
        await db.insert(playerAnswers).values({
          playerId: playerInfo.playerId,
          questionId,
          sessionId: playerInfo.sessionId,
          choiceId: persistedChoiceId,
          isCorrect,
          responseTimeMs: actualResponseTime,
          pointsAwarded: points,
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

        // Store pending answer - don't send result yet
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

        // Send acknowledgment only (not the result)
        socket.emit("game:answer-ack", { received: true });

        // Check if all connected players have answered -> skip timer
        if (session.answeredPlayerIds.size >= session.totalConnectedPlayers) {
          if (session.timer) {
            clearTimeout(session.timer);
            session.timer = null;
          }
          await handleTimeUp(io, session);
        }
      } catch (err) {
        console.error("player:answer error", err);
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

          const connected = await db
            .select()
            .from(players)
            .where(
              and(
                eq(players.sessionId, playerInfo.sessionId),
                eq(players.isConnected, true)
              )
            );

          // Update connected count in active session
          const session = getActiveSession(playerInfo.sessionId);
          if (session) {
            session.totalConnectedPlayers = connected.length;
          }

          if (player) {
            io.to(`session:${playerInfo.sessionId}`).emit(
              "lobby:player-left",
              {
                playerId: playerInfo.playerId,
                nickname: player.nickname,
                playerCount: connected.length,
              }
            );
          }

          removePlayerSocket(socket.id);
        }
      } catch (err) {
        console.error("disconnect error", err);
      }
      console.log(`Socket disconnected: ${socket.id}`);
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

  // Update connected player count
  const connected = await db
    .select()
    .from(players)
    .where(
      and(
        eq(players.sessionId, session.sessionId),
        eq(players.isConnected, true)
      )
    );
  session.totalConnectedPlayers = connected.length;

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
      mediaUrl: question.mediaUrl,
      backgroundUrl: question.backgroundUrl,
      choices: publicChoices,
    },
    questionNumber: session.currentQuestionIndex + 1,
    totalQuestions: session.questions.length,
    serverStartTime: session.questionStartTime,
  });

  session.timer = setTimeout(() => {
    handleTimeUp(io, session);
  }, question.timeLimitSeconds * 1000);
}

async function handleTimeUp(io: TypedServer, session: ActiveSession) {
  if (!session) return;

  const currentQ = getCurrentQuestion(session);
  if (!currentQ) return;

  // Send time-up signal
  io.to(`session:${session.sessionId}`).emit("game:time-up");

  // Now send batch results to each player
  for (const [, answer] of Array.from(session.pendingAnswers)) {
    let playerAnswerDisplay: any = null;

    // Prepare player answer for display based on question type
    if (currentQ.questionType === "ordering") {
      // Get choice text for ordered choices
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

    io.to(answer.socketId).emit("game:batch-results", {
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

  // For players who didn't answer, send empty result
  const allPlayers = await db
    .select()
    .from(players)
    .where(
      and(
        eq(players.sessionId, session.sessionId),
        eq(players.isConnected, true)
      )
    );

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
      // Reset streak for non-answerers
      session.playerStreaks.set(p.id, 0);
    }
  }

  const correctCount = Array.from(session.pendingAnswers.values()).filter(
    (answer) => answer.isCorrect
  ).length;

  // Send stats to admin
  io.to(session.adminSocketId).emit("game:question-stats", {
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

  const allPlayers = await db
    .select()
    .from(players)
    .where(eq(players.sessionId, session.sessionId))
    .orderBy(desc(players.totalScore));

  const rankings: PlayerRanking[] = allPlayers.map((p, i) => ({
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
}

async function endQuiz(io: TypedServer, sessionId: number) {
  const session = getActiveSession(sessionId);

  await db
    .update(quizSessions)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(quizSessions.id, sessionId));

  if (session) {
    const allPlayers = await db
      .select()
      .from(players)
      .where(eq(players.sessionId, sessionId))
      .orderBy(desc(players.totalScore));

    const finalRankings: PlayerRanking[] = allPlayers.map((p, i) => ({
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
  }
}


