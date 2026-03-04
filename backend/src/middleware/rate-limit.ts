import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { isRedisEnabled, getRedisClient } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("RateLimit");

async function createStore() {
  if (!isRedisEnabled()) return undefined;
  try {
    const client = await getRedisClient();
    return new RedisStore({
      sendCommand: (...args: string[]) =>
        client.call(args[0], ...args.slice(1)) as any,
    });
  } catch (err) {
    log.warn("Failed to create Redis rate-limit store, using in-memory", err);
    return undefined;
  }
}

let storePromise: Promise<any> | null = null;
function getStore() {
  if (!storePromise) {
    storePromise = createStore();
  }
  return storePromise;
}

/** Login brute-force protection: 10 req / 15 min per IP */
export async function createLoginLimiter() {
  const store = await getStore();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please try again later." },
    ...(store ? { store } : {}),
  });
}

/** AI generation: 5 req / hour per IP */
export async function createAiLimiter() {
  const store = await getStore();
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "AI generation limit reached. Please try again later." },
    ...(store ? { store } : {}),
  });
}

/** General API: 300 req / min per IP */
export async function createApiLimiter() {
  const store = await getStore();
  return rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
    ...(store ? { store } : {}),
  });
}
