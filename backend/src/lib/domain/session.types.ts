import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { quizSessions } from "@/lib/db/schema";

export type QuizSessionRecord = InferSelectModel<typeof quizSessions>;
export type NewQuizSessionRecord = InferInsertModel<typeof quizSessions>;

export type SessionStatus = QuizSessionRecord["status"];

export interface SessionLookupResponse {
  sessionId: number;
  status: SessionStatus;
  quizTitle: string;
  pin: string;
  isLive: boolean;
  playerCount: number;
}

export interface SessionLiveResponse {
  sessionId: number;
  pin: string;
  status: SessionStatus;
  isLive: boolean;
}
