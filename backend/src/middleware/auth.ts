import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "@/lib/errors/app-error";
import { verifyAuthToken, isTokenBlacklisted, type AuthTokenPayload } from "@/lib/auth/token";

export interface AuthenticatedRequest extends Request {
  auth?: AuthTokenPayload;
  rawToken?: string;
}

function extractBearerToken(req: Request): string | null {
  const rawAuthHeader = req.header("authorization") || "";
  if (!rawAuthHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = rawAuthHeader.slice(7).trim();
  return token || null;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    next(new UnauthorizedError("Missing authorization token"));
    return;
  }

  const payload = verifyAuthToken(token);
  if (!payload) {
    next(new UnauthorizedError("Invalid or expired authorization token"));
    return;
  }

  // Check token blacklist (logout)
  if (await isTokenBlacklisted(token)) {
    next(new UnauthorizedError("Token has been revoked"));
    return;
  }

  (req as AuthenticatedRequest).auth = payload;
  (req as AuthenticatedRequest).rawToken = token;
  next();
}
