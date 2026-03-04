import Redis from "ioredis";
import { createLogger } from "@/lib/logger";

const log = createLogger("Redis");

const REDIS_URL = process.env.REDIS_URL || "";

let redisClient: Redis | null = null;
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

function createRedisClient(label: string): Redis {
  const client = REDIS_URL
    ? new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 200, 5000);
          log.warn(`${label} reconnecting, attempt ${times}, delay ${delay}ms`);
          return delay;
        },
        lazyConnect: true,
      })
    : new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 200, 5000);
          log.warn(`${label} reconnecting, attempt ${times}, delay ${delay}ms`);
          return delay;
        },
        lazyConnect: true,
      });

  client.on("connect", () => log.info(`${label} connected`));
  client.on("error", (err) => log.error(`${label} error`, err));
  client.on("close", () => log.debug(`${label} connection closed`));

  return client;
}

export function isRedisEnabled(): boolean {
  return Boolean(
    REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_ENABLED === "true"
  );
}

export async function getRedisClient(): Promise<Redis> {
  if (!redisClient) {
    redisClient = createRedisClient("Redis:main");
    await redisClient.connect();
  }
  return redisClient;
}

export async function getRedisPubSub(): Promise<{
  pub: Redis;
  sub: Redis;
}> {
  if (!redisPub) {
    redisPub = createRedisClient("Redis:pub");
    await redisPub.connect();
  }
  if (!redisSub) {
    redisSub = createRedisClient("Redis:sub");
    await redisSub.connect();
  }
  return { pub: redisPub, sub: redisSub };
}

export async function closeRedis(): Promise<void> {
  const clients = [redisClient, redisPub, redisSub].filter(Boolean) as Redis[];
  await Promise.allSettled(clients.map((c) => c.quit()));
  redisClient = null;
  redisPub = null;
  redisSub = null;
}

export async function checkRedisHealth(): Promise<{
  status: "ok" | "error" | "disabled";
  latencyMs?: number;
}> {
  if (!isRedisEnabled()) {
    return { status: "disabled" };
  }
  const start = Date.now();
  try {
    const client = await getRedisClient();
    await client.ping();
    return { status: "ok", latencyMs: Date.now() - start };
  } catch {
    return { status: "error", latencyMs: Date.now() - start };
  }
}
