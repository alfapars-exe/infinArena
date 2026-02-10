import type { QuestionPayload } from "@/types";

interface QuestionWithAnswer extends QuestionPayload {
  correctChoiceId: number;
  correctChoiceIds: number[];
  correctOrderChoiceIds: number[];
  acceptedAnswers: string[];
  basePoints: number;
  deductionPoints: number;
  deductionInterval: number;
}

export interface PlayerAnswer {
  playerId: number;
  socketId: string;
  choiceId: number | null;
  choiceIds: number[];
  orderedChoiceIds: number[];
  textAnswer: string;
  isCorrect: boolean;
  points: number;
  streakBonus: number;
  totalScore: number;
  streak: number;
  responseTimeMs: number;
}

export interface ActiveSession {
  sessionId: number;
  pin: string;
  adminSocketId: string;
  currentQuestionIndex: number;
  questionStartTime: number;
  questions: QuestionWithAnswer[];
  timer: ReturnType<typeof setTimeout> | null;
  answeredPlayerIds: Set<number>;
  choiceCounts: Record<number, number>;
  totalConnectedPlayers: number;
  // Batch answer storage - results sent after time-up or all answered
  pendingAnswers: Map<number, PlayerAnswer>;
  // Streak tracking per player
  playerStreaks: Map<number, number>;
}

const activeSessions = new Map<number, ActiveSession>();
const pinToSession = new Map<string, number>();
const socketToPlayer = new Map<
  string,
  { playerId: number; sessionId: number }
>();

export function createActiveSession(
  sessionId: number,
  pin: string,
  adminSocketId: string,
  questions: QuestionWithAnswer[]
): ActiveSession {
  const session: ActiveSession = {
    sessionId,
    pin,
    adminSocketId,
    currentQuestionIndex: -1,
    questionStartTime: 0,
    questions,
    timer: null,
    answeredPlayerIds: new Set(),
    choiceCounts: {},
    totalConnectedPlayers: 0,
    pendingAnswers: new Map(),
    playerStreaks: new Map(),
  };
  activeSessions.set(sessionId, session);
  pinToSession.set(pin, sessionId);
  return session;
}

export function getActiveSession(
  sessionId: number
): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

export function getSessionByPin(pin: string): ActiveSession | undefined {
  const sessionId = pinToSession.get(pin);
  if (sessionId === undefined) return undefined;
  return activeSessions.get(sessionId);
}

export function removeActiveSession(sessionId: number): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    if (session.timer) clearTimeout(session.timer);
    pinToSession.delete(session.pin);
    activeSessions.delete(sessionId);
  }
}

export function registerPlayerSocket(
  socketId: string,
  playerId: number,
  sessionId: number
): void {
  socketToPlayer.set(socketId, { playerId, sessionId });
}

export function getPlayerBySocket(
  socketId: string
): { playerId: number; sessionId: number } | undefined {
  return socketToPlayer.get(socketId);
}

export function removePlayerSocket(socketId: string): void {
  socketToPlayer.delete(socketId);
}

export function getCurrentQuestion(
  session: ActiveSession
): QuestionWithAnswer | undefined {
  if (
    session.currentQuestionIndex < 0 ||
    session.currentQuestionIndex >= session.questions.length
  ) {
    return undefined;
  }
  return session.questions[session.currentQuestionIndex];
}


