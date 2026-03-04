/**
 * Distributed Timer Worker
 *
 * Replaces in-process setTimeout for question timers with a Redis sorted set.
 * This enables timer persistence across pod restarts and ensures timers fire
 * even if the original pod dies.
 *
 * Design:
 * - Timers stored in Redis sorted set: score = expiry timestamp (ms)
 * - A single worker polls every 500ms for expired timers
 * - Leader election via Redis SETNX ensures only one pod runs the worker
 * - When a timer fires, a Pub/Sub message notifies the session-owning pod
 */

import { isRedisEnabled, getRedisClient } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("TimerWorker");

const TIMER_QUEUE_KEY = "timer:queue";
const TIMER_DATA_KEY = "timer:data";
const LEADER_KEY = "timer:leader";
const LEADER_TTL_SECONDS = 10;
const POLL_INTERVAL_MS = 500;
const TIMER_CHANNEL = "timer:expired";

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let onTimerExpired: ((sessionId: number) => void) | null = null;

export interface TimerEntry {
  sessionId: number;
  expiresAt: number; // Unix timestamp in ms
}

/**
 * Schedule a timer for a session's question.
 */
export async function scheduleTimer(
  sessionId: number,
  durationMs: number
): Promise<void> {
  if (!isRedisEnabled()) return;
  const expiresAt = Date.now() + durationMs;
  try {
    const client = await getRedisClient();
    await client.zadd(TIMER_QUEUE_KEY, expiresAt, String(sessionId));
    await client.hset(TIMER_DATA_KEY, String(sessionId), JSON.stringify({ sessionId, expiresAt }));
  } catch (err) {
    log.warn("Failed to schedule timer in Redis", err);
  }
}

/**
 * Cancel a timer for a session (e.g., all players answered early).
 */
export async function cancelTimer(sessionId: number): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const client = await getRedisClient();
    await client.zrem(TIMER_QUEUE_KEY, String(sessionId));
    await client.hdel(TIMER_DATA_KEY, String(sessionId));
  } catch (err) {
    log.warn("Failed to cancel timer in Redis", err);
  }
}

/**
 * Try to acquire leadership for the timer worker.
 */
async function tryAcquireLeadership(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const podId = process.env.HOSTNAME || `pod-${process.pid}`;
    const result = await client.set(LEADER_KEY, podId, "EX", LEADER_TTL_SECONDS, "NX");
    if (result === "OK") return true;

    // Renew if we're already the leader
    const currentLeader = await client.get(LEADER_KEY);
    if (currentLeader === podId) {
      await client.expire(LEADER_KEY, LEADER_TTL_SECONDS);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Poll for expired timers and publish events.
 */
async function pollExpiredTimers(): Promise<void> {
  if (!await tryAcquireLeadership()) return;

  try {
    const client = await getRedisClient();
    const now = Date.now();

    // Get all expired timers
    const expired = await client.zrangebyscore(TIMER_QUEUE_KEY, 0, now);
    if (expired.length === 0) return;

    // Remove them atomically
    await client.zremrangebyscore(TIMER_QUEUE_KEY, 0, now);

    for (const sessionIdStr of expired) {
      const sessionId = Number(sessionIdStr);
      await client.hdel(TIMER_DATA_KEY, sessionIdStr);

      // Publish to all pods
      await client.publish(TIMER_CHANNEL, JSON.stringify({ sessionId }));
      log.debug(`Timer expired for session ${sessionId}`);
    }
  } catch (err) {
    log.error("Error polling expired timers", err);
  }
}

/**
 * Subscribe to timer expiry events from Redis Pub/Sub.
 */
async function subscribeToTimerEvents(): Promise<void> {
  if (!isRedisEnabled()) return;

  try {
    // Use a separate subscriber connection
    const { default: Redis } = await import("ioredis");
    const redisUrl = process.env.REDIS_URL;
    const sub = redisUrl
      ? new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true })
      : new Redis({
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: Number(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });

    await sub.connect();

    sub.on("message", (_channel: string, message: string) => {
      try {
        const { sessionId } = JSON.parse(message);
        if (onTimerExpired && typeof sessionId === "number") {
          onTimerExpired(sessionId);
        }
      } catch (err) {
        log.error("Failed to handle timer event", err);
      }
    });

    await sub.subscribe(TIMER_CHANNEL);
    log.info("Subscribed to timer expiry events");
  } catch (err) {
    log.warn("Failed to subscribe to timer events", err);
  }
}

/**
 * Start the timer worker.
 * @param handler - Called when a timer expires for a session
 */
export async function startTimerWorker(
  handler: (sessionId: number) => void
): Promise<void> {
  if (isRunning) return;
  if (!isRedisEnabled()) {
    log.info("Redis not available, timer worker disabled (using in-process setTimeout)");
    return;
  }

  onTimerExpired = handler;
  isRunning = true;

  // Subscribe to Pub/Sub for timer events
  await subscribeToTimerEvents();

  // Start polling loop
  pollTimer = setInterval(async () => {
    try {
      await pollExpiredTimers();
    } catch (err) {
      log.error("Timer poll loop error", err);
    }
  }, POLL_INTERVAL_MS);

  log.info("Timer worker started");
}

/**
 * Stop the timer worker.
 */
export function stopTimerWorker(): void {
  if (!isRunning) return;
  isRunning = false;
  onTimerExpired = null;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  log.info("Timer worker stopped");
}
