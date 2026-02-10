import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
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

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Admin panel: http://${hostname}:${port}/infinarenapanel`);
    console.log(`> Player entry: http://${hostname}:${port}`);
  });
});
