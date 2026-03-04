import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { isRedisEnabled, getRedisClient } from "@/lib/redis";
import { createLogger } from "@/lib/logger";
import type { Request } from "express";

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

function getForwardedClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof value === "string" && value.trim()) {
    return value.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

/** Login brute-force protection: 10 req / 15 min per IP */
export async function createLoginLimiter() {
  const store = await getStore();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const ip = getForwardedClientIp(req);
      const username =
        typeof req.body?.username === "string"
          ? req.body.username.trim().toLowerCase()
          : "";
      return username ? `${ip}:${username}` : ip;
    },
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
