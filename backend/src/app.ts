import express, { type Request } from "express";
import cors from "cors";
import multer from "multer";
import { ValidationError, UnauthorizedError } from "@/lib/errors/app-error";
import { storeFile, retrieveFile } from "@/lib/object-storage";
import { requireAuth, type AuthenticatedRequest } from "@/middleware/auth";
import { blacklistToken } from "@/lib/auth/token";
import { asyncHandler } from "@/middleware/async-handler";
import { errorHandler, notFoundHandler } from "@/middleware/error";
import { loginAdmin, getAdminById } from "@/lib/services/auth.service";
import { generateQuiz } from "@/lib/services/ai.service";
import {
  addQuestion,
  createQuiz,
  deleteQuestion,
  deleteQuiz,
  getAllQuizzes,
  getQuizResults,
  getQuizWithQuestions,
  publishQuiz,
  updateQuestion,
  updateQuiz,
} from "@/lib/services/quiz.service";
import { terminateSession } from "@/lib/services/session-admin.service";
import {
  getSessionByPin,
  markSessionLiveByPin,
} from "@/lib/services/session-query.service";
import {
  exportQuizDraftAsExcel,
  exportQuizDraftAsWord,
  exportSessionResultsAsExcel,
} from "@/lib/services/export.service";
import { openApiDocument } from "@/openapi";
import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { checkRedisHealth } from "@/lib/redis";
import {
  createLoginLimiter,
  createAiLimiter,
  createApiLimiter,
} from "@/middleware/rate-limit";
import {
  promClient,
  httpRequestDurationHistogram,
  httpRequestsCounter,
} from "@/lib/metrics";

const log = createLogger("App");
const startTime = Date.now();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const swaggerUiHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>infinArena API Docs</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        tryItOutEnabled: true,
        displayRequestDuration: true,
      });
    </script>
  </body>
</html>`;

type BackendRole = "all" | "admin" | "player";

const SHARED_ROUTE_PATTERNS: RegExp[] = [
  /^\/metrics$/,
  /^\/api\/docs$/,
  /^\/api\/openapi\.json$/,
  /^\/api\/health(?:\/live|\/ready)?$/,
  /^\/api\/uploads\/[^/]+$/,
  /^\/api\/sessions\/[^/]+$/,
];

const ADMIN_ROUTE_PATTERNS: RegExp[] = [
  /^\/api\/auth\/(login|me|logout)$/,
  /^\/api\/upload$/,
  /^\/api\/sessions\/[^/]+\/live$/,
  /^\/api\/quizzes(?:\/.*)?$/,
  /^\/api\/ai\/generate-quiz$/,
];

function resolveBackendRole(value: string | undefined): BackendRole {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "player") {
    return normalized;
  }
  return "all";
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function matchesAnyPattern(pathname: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(pathname));
}

function isRouteAllowed(pathname: string, role: BackendRole): boolean {
  const normalized = normalizePathname(pathname);
  if (matchesAnyPattern(normalized, SHARED_ROUTE_PATTERNS)) {
    return true;
  }
  if (role === "admin" && matchesAnyPattern(normalized, ADMIN_ROUTE_PATTERNS)) {
    return true;
  }
  return false;
}

function parseIntegerParam(value: unknown, label: string): number {
  const parsed = Number.parseInt(typeof value === "string" ? value : String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return parsed;
}

function resolveRequestOrigin(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto ? forwardedProto.split(",")[0].trim() : req.protocol;
  const host = req.header("x-forwarded-host") || req.get("host") || "localhost";
  return `${protocol}://${host}`;
}

async function requireAdmin(req: Request): Promise<{ id: number; email: string; name: string }> {
  const authReq = req as AuthenticatedRequest;
  const auth = authReq.auth;
  if (!auth) {
    throw new UnauthorizedError();
  }

  const admin = await getAdminById(auth.userId);
  if (!admin) {
    throw new UnauthorizedError("Admin account not found");
  }

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
  };
}

function resolveAllowedOrigins(): string[] | true {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (!envOrigins) {
    if (process.env.NODE_ENV === "production") {
      log.warn(
        "ALLOWED_ORIGINS not set in production — CORS will reject cross-origin requests"
      );
      return [];
    }
    // Development: allow all origins
    return true;
  }
  return envOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function getAllowedOrigins(): string[] | true {
  return resolveAllowedOrigins();
}

export async function createHttpApp() {
  const app = express();

  const allowedOrigins = resolveAllowedOrigins();
  const backendRole = resolveBackendRole(process.env.BACKEND_ROLE);

  // Rate limiters (Redis-backed when available, in-memory fallback)
  const [loginLimiter, aiLimiter, apiLimiter] = await Promise.all([
    createLoginLimiter(),
    createAiLimiter(),
    createApiLimiter(),
  ]);

  // Apply general API rate limit to all /api/ routes
  app.use("/api/", apiLimiter);

  app.use(
    cors({
      origin: allowedOrigins === true
        ? true
        : (origin, callback) => {
            if (!origin || (allowedOrigins as string[]).includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error(`Origin ${origin} not allowed by CORS`));
            }
          },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["Content-Disposition"],
    })
  );
  app.use(express.json({ limit: "2mb" }));

  // HTTP request instrumentation for Prometheus
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path || req.path;
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      httpRequestDurationHistogram.observe(labels, durationMs);
      httpRequestsCounter.inc(labels);
    });
    next();
  });

  if (backendRole !== "all") {
    log.info(`Running in ${backendRole} backend mode`);
  }

  app.use((req, res, next) => {
    if (backendRole === "all" || req.method === "OPTIONS") {
      next();
      return;
    }

    if (isRouteAllowed(req.path, backendRole)) {
      next();
      return;
    }

    res.status(404).json({
      error: `Route not available in ${backendRole} backend`,
    });
  });

  // Prometheus metrics endpoint
  app.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", promClient.register.contentType);
    res.end(await promClient.register.metrics());
  });

  app.get(
    "/api/docs",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.type("html").send(swaggerUiHtml);
    })
  );

  app.get(
    "/api/openapi.json",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(200).json(openApiDocument);
    })
  );

  // Liveness probe — process is alive
  app.get(
    "/api/health/live",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(200).json({ ok: true });
    })
  );

  // Readiness probe — dependencies are connected
  app.get(
    "/api/health/ready",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

      const checks: Record<string, { status: string; latencyMs?: number }> = {};

      // Database check
      const dbStart = Date.now();
      try {
        await db.select({ id: admins.id }).from(admins).limit(1);
        checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
      } catch {
        checks.database = { status: "error", latencyMs: Date.now() - dbStart };
      }

      // Redis check
      const redisResult = await checkRedisHealth();
      if (redisResult.status !== "disabled") {
        checks.redis = { status: redisResult.status, latencyMs: redisResult.latencyMs };
      }

      const allOk = Object.values(checks).every((c) => c.status === "ok");

      res.status(allOk ? 200 : 503).json({
        ok: allOk,
        status: allOk ? "healthy" : "degraded",
        checks,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
      });
    })
  );

  // Legacy health endpoint — kept for backwards compatibility
  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(200).json({
        ok: true,
        status: "healthy",
        timestamp: new Date().toISOString(),
      });
    })
  );

  app.post(
    "/api/auth/login",
    loginLimiter,
    asyncHandler(async (req, res) => {
      const body = (req.body || {}) as { username?: string; password?: string };
      const result = await loginAdmin(body.username || "", body.password || "");

      res.status(200).json({
        token: result.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          username: result.user.username,
        },
      });
    })
  );

  app.get(
    "/api/auth/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const auth = (req as AuthenticatedRequest).auth!;
      const admin = await getAdminById(auth.userId);
      if (!admin) {
        throw new UnauthorizedError("Admin account not found");
      }

      res.status(200).json({
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          username: admin.username,
        },
      });
    })
  );

  app.post(
    "/api/auth/logout",
    requireAuth,
    asyncHandler(async (req, res) => {
      const rawToken = (req as AuthenticatedRequest).rawToken;
      if (rawToken) {
        await blacklistToken(rawToken);
      }
      res.status(200).json({ ok: true });
    })
  );

  app.post(
    "/api/upload",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        res.status(400).json({
          error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.",
        });
        return;
      }

      const result = await storeFile(
        file.buffer,
        file.originalname || "upload.png",
        resolveRequestOrigin(req)
      );
      res.status(200).json({ url: result.url, absoluteUrl: result.absoluteUrl });
    })
  );

  app.get(
    "/api/uploads/:filename",
    asyncHandler(async (req, res) => {
      const filename = req.params.filename;
      if (!filename || filename.includes("..") || filename.includes("/")) {
        res.status(400).json({ error: "Invalid filename" });
        return;
      }

      const file = await retrieveFile(filename);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.status(200).send(file.buffer);
    })
  );

  app.get(
    "/api/sessions/:pin",
    asyncHandler(async (req, res) => {
      const result = await getSessionByPin(req.params.pin);
      if (!result.ok) {
        res.status(result.status).json({ error: result.message });
        return;
      }

      res.status(200).json(result.data);
    })
  );

  app.post(
    "/api/sessions/:pin/live",
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await markSessionLiveByPin(req.params.pin);
      if (!result.ok) {
        res.status(result.status).json({ error: result.message });
        return;
      }

      res.status(200).json(result.data);
    })
  );

  app.get(
    "/api/quizzes",
    requireAuth,
    asyncHandler(async (req, res) => {
      const admin = await requireAdmin(req);
      const quizzes = await getAllQuizzes(admin.id);
      res.status(200).json(quizzes);
    })
  );

  app.post(
    "/api/quizzes",
    requireAuth,
    asyncHandler(async (req, res) => {
      const admin = await requireAdmin(req);
      const quiz = await createQuiz(admin.id, req.body);
      res.status(201).json(quiz);
    })
  );

  app.get(
    "/api/quizzes/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const quizId = parseIntegerParam(req.params.id, "quiz id");
      const quiz = await getQuizWithQuestions(quizId);
      res.status(200).json(quiz);
    })
  );

  app.put(
    "/api/quizzes/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const quizId = parseIntegerParam(req.params.id, "quiz id");
      const updated = await updateQuiz(quizId, req.body);
      res.status(200).json(updated);
    })
  );

  app.delete(
    "/api/quizzes/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const quizId = parseIntegerParam(req.params.id, "quiz id");
      await deleteQuiz(quizId);
      res.status(200).json({ success: true });
    })
  );

  app.post(
    "/api/quizzes/:id/questions",
    requireAuth,
    asyncHandler(async (req, res) => {
      const quizId = parseIntegerParam(req.params.id, "quiz id");
      const result = await addQuestion(quizId, req.body);
      res.status(201).json(result);
    })
  );

  app.put(
    "/api/quizzes/:id/questions",
    requireAuth,
    asyncHandler(async (req, res) => {
      const questionId = parseIntegerParam(req.body?.questionId, "question id");
      const { questionId: _questionId, ...data } = req.body as { questionId?: number };
      const result = await updateQuestion(questionId, data);
      res.status(200).json(result);
    })
  );

  app.delete(
    "/api/quizzes/:id/questions",
    requireAuth,
    asyncHandler(async (req, res) => {
      const questionId = parseIntegerParam(
        typeof req.query.questionId === "string" ? req.query.questionId : undefined,
        "question id"
      );
      await deleteQuestion(questionId);
      res.status(200).json({ success: true });
    })
  );

  app.post(
    "/api/quizzes/:id/publish",
    requireAuth,
    asyncHandler(async (req, res) => {
      const quizId = parseIntegerParam(req.params.id, "quiz id");
      const result = await publishQuiz(quizId);
      res.status(200).json(result);
    })
  );

  app.get(
    "/api/quizzes/:id/export",
    requireAuth,
    asyncHandler(async (req, res) => {
      const quizId = parseIntegerParam(req.params.id, "quiz id");
      const format = typeof req.query.format === "string" ? req.query.format : "excel";

      if (format === "word") {
        const buffer = await exportQuizDraftAsWord(quizId);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        res.setHeader("Content-Disposition", `attachment; filename=\"quiz-${quizId}.docx\"`);
        res.status(200).send(Buffer.from(buffer));
        return;
      }

      const buffer = await exportQuizDraftAsExcel(quizId);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename=\"quiz-${quizId}.xlsx\"`);
      res.status(200).send(Buffer.from(buffer));
    })
  );

  app.get(
    "/api/quizzes/:id/results",
    requireAuth,
    asyncHandler(async (req, res) => {
      const quizId = parseIntegerParam(req.params.id, "quiz id");
      const result = await getQuizResults(quizId);
      res.status(200).json(result);
    })
  );

  app.post(
    "/api/quizzes/:id/sessions/:sessionId/terminate",
    requireAuth,
    asyncHandler(async (req, res) => {
      const quizId = parseIntegerParam(req.params.id, "quiz id");
      const sessionId = parseIntegerParam(req.params.sessionId, "session id");
      const result = await terminateSession(quizId, sessionId);
      if (!result.ok) {
        res.status(result.status).json({ error: result.message });
        return;
      }

      res.status(200).json({
        session: result.data.session,
        alreadyCompleted: result.data.alreadyCompleted || undefined,
      });
    })
  );

  app.get(
    "/api/quizzes/:id/results/export",
    requireAuth,
    asyncHandler(async (req, res) => {
      const quizId = parseIntegerParam(req.params.id, "quiz id");
      const buffer = await exportSessionResultsAsExcel(quizId);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"quiz-${quizId}-results.xlsx\"`
      );
      res.status(200).send(Buffer.from(buffer));
    })
  );

  app.post(
    "/api/ai/generate-quiz",
    aiLimiter,
    requireAuth,
    asyncHandler(async (req, res) => {
      const auth = (req as AuthenticatedRequest).auth!;
      const body = req.body || {};
      const result = await generateQuiz({
        topic: body.topic,
        difficulty: body.difficulty,
        numQuestions: body.numQuestions,
        model: body.model,
        language: body.language,
        timeLimitSeconds: body.timeLimitSeconds,
        userId: auth.userId,
      });

      const status = result.questionsCreated < result.totalRequested ? 201 : 200;
      res.status(status).json(result);
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
