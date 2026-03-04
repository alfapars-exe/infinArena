/**
 * Redis-backed session store for cross-pod session state sharing.
 *
 * Strategy:
 * - Heavy game state (questions, pending answers, timers) stays in-memory
 *   on the pod that owns the session (sticky sessions guarantee affinity).
 * - Lightweight lookup indices (PIN→sessionId, socket→player) are stored
 *   in Redis so any pod can route requests.
 * - Session metadata is synced to Redis for monitoring and pod failover.
 */

import { isRedisEnabled, getRedisClient } from "@/lib/redis";
import { createLogger } from "@/lib/logger";
import type { PlayerAnswer } from "./session-manager";

const log = createLogger("RedisSessionStore");

// Key prefixes
const KEY = {
  session: (id: number) => `session:${id}:meta`,
  pin: (pin: string) => `pin:${pin}`,
  socket: (socketId: string) => `socket:${socketId}`,
  adminSocket: (socketId: string) => `admin_socket:${socketId}`,
  streaks: (sessionId: number) => `session:${sessionId}:streaks`,
  answered: (sessionId: number) => `session:${sessionId}:answered`,
  choices: (sessionId: number) => `session:${sessionId}:choices`,
  pending: (sessionId: number) => `session:${sessionId}:pending`,
} as const;

const SESSION_TTL = 4 * 60 * 60; // 4 hours

export interface SessionMeta {
  sessionId: number;
  pin: string;
  adminSocketId: string;
  currentQuestionIndex: number;
  questionStartTime: number;
  totalConnectedPlayers: number;
  questionCount: number;
  podId: string;
}

const POD_ID = process.env.HOSTNAME || process.env.POD_NAME || `pod-${process.pid}`;

// ---------- PIN ↔ Session ----------

export async function redisSetPin(pin: string, sessionId: number): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.set(KEY.pin(pin), String(sessionId), "EX", SESSION_TTL);
  } catch (err) {
    log.warn("Failed to set PIN in Redis", err);
  }
}

export async function redisGetSessionByPin(pin: string): Promise<number | null> {
  if (!isRedisEnabled()) return null;
  try {
    const client = await getRedisClient();
    const val = await client.get(KEY.pin(pin));
    return val ? Number(val) : null;
  } catch {
    return null;
  }
}

export async function redisDeletePin(pin: string): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.del(KEY.pin(pin));
  } catch (err) {
    log.warn("Failed to delete PIN from Redis", err);
  }
}

// ---------- Socket ↔ Player ----------

export async function redisRegisterPlayerSocket(
  socketId: string,
  playerId: number,
  sessionId: number
): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.set(
      KEY.socket(socketId),
      JSON.stringify({ playerId, sessionId }),
      "EX",
      SESSION_TTL
    );
  } catch (err) {
    log.warn("Failed to register player socket in Redis", err);
  }
}

export async function redisGetPlayerBySocket(
  socketId: string
): Promise<{ playerId: number; sessionId: number } | null> {
  if (!isRedisEnabled()) return null;
  try {
    const client = await getRedisClient();
    const val = await client.get(KEY.socket(socketId));
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export async function redisRemovePlayerSocket(socketId: string): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.del(KEY.socket(socketId));
  } catch (err) {
    log.warn("Failed to remove player socket from Redis", err);
  }
}

// ---------- Admin Socket ----------

export async function redisRegisterAdminSocket(
  socketId: string,
  sessionId: number
): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.set(KEY.adminSocket(socketId), String(sessionId), "EX", SESSION_TTL);
  } catch (err) {
    log.warn("Failed to register admin socket in Redis", err);
  }
}

export async function redisRemoveAdminSocket(socketId: string): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.del(KEY.adminSocket(socketId));
  } catch (err) {
    log.warn("Failed to remove admin socket from Redis", err);
  }
}

export async function redisGetSessionByAdminSocket(socketId: string): Promise<number | null> {
  if (!isRedisEnabled()) return null;
  try {
    const client = await getRedisClient();
    const val = await client.get(KEY.adminSocket(socketId));
    return val ? Number(val) : null;
  } catch {
    return null;
  }
}

// ---------- Session Metadata ----------

export async function redisSyncSessionMeta(meta: SessionMeta): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.hmset(KEY.session(meta.sessionId), {
      sessionId: String(meta.sessionId),
      pin: meta.pin,
      adminSocketId: meta.adminSocketId,
      currentQuestionIndex: String(meta.currentQuestionIndex),
      questionStartTime: String(meta.questionStartTime),
      totalConnectedPlayers: String(meta.totalConnectedPlayers),
      questionCount: String(meta.questionCount),
      podId: meta.podId,
    });
    await client.expire(KEY.session(meta.sessionId), SESSION_TTL);
  } catch (err) {
    log.warn("Failed to sync session meta to Redis", err);
  }
}

export async function redisRemoveSession(sessionId: number): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.del(
      KEY.session(sessionId),
      KEY.streaks(sessionId),
      KEY.answered(sessionId),
      KEY.choices(sessionId),
      KEY.pending(sessionId)
    );
  } catch (err) {
    log.warn("Failed to remove session from Redis", err);
  }
}

// ---------- Streaks ----------

export async function redisSyncStreak(
  sessionId: number,
  playerId: number,
  streak: number
): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.hset(KEY.streaks(sessionId), String(playerId), String(streak));
  } catch (err) {
    log.warn("Failed to sync streak to Redis", err);
  }
}

// ---------- Answered Players ----------

export async function redisSyncAnswered(
  sessionId: number,
  playerId: number
): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.sadd(KEY.answered(sessionId), String(playerId));
  } catch (err) {
    log.warn("Failed to sync answered player to Redis", err);
  }
}

export async function redisClearAnswered(sessionId: number): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.del(KEY.answered(sessionId), KEY.choices(sessionId), KEY.pending(sessionId));
  } catch (err) {
    log.warn("Failed to clear answered data from Redis", err);
  }
}

// ---------- Choice Counts ----------

export async function redisSyncChoiceCount(
  sessionId: number,
  choiceId: number,
  count: number
): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.hset(KEY.choices(sessionId), String(choiceId), String(count));
  } catch (err) {
    log.warn("Failed to sync choice count to Redis", err);
  }
}

// ---------- Pending Answers ----------

export async function redisSyncPendingAnswer(
  sessionId: number,
  playerId: number,
  answer: PlayerAnswer
): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.hset(KEY.pending(sessionId), String(playerId), JSON.stringify(answer));
  } catch (err) {
    log.warn("Failed to sync pending answer to Redis", err);
  }
}

export { POD_ID };
