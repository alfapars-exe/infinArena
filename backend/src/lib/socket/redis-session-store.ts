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
import type { SessionPhase } from "@/types";

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
  sessionVersion?: number;
  phase?: SessionPhase;
  phaseStartedAt?: number;
  phaseDeadlineAt?: number | null;
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
      sessionVersion: String(meta.sessionVersion ?? 0),
      phase: meta.phase ?? "lobby",
      phaseStartedAt: String(meta.phaseStartedAt ?? 0),
      phaseDeadlineAt:
        meta.phaseDeadlineAt === null || meta.phaseDeadlineAt === undefined
          ? ""
          : String(meta.phaseDeadlineAt),
    });
    await client.expire(KEY.session(meta.sessionId), SESSION_TTL);
  } catch (err) {
    log.warn("Failed to sync session meta to Redis", err);
  }
}

export async function redisGetSessionMeta(
  sessionId: number
): Promise<SessionMeta | null> {
  if (!isRedisEnabled()) return null;
  try {
    const client = await getRedisClient();
    const raw = await client.hgetall(KEY.session(sessionId));
    if (!raw || Object.keys(raw).length === 0) {
      return null;
    }

    const parsedSessionId = Number(raw.sessionId);
    const currentQuestionIndex = Number(raw.currentQuestionIndex);
    const questionStartTime = Number(raw.questionStartTime);
    const totalConnectedPlayers = Number(raw.totalConnectedPlayers);
    const questionCount = Number(raw.questionCount);
    const sessionVersion = Number(raw.sessionVersion || 0);
    const phaseStartedAt = Number(raw.phaseStartedAt || 0);
    const phaseDeadlineAt =
      raw.phaseDeadlineAt === undefined || raw.phaseDeadlineAt === ""
        ? null
        : Number(raw.phaseDeadlineAt);

    if (
      !Number.isInteger(parsedSessionId) ||
      parsedSessionId <= 0 ||
      !Number.isInteger(currentQuestionIndex) ||
      !Number.isInteger(questionStartTime) ||
      !Number.isInteger(totalConnectedPlayers) ||
      !Number.isInteger(questionCount) ||
      !Number.isInteger(sessionVersion) ||
      !Number.isInteger(phaseStartedAt) ||
      !(phaseDeadlineAt === null || Number.isFinite(phaseDeadlineAt))
    ) {
      return null;
    }

    return {
      sessionId: parsedSessionId,
      pin: raw.pin || "",
      adminSocketId: raw.adminSocketId || "",
      currentQuestionIndex,
      questionStartTime,
      totalConnectedPlayers,
      questionCount,
      podId: raw.podId || "",
      sessionVersion,
      phase: (raw.phase as SessionPhase) || "lobby",
      phaseStartedAt,
      phaseDeadlineAt,
    };
  } catch {
    return null;
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
): Promise<boolean> {
  if (!isRedisEnabled()) return true;
  try {
    const client = await getRedisClient();
    await client.hset(KEY.streaks(sessionId), String(playerId), String(streak));
    return true;
  } catch (err) {
    log.warn("Failed to sync streak to Redis", err);
    return false;
  }
}

export async function redisGetStreaks(sessionId: number): Promise<Map<number, number>> {
  if (!isRedisEnabled()) return new Map();
  try {
    const client = await getRedisClient();
    const raw = await client.hgetall(KEY.streaks(sessionId));
    return new Map(
      Object.entries(raw)
        .map(([playerId, streak]) => [Number(playerId), Number(streak)] as const)
        .filter(
          ([playerId, streak]) =>
            Number.isInteger(playerId) && playerId > 0 && Number.isInteger(streak)
        )
    );
  } catch (err) {
    log.warn("Failed to read streaks from Redis", err);
    return new Map();
  }
}

// ---------- Choice Counts ----------

export async function redisSyncChoiceCount(
  sessionId: number,
  choiceId: number,
  count: number
): Promise<boolean> {
  if (!isRedisEnabled()) return true;
  try {
    const client = await getRedisClient();
    await client.hset(KEY.choices(sessionId), String(choiceId), String(count));
    return true;
  } catch (err) {
    log.warn("Failed to sync choice count to Redis", err);
    return false;
  }
}

export async function redisGetChoiceCounts(
  sessionId: number
): Promise<Record<number, number>> {
  if (!isRedisEnabled()) return {};
  try {
    const client = await getRedisClient();
    const raw = await client.hgetall(KEY.choices(sessionId));
    return Object.fromEntries(
      Object.entries(raw)
        .map(([choiceId, count]) => [Number(choiceId), Number(count)] as const)
        .filter(
          ([choiceId, count]) =>
            Number.isInteger(choiceId) && choiceId > 0 && Number.isInteger(count)
        )
    );
  } catch (err) {
    log.warn("Failed to read choice counts from Redis", err);
    return {};
  }
}

// ---------- Pending Answers ----------

export async function redisSyncPendingAnswer(
  sessionId: number,
  playerId: number,
  answer: PlayerAnswer
): Promise<boolean> {
  if (!isRedisEnabled()) return true;
  try {
    const client = await getRedisClient();
    await client.hset(KEY.pending(sessionId), String(playerId), JSON.stringify(answer));
    return true;
  } catch (err) {
    log.warn("Failed to sync pending answer to Redis", err);
    return false;
  }
}

export async function redisGetPendingAnswers(
  sessionId: number
): Promise<Map<number, PlayerAnswer>> {
  if (!isRedisEnabled()) return new Map();
  try {
    const client = await getRedisClient();
    const raw = await client.hgetall(KEY.pending(sessionId));
    return new Map(
      Object.entries(raw)
        .map(([playerId, answer]) => {
          try {
            const parsedPlayerId = Number(playerId);
            if (!Number.isInteger(parsedPlayerId) || parsedPlayerId <= 0) {
              return null;
            }
            return [parsedPlayerId, JSON.parse(answer) as PlayerAnswer] as const;
          } catch {
            return null;
          }
        })
        .filter(
          (entry): entry is readonly [number, PlayerAnswer] => entry !== null
        )
    );
  } catch (err) {
    log.warn("Failed to read pending answers from Redis", err);
    return new Map();
  }
}

export async function redisClearQuestionState(sessionId: number): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.del(KEY.answered(sessionId), KEY.choices(sessionId), KEY.pending(sessionId));
  } catch (err) {
    log.warn("Failed to clear question state from Redis", err);
  }
}

export { POD_ID };
