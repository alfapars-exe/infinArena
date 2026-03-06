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
    choiceCounts: {},
    totalConnectedPlayers: 1,
    pendingAnswers: new Map(),
    playerStreaks: new Map(),
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
  assert.equal(session.answeredPlayerIds.size, 0);
});

test("already answered preflight uses answer_already_answered code", () => {
  const question = __test__.normalizeLoadedQuestion(
    createQuestionRecord(),
    createChoiceRecords()
  );
  const session = createSession(question);
  session.answeredPlayerIds.add(77);

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
