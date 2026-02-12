import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { answerChoices, questions, quizzes } from "@/lib/db/schema";

export type QuizRecord = InferSelectModel<typeof quizzes>;
export type QuestionRecord = InferSelectModel<typeof questions>;
export type AnswerChoiceRecord = InferSelectModel<typeof answerChoices>;

export type NewQuizRecord = InferInsertModel<typeof quizzes>;
export type NewQuestionRecord = InferInsertModel<typeof questions>;
export type NewAnswerChoiceRecord = InferInsertModel<typeof answerChoices>;

export type QuizStatus = QuizRecord["status"];
export type QuestionType = QuestionRecord["questionType"];

export interface QuestionWithChoices extends QuestionRecord {
  choices: AnswerChoiceRecord[];
}

export interface QuizWithQuestions extends QuizRecord {
  questions: QuestionWithChoices[];
}

export interface QuizSummary extends QuizRecord {
  questionCount: number;
}

