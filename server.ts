import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "7860", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

process.on("unhandledRejection", (err) => {
  console.error("[Startup] FATAL: Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("[Startup] FATAL: Uncaught exception:", err);
  process.exit(1);
});

app
  .prepare()
  .then(async () => {
    try {
      // Dynamic import to avoid circular dependency issues
      const { createLogger } = await import("./src/lib/logger");
      const log = {
        startup: createLogger("Startup"),
        storage: createLogger("Storage"),
        db: createLogger("DB"),
      };

      const { ensureStorageReady } = await import("./src/lib/storage");
      const storageStatus = ensureStorageReady();
      log.storage.info(`Root: ${storageStatus.storageRoot}`);
      log.storage.info(`Persistent storage required: ${storageStatus.requirePersistentStorage}`);

      const { ensureDbMigrations } = await import("./src/lib/db/migrations");
      await ensureDbMigrations();
      log.db.info("Migrations completed");

      try {
        await import("./src/lib/db/seed");
        log.db.info("Seed initialization completed");
      } catch (err) {
        log.db.warn("Seed initialization warning", err);
      }

      const { setupSocketHandlers } = await import("./src/lib/socket/server");

      const httpServer = createServer((req, res) => {
        handle(req, res);
      });

      const io = new SocketIOServer(httpServer, {
        cors: { origin: "*" },
        path: "/api/socketio",
      });

      setupSocketHandlers(io as any);

      httpServer.listen(port, "0.0.0.0", () => {
        log.startup.info(`Ready on http://0.0.0.0:${port}`);
        log.startup.info("Admin panel: /infinarenapanel/login");
        log.startup.info("Player entry: /");
      });
    } catch (err) {
      console.error("[Startup] ERROR: Failed to initialize:", err);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("[Startup] ERROR: Next.js prepare failed:", err);
    process.exit(1);
  });
