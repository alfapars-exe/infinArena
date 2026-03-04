import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createHttpApp, getAllowedOrigins } from "@/app";
import { setupSocketHandlers, handleTimerExpiry } from "@/lib/socket/server";
import { ensureStorageReady } from "@/lib/storage";
import { ensureDbMigrations } from "@/lib/db/migrations";
import { createLogger } from "@/lib/logger";
import { isRedisEnabled, getRedisPubSub, closeRedis } from "@/lib/redis";
import { startAnswerBatchWriter, stopAnswerBatchWriter } from "@/lib/answer-batch-writer";
import { startTimerWorker, stopTimerWorker } from "@/lib/timer-worker";

const port = Number.parseInt(process.env.PORT || process.env.BACKEND_PORT || "7860", 10);
const log = {
  startup: createLogger("Startup"),
  storage: createLogger("Storage"),
  db: createLogger("DB"),
};

process.on("unhandledRejection", (err) => {
  log.startup.error("FATAL: Unhandled rejection", err);
});

process.on("uncaughtException", (err) => {
  log.startup.error("FATAL: Uncaught exception", err);
  process.exit(1);
});

async function bootstrap() {
  ensureStorageReady();
  await ensureDbMigrations();
  log.db.info("Migrations completed");

  try {
    await import("@/lib/db/seed");
    log.db.info("Seed initialization completed");
  } catch (error) {
    log.db.warn("Seed initialization warning", error);
  }

  const app = await createHttpApp();
  const httpServer = createServer(app);

  const allowedOrigins = getAllowedOrigins();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins === true ? "*" : allowedOrigins,
      methods: ["GET", "POST"],
    },
    path: "/api/socketio",
  });

  // Attach Redis adapter for cross-pod broadcast when Redis is available
  if (isRedisEnabled()) {
    try {
      const { pub, sub } = await getRedisPubSub();
      io.adapter(createAdapter(pub, sub));
      log.startup.info("Socket.IO Redis adapter attached — multi-pod broadcast enabled");
    } catch (err) {
      log.startup.warn("Failed to attach Socket.IO Redis adapter, falling back to in-memory", err);
    }
  } else {
    log.startup.info("Redis not configured — using in-memory Socket.IO adapter (single-pod only)");
  }

  setupSocketHandlers(io as any);

  // Start background answer batch writer
  startAnswerBatchWriter();

  // Start distributed timer worker (Redis-backed fallback for question timers)
  await startTimerWorker(handleTimerExpiry);

  httpServer.listen(port, "0.0.0.0", () => {
    log.startup.info(`Backend ready on http://0.0.0.0:${port}`);
  });

  // Graceful shutdown
  const SHUTDOWN_TIMEOUT_MS = 30_000;

  function gracefulShutdown(signal: string) {
    log.startup.info(`${signal} received, beginning graceful shutdown`);

    // Stop accepting new connections
    httpServer.close(() => {
      log.startup.info("HTTP server closed");
    });

    // Close Socket.IO (sends disconnect to all clients)
    io.close(async () => {
      log.startup.info("Socket.IO closed");
      stopTimerWorker();
      log.startup.info("Timer worker stopped");
      await stopAnswerBatchWriter();
      log.startup.info("Answer batch writer drained");
      await closeRedis();
      log.startup.info("Redis closed, exiting");
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      log.startup.warn(`Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

bootstrap().catch((error) => {
  log.startup.error("Failed to initialize backend", error);
  process.exit(1);
});
