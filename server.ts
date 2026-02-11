import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "7860", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Initialize database
  const { ensureDbMigrations } = await import("./src/lib/db/migrations");
  await ensureDbMigrations();
  console.log("✓ Database migrations completed");

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
    console.log(`> Ready on http://0.0.0.0:${port}`);
    console.log(`> Admin panel: /infinarenapanel/login`);
    console.log(`> Player entry: /`);
  });
});
});
