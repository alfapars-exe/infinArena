/**
 * Answer Batch Writer
 *
 * Buffers player_answers INSERT operations in a Redis list and flushes
 * them to PostgreSQL in batches. This prevents 1000 individual INSERTs
 * from hitting the DB simultaneously during question transitions.
 *
 * When Redis is unavailable, falls back to direct DB writes.
 */

import { isRedisEnabled, getRedisClient } from "@/lib/redis";
import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { playerAnswers } from "@/lib/db/schema";

const log = createLogger("AnswerBatchWriter");

const QUEUE_KEY = "answer:queue";
const FLUSH_INTERVAL_MS = 500;
const MAX_BATCH_SIZE = 200;

interface QueuedAnswer {
  playerId: number;
  questionId: number;
  sessionId: number;
  choiceId: number | null;
  isCorrect: boolean;
  responseTimeMs: number;
  pointsAwarded: number;
  answeredAt: string; // ISO timestamp
}

let flushTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Queue an answer for batch insertion.
 * Returns true if queued to Redis, false if written directly to DB.
 */
export async function queueAnswer(answer: QueuedAnswer): Promise<boolean> {
  if (!isRedisEnabled()) {
    return false; // Caller should do direct DB insert
  }

  try {
    const client = await getRedisClient();
    await client.rpush(QUEUE_KEY, JSON.stringify(answer));
    return true;
  } catch (err) {
    log.warn("Failed to queue answer in Redis, caller should write directly", err);
    return false;
  }
}

/**
 * Flush queued answers from Redis to the database.
 */
async function flushAnswers(): Promise<number> {
  if (!isRedisEnabled()) return 0;

  let client;
  try {
    client = await getRedisClient();
  } catch {
    return 0;
  }

  // Atomically pop up to MAX_BATCH_SIZE items
  const items: string[] = [];
  for (let i = 0; i < MAX_BATCH_SIZE; i++) {
    const item = await client.lpop(QUEUE_KEY);
    if (!item) break;
    items.push(item);
  }

  if (items.length === 0) return 0;

  const answers: QueuedAnswer[] = [];
  for (const item of items) {
    try {
      answers.push(JSON.parse(item));
    } catch (err) {
      log.error("Failed to parse queued answer", err);
    }
  }

  if (answers.length === 0) return 0;

  try {
    await db.insert(playerAnswers).values(
      answers.map((a) => ({
        playerId: a.playerId,
        questionId: a.questionId,
        sessionId: a.sessionId,
        choiceId: a.choiceId,
        isCorrect: a.isCorrect,
        responseTimeMs: a.responseTimeMs,
        pointsAwarded: a.pointsAwarded,
        answeredAt: new Date(a.answeredAt),
      }))
    );
    log.debug(`Flushed ${answers.length} answers to DB`);
    return answers.length;
  } catch (err) {
    log.error(`Failed to batch insert ${answers.length} answers`, err);
    // Re-queue failed items so they aren't lost
    try {
      const pipeline = client.pipeline();
      for (const item of items) {
        pipeline.rpush(QUEUE_KEY, item);
      }
      await pipeline.exec();
      log.info(`Re-queued ${items.length} answers after batch insert failure`);
    } catch (requeueErr) {
      log.error("Failed to re-queue answers, data may be lost", requeueErr);
    }
    return 0;
  }
}

/**
 * Start the background flush loop.
 */
export function startAnswerBatchWriter(): void {
  if (isRunning) return;
  if (!isRedisEnabled()) {
    log.info("Redis not available, answer batch writer disabled (using direct writes)");
    return;
  }

  isRunning = true;
  flushTimer = setInterval(async () => {
    try {
      await flushAnswers();
    } catch (err) {
      log.error("Answer flush loop error", err);
    }
  }, FLUSH_INTERVAL_MS);

  log.info(`Answer batch writer started (interval=${FLUSH_INTERVAL_MS}ms, maxBatch=${MAX_BATCH_SIZE})`);
}

/**
 * Stop the background flush loop and drain remaining items.
 */
export async function stopAnswerBatchWriter(): Promise<void> {
  if (!isRunning) return;
  isRunning = false;

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Final drain
  let totalDrained = 0;
  let flushed: number;
  do {
    flushed = await flushAnswers();
    totalDrained += flushed;
  } while (flushed > 0);

  if (totalDrained > 0) {
    log.info(`Answer batch writer stopped, drained ${totalDrained} remaining answers`);
  } else {
    log.info("Answer batch writer stopped");
  }
}
