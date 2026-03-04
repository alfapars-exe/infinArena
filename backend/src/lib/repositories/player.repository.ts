import { db, nowSql } from "@/lib/db";
import { players, playerAnswers } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export interface CreatePlayerData {
  sessionId: number;
  nickname: string;
  avatar: string;
  socketId: string;
}

export interface CreateAnswerData {
  playerId: number;
  questionId: number;
  sessionId: number;
  choiceId?: number | null;
  isCorrect: boolean;
  responseTimeMs: number;
  pointsAwarded: number;
}

export const playerRepository = {
  async findBySession(sessionId: number) {
    return db
      .select()
      .from(players)
      .where(eq(players.sessionId, sessionId));
  },

  async findBySessionSorted(sessionId: number) {
    return db
      .select()
      .from(players)
      .where(eq(players.sessionId, sessionId))
      .orderBy(desc(players.totalScore));
  },

  async findByNickname(sessionId: number, nickname: string) {
    const [player] = await db
      .select()
      .from(players)
      .where(and(eq(players.sessionId, sessionId), eq(players.nickname, nickname)));
    return player ?? null;
  },

  async findById(id: number) {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player ?? null;
  },

  async create(data: CreatePlayerData) {
    const [player] = await db
      .insert(players)
      .values({
        sessionId: data.sessionId,
        nickname: data.nickname,
        avatar: data.avatar,
        socketId: data.socketId,
        joinedAt: nowSql,
      })
      .returning();
    return player;
  },

  async updateSocketId(id: number, socketId: string) {
    await db
      .update(players)
      .set({ socketId, isConnected: true })
      .where(eq(players.id, id));
  },

  async updateScore(id: number, totalScore: number) {
    await db
      .update(players)
      .set({ totalScore })
      .where(eq(players.id, id));
  },

  async setConnected(id: number, isConnected: boolean) {
    await db
      .update(players)
      .set({ isConnected })
      .where(eq(players.id, id));
  },

  async createAnswer(data: CreateAnswerData) {
    const [answer] = await db
      .insert(playerAnswers)
      .values({
        playerId: data.playerId,
        questionId: data.questionId,
        sessionId: data.sessionId,
        choiceId: data.choiceId ?? null,
        isCorrect: data.isCorrect,
        responseTimeMs: data.responseTimeMs,
        pointsAwarded: data.pointsAwarded,
        answeredAt: nowSql,
      })
      .returning();
    return answer;
  },

  async createAnswersBatch(answers: CreateAnswerData[]) {
    if (answers.length === 0) return;
    await db.insert(playerAnswers).values(
      answers.map((a) => ({
        playerId: a.playerId,
        questionId: a.questionId,
        sessionId: a.sessionId,
        choiceId: a.choiceId ?? null,
        isCorrect: a.isCorrect,
        responseTimeMs: a.responseTimeMs,
        pointsAwarded: a.pointsAwarded,
        answeredAt: nowSql,
      }))
    );
  },

  async getPlayerAnswers(playerId: number) {
    return db
      .select()
      .from(playerAnswers)
      .where(eq(playerAnswers.playerId, playerId));
  },
};
