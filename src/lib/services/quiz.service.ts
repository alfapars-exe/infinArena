import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import type {
  QuestionType,
  QuestionWithChoices,
  QuizSummary,
  QuizWithQuestions,
} from "@/lib/domain/quiz.types";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { generateUniquePin } from "@/lib/pin-generator";
import { quizRepository } from "@/lib/repositories/quiz.repository";
import { sessionRepository } from "@/lib/repositories/session.repository";
import { questionSchema, quizSchema } from "@/lib/validators";
import { ensureDbMigrations } from "@/lib/db/migrations";

type ParsedQuizInput = z.infer<typeof quizSchema>;
type ParsedQuestionInput = z.infer<typeof questionSchema>;

function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function normalizeQuestionType(value: unknown): QuestionType {
  switch (value) {
    case "multiple_choice":
    case "true_false":
    case "multi_select":
    case "text_input":
    case "ordering":
      return value;
    default:
      return "multiple_choice";
  }
}

function normalizeChoiceFlags(
  questionType: QuestionType,
  rawChoices: Array<{ choiceText: string; isCorrect: unknown; orderIndex: number }>
) {
  const choices = rawChoices.map((choice, index) => ({
    choiceText: choice.choiceText,
    isCorrect: coerceBoolean(choice.isCorrect),
    orderIndex: index,
  }));

  if (choices.length === 0) return choices;

  if (questionType === "text_input" || questionType === "ordering") {
    return choices.map((choice) => ({ ...choice, isCorrect: true }));
  }

  if (questionType === "multiple_choice" || questionType === "true_false") {
    const firstCorrectIndex = choices.findIndex((choice) => choice.isCorrect);
    const activeIndex = firstCorrectIndex >= 0 ? firstCorrectIndex : 0;
    return choices.map((choice, index) => ({
      ...choice,
      isCorrect: index === activeIndex,
    }));
  }

  const hasAtLeastOneCorrect = choices.some((choice) => choice.isCorrect);
  if (hasAtLeastOneCorrect) return choices;

  return choices.map((choice, index) => ({
    ...choice,
    isCorrect: index === 0,
  }));
}

export async function resolveAdminId(session: {
  user?: { id?: string; email?: string | null };
}): Promise<number | null> {
  const rawId = session.user?.id;
  if (rawId) {
    const parsedId = Number.parseInt(rawId, 10);
    if (!Number.isNaN(parsedId)) return parsedId;
  }

  const email = session.user?.email;
  if (!email) return null;

  const [adminByEmail] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, email));

  return adminByEmail?.id ?? null;
}

export async function getAllQuizzes(adminId: number): Promise<QuizSummary[]> {
  await ensureDbMigrations();

  const allQuizzes = await quizRepository.findAllByAdmin(adminId);
  const quizIds = allQuizzes.map((quiz) => quiz.id);
  const questionCountByQuizId = await quizRepository.getQuestionCountsByQuizIds(quizIds);

  return allQuizzes.map((quiz) => ({
    ...quiz,
    questionCount: questionCountByQuizId.get(quiz.id) ?? 0,
  }));
}

export async function getQuizWithQuestions(quizId: number): Promise<QuizWithQuestions> {
  await ensureDbMigrations();

  const quiz = await quizRepository.findWithQuestions(quizId);
  if (!quiz) throw new NotFoundError("Quiz", quizId);

  const repairedQuestions: QuestionWithChoices[] = quiz.questions.map((question) => {
    if (!question.id || question.choices.length === 0) {
      return question;
    }

    const questionType = normalizeQuestionType(question.questionType);
    const normalized = normalizeChoiceFlags(
      questionType,
      question.choices.map((choice, index) => ({
        choiceText: String(choice.choiceText ?? ""),
        isCorrect: choice.isCorrect,
        orderIndex: Number.isInteger(choice.orderIndex) ? choice.orderIndex : index,
      }))
    );

    return {
      ...question,
      questionType,
      choices: question.choices.map((choice, index) => ({
        ...choice,
        isCorrect: normalized[index]?.isCorrect ?? coerceBoolean(choice.isCorrect),
        orderIndex: index,
      })),
    };
  });

  return { ...quiz, questions: repairedQuestions };
}

export async function createQuiz(adminId: number, data: unknown) {
  await ensureDbMigrations();

  const parsed = quizSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid quiz data", parsed.error.errors);
  }

  const payload: ParsedQuizInput = parsed.data;
  return quizRepository.create({
    adminId,
    title: payload.title,
    description: payload.description || null,
    customSlug: payload.customSlug || null,
  });
}

export async function updateQuiz(quizId: number, data: unknown) {
  const parsed = quizSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid quiz data", parsed.error.errors);
  }

  const payload: ParsedQuizInput = parsed.data;
  return quizRepository.update(quizId, {
    title: payload.title,
    description: payload.description || null,
    customSlug: payload.customSlug || null,
  });
}

export async function deleteQuiz(quizId: number): Promise<void> {
  await ensureDbMigrations();
  await quizRepository.delete(quizId);
}

export async function addQuestion(quizId: number, data: unknown) {
  await ensureDbMigrations();

  const parsed = questionSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid question data", parsed.error.errors);
  }

  const payload: ParsedQuestionInput = parsed.data;
  const requiresCorrectChoice =
    payload.questionType === "multiple_choice" ||
    payload.questionType === "true_false" ||
    payload.questionType === "multi_select";

  if (requiresCorrectChoice && !payload.choices.some((choice) => choice.isCorrect)) {
    throw new ValidationError("At least one choice must be correct");
  }

  const existing = await quizRepository.getQuestionsByQuizId(quizId);
  const orderIndex = existing.length;

  const question = await quizRepository.createQuestion({
    quizId,
    questionText: payload.questionText,
    questionType: payload.questionType,
    orderIndex,
    timeLimitSeconds: payload.timeLimitSeconds,
    basePoints: payload.basePoints,
    deductionPoints: payload.deductionPoints,
    deductionInterval: payload.deductionInterval,
    mediaUrl: payload.mediaUrl || null,
    backgroundUrl: payload.backgroundUrl || null,
  });

  const choices = await quizRepository.createChoices(
    payload.choices.map((choice, index) => ({
      questionId: question.id,
      choiceText: choice.choiceText,
      isCorrect: choice.isCorrect,
      orderIndex: index,
    }))
  );

  return { ...question, choices };
}

export async function updateQuestion(questionId: number, data: unknown) {
  await ensureDbMigrations();

  const parsed = questionSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid question data", parsed.error.errors);
  }

  const payload: ParsedQuestionInput = parsed.data;

  await quizRepository.updateQuestion(questionId, {
    questionText: payload.questionText,
    questionType: payload.questionType,
    timeLimitSeconds: payload.timeLimitSeconds,
    basePoints: payload.basePoints,
    deductionPoints: payload.deductionPoints,
    deductionInterval: payload.deductionInterval,
    mediaUrl: payload.mediaUrl || null,
    backgroundUrl: payload.backgroundUrl || null,
  });

  await quizRepository.deleteChoicesByQuestion(questionId);

  const choices = await quizRepository.createChoices(
    payload.choices.map((choice, index) => ({
      questionId,
      choiceText: choice.choiceText,
      isCorrect: choice.isCorrect,
      orderIndex: index,
    }))
  );

  const updated = await quizRepository.getQuestionById(questionId);
  return { ...updated, choices };
}

export async function deleteQuestion(questionId: number): Promise<void> {
  await ensureDbMigrations();
  await quizRepository.deleteQuestion(questionId);
}

export async function publishQuiz(quizId: number) {
  await ensureDbMigrations();

  const quiz = await quizRepository.findById(quizId);
  if (!quiz) throw new NotFoundError("Quiz", quizId);

  const questionCount = await quizRepository.getQuestionCount(quizId);
  if (questionCount === 0) {
    throw new ValidationError("Quiz must have at least one question");
  }

  await quizRepository.update(quizId, { status: "published" });
  const pin = await generateUniquePin();
  const session = await sessionRepository.create({ quizId, pin, isLive: false });

  return { session, pin, url: `/play/${pin}` };
}

export async function getQuizResults(quizId: number) {
  await ensureDbMigrations();

  const sessions = await sessionRepository.findByQuizId(quizId);
  return Promise.all(
    sessions.map(async (session) => ({
      ...session,
      players: await sessionRepository.getSessionResults(session.id),
    }))
  );
}
