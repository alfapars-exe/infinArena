import { createHmac, timingSafeEqual } from "node:crypto";
import { isRedisEnabled, getRedisClient } from "@/lib/redis";

const DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60;

function resolveTokenSecret(): string {
  const secret = process.env.AUTH_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_TOKEN_SECRET environment variable is required in production"
      );
    }
    // Development-only fallback — never use in production
    return "infinarena-dev-only-secret-DO-NOT-USE-IN-PROD";
  }
  return secret;
}

const TOKEN_SECRET = resolveTokenSecret();

export interface AuthTokenPayload {
  userId: number;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", TOKEN_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

export function issueAuthToken(
  user: { userId: number; email: string; name: string },
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    userId: user.userId,
    email: user.email,
    name: user.name,
    iat: nowSeconds,
    exp: nowSeconds + Math.max(1, ttlSeconds),
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, incomingSignature] = parts;
  if (!encodedPayload || !incomingSignature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const incomingBuffer = Buffer.from(incomingSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (incomingBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(incomingBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as Partial<AuthTokenPayload>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const userId = parsed.userId;
    const email = parsed.email;
    const name = parsed.name;
    const iat = parsed.iat;
    const exp = parsed.exp;

    if (
      !Number.isInteger(userId) ||
      typeof email !== "string" ||
      typeof name !== "string" ||
      !Number.isInteger(iat) ||
      !Number.isInteger(exp)
    ) {
      return null;
    }

    const safeUserId = userId as number;
    const safeIat = iat as number;
    const safeExp = exp as number;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (safeExp <= nowSeconds) {
      return null;
    }

    return {
      userId: safeUserId,
      email,
      name,
      iat: safeIat,
      exp: safeExp,
    };
  } catch {
    return null;
  }
}

// --- Token Blacklist (for logout) ---

function tokenBlacklistKey(token: string): string {
  const hash = createHmac("sha256", TOKEN_SECRET).update(token).digest("hex").slice(0, 16);
  return `blacklist:token:${hash}`;
}

/**
 * Blacklist a token so it can no longer be used.
 * The blacklist entry expires when the token would have expired.
 */
export async function blacklistToken(token: string): Promise<void> {
  if (!isRedisEnabled()) return; // Without Redis, logout is session-only
  const payload = verifyAuthToken(token);
  if (!payload) return;

  const ttl = payload.exp - Math.floor(Date.now() / 1000);
  if (ttl <= 0) return; // Already expired

  try {
    const client = await getRedisClient();
    await client.set(tokenBlacklistKey(token), "1", "EX", ttl);
  } catch {
    // Best-effort blacklist
  }
}

/**
 * Check if a token has been blacklisted.
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  if (!isRedisEnabled()) return false;
  try {
    const client = await getRedisClient();
    const val = await client.get(tokenBlacklistKey(token));
    return val === "1";
  } catch {
    return false; // Fail open
  }
}
