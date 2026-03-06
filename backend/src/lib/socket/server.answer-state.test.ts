import assert from "node:assert/strict";
import test from "node:test";
import type { AnswerChoiceRecord, QuestionRecord } from "@/lib/domain/quiz.types";
import type { ActiveSession } from "@/lib/socket/session-manager";
import { __test__ } from "@/lib/socket/server";

function createQuestionRecord(): QuestionRecord {
  return {
    id: "11" as unknown as number,
    quizId: "7" as unknown as number,
    questionText: "Which one is correct?",
    questionType: "multiple_choice",
    orderIndex: "0" as unknown as number,
    timeLimitSeconds: "20" as unknown as number,
    basePoints: "1000" as unknown as number,
    deductionPoints: "50" as unknown as number,
    deductionInterval: "1" as unknown as number,
    mediaUrl: null,
    backgroundUrl: null,
  };
}

function createChoiceRecords(): AnswerChoiceRecord[] {
  return [
    {
      id: "101" as unknown as number,
      questionId: "11" as unknown as number,
      choiceText: "A",
      isCorrect: false,
      orderIndex: "1" as unknown as number,
    },
    {
      id: "102" as unknown as number,
      questionId: "11" as unknown as number,
      choiceText: "B",
      isCorrect: true,
      orderIndex: "0" as unknown as number,
    },
  ];
}

function createSession(question: ActiveSession["questions"][number]): ActiveSession {
  return {
    sessionId: 33,
    pin: "123456",
    adminSocketId: "admin-1",
    currentQuestionIndex: 0,
    questionStartTime: Date.now(),
    questions: [question],
    timer: {} as ReturnType<typeof setTimeout>,
    answeredPlayerIds: new Set<number>(),
    processingPlayerIds: new Set<number>(),
    choiceCounts: {},
    totalConnectedPlayers: 1,
    totalParticipants: 1,
    pendingAnswers: new Map(),
    playerStreaks: new Map(),
  };
}

function createPendingAnswer(
  playerId: number
): ActiveSession["pendingAnswers"] extends Map<number, infer TValue>
  ? TValue
  : never {
  return {
    playerId,
    socketId: "socket-1",
    choiceId: 102,
    choiceIds: [],
    orderedChoiceIds: [],
    textAnswer: "",
    isCorrect: true,
    points: 1000,
    streakBonus: 0,
    totalScore: 1000,
    streak: 1,
    responseTimeMs: 500,
  };
}

test("normalizeLoadedQuestion coerces numeric DB values to numbers", () => {
  const normalized = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );

  assert.equal(typeof normalized.id, "number");
  assert.equal(typeof normalized.timeLimitSeconds, "number");
  assert.equal(typeof normalized.basePoints, "number");
  assert.equal(typeof normalized.deductionPoints, "number");
  assert.equal(typeof normalized.deductionInterval, "number");
  assert.ok(normalized.choices.every((choice) => typeof choice.id === "number"));
  assert.ok(
    normalized.choices.every((choice) => typeof choice.orderIndex === "number")
  );
  assert.deepEqual(normalized.correctChoiceIds, [102]);
  assert.deepEqual(normalized.correctOrderChoiceIds, [102, 101]);
});

test("invalid answer preflight does not mutate answered players and returns validation code", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);

  const result = __test__.preflightPlayerAnswerSubmission(session, question, 77, {
    questionId: question.id,
    choiceIds: [],
    orderedChoiceIds: [],
    textAnswer: "",
    responseTimeMs: 1200,
  });

  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.equal(result.error.code, "answer_validation_failed");
  assert.equal(session.pendingAnswers.size, 0);
  assert.equal(session.processingPlayerIds.size, 0);
});

test("already answered preflight uses pendingAnswers as the single accepted-answer source", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);
  session.pendingAnswers.set(77, createPendingAnswer(77));
  __test__.syncAnsweredPlayersFromPendingAnswers(session);

  const result = __test__.preflightPlayerAnswerSubmission(session, question, 77, {
    questionId: question.id,
    choiceId: 102,
    choiceIds: [],
    orderedChoiceIds: [],
    textAnswer: "",
    responseTimeMs: 400,
  });

  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.equal(result.error.code, "answer_already_answered");
  assert.equal(result.error.message, "Already answered");
});

test("processing answer preflight also blocks duplicate submits", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);
  session.processingPlayerIds.add(77);

  const result = __test__.preflightPlayerAnswerSubmission(session, question, 77, {
    questionId: question.id,
    choiceId: 102,
    choiceIds: [],
    orderedChoiceIds: [],
    textAnswer: "",
    responseTimeMs: 400,
  });

  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.equal(result.error.code, "answer_already_answered");
});

test("resetQuestionRuntimeState clears accepted answers, processing locks, and choice counts", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);
  session.pendingAnswers.set(77, createPendingAnswer(77));
  session.processingPlayerIds.add(77);
  session.choiceCounts = { 102: 3 };
  __test__.syncAnsweredPlayersFromPendingAnswers(session);

  __test__.resetQuestionRuntimeState(session);

  assert.equal(session.pendingAnswers.size, 0);
  assert.equal(session.processingPlayerIds.size, 0);
  assert.deepEqual(session.choiceCounts, {});
  assert.equal(session.answeredPlayerIds.size, 0);
});

test("stale answer preflight returns resync question-start payload instead of socket error", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);

  const result = __test__.preflightPlayerAnswerSubmission(session, question, 77, {
    questionId: question.id - 1,
    choiceId: 102,
    choiceIds: [],
    orderedChoiceIds: [],
    textAnswer: "",
    responseTimeMs: 400,
  });

  assert.equal(result.kind, "resync");
  if (result.kind !== "resync") return;
  assert.equal(result.event, "game:question-start");
  assert.equal(result.payload.question.id, question.id);
  assert.equal(result.payload.serverStartTime, session.questionStartTime);
});

test("buildPlayerRejoinSnapshot returns active question metadata while the timer is running", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);

  const snapshot = __test__.buildPlayerRejoinSnapshot(
    session,
    77,
    "in_progress"
  );

  assert.equal(snapshot.phase, "question");
  assert.equal(snapshot.phaseQuestionId, question.id);
  assert.equal(
    snapshot.phaseQuestionServerStartTime,
    session.questionStartTime
  );
});

test("buildPlayerRejoinSnapshot returns leaderboard metadata after time-up", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);
  session.timer = null;
  session.pendingAnswers.set(77, createPendingAnswer(77));

  const snapshot = __test__.buildPlayerRejoinSnapshot(
    session,
    77,
    "in_progress"
  );

  assert.equal(snapshot.phase, "leaderboard");
  assert.equal(snapshot.phaseQuestionId, question.id);
  assert.equal(
    snapshot.phaseQuestionServerStartTime,
    session.questionStartTime
  );
});

test("buildPlayerRejoinSnapshot returns null question metadata outside active gameplay", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);

  const lobbySnapshot = __test__.buildPlayerRejoinSnapshot(session, 77, "lobby");
  assert.equal(lobbySnapshot.phase, "lobby");
  assert.equal(lobbySnapshot.phaseQuestionId, null);
  assert.equal(lobbySnapshot.phaseQuestionServerStartTime, null);

  const endedSnapshot = __test__.buildPlayerRejoinSnapshot(
    session,
    77,
    "completed"
  );
  assert.equal(endedSnapshot.phase, "ended");
  assert.equal(endedSnapshot.phaseQuestionId, null);
  assert.equal(endedSnapshot.phaseQuestionServerStartTime, null);
});

test("mergeAuthoritativeQuestionRuntimeState hydrates accepted answers and derived choice counts", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);
  const authoritativePendingAnswers = new Map<number, ReturnType<typeof createPendingAnswer>>([
    [77, createPendingAnswer(77)],
  ]);
  const authoritativeStreaks = new Map<number, number>([[77, 4]]);

  __test__.mergeAuthoritativeQuestionRuntimeState(
    session,
    question,
    authoritativePendingAnswers,
    authoritativeStreaks
  );

  assert.equal(session.pendingAnswers.size, 1);
  assert.equal(session.pendingAnswers.get(77)?.isCorrect, true);
  assert.equal(session.answeredPlayerIds.has(77), true);
  assert.deepEqual(session.choiceCounts, { 102: 1 });
  assert.equal(session.playerStreaks.get(77), 4);
});

test("buildChoiceCountsFromPendingAnswers counts multi-select unique picks once per player", () => {
  const question = {
    ...__test__.normalizeLoadedQuestion(createQuestionRecord(), createChoiceRecords()),
    questionType: "multi_select" as const,
    correctChoiceIds: [101, 102],
  };

  const pendingAnswers = new Map<number, ReturnType<typeof createPendingAnswer>>([
    [
      77,
      {
        ...createPendingAnswer(77),
        choiceId: 101,
        choiceIds: [101, 102, 102],
      },
    ],
  ]);

  const counts = __test__.buildChoiceCountsFromPendingAnswers(
    question,
    pendingAnswers
  );

  assert.deepEqual(counts, { 101: 1, 102: 1 });
});
