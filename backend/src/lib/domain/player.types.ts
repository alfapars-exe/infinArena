import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { playerAnswers, players } from "@/lib/db/schema";

export type PlayerRecord = InferSelectModel<typeof players>;
export type PlayerAnswerRecord = InferSelectModel<typeof playerAnswers>;

export type NewPlayerRecord = InferInsertModel<typeof players>;
export type NewPlayerAnswerRecord = InferInsertModel<typeof playerAnswers>;

export interface PlayerAnswerWithDetails extends PlayerAnswerRecord {
  questionText: string | null;
  choiceText: string;
}

export interface SessionPlayerResult extends PlayerRecord {
  answers: PlayerAnswerWithDetails[];
  correctCount: number;
  totalQuestions: number;
}

