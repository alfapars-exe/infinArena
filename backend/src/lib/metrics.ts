import client from "prom-client";

// Collect default Node.js metrics (CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({ prefix: "infinarena_" });

// --- Socket.IO metrics ---

export const socketConnectionsGauge = new client.Gauge({
  name: "infinarena_socketio_connections_total",
  help: "Total active Socket.IO connections",
});

export const socketEventsReceivedCounter = new client.Counter({
  name: "infinarena_socketio_events_received_total",
  help: "Total Socket.IO events received from clients",
  labelNames: ["event_name"] as const,
});

export const socketEventsSentCounter = new client.Counter({
  name: "infinarena_socketio_events_sent_total",
  help: "Total Socket.IO events sent to clients",
  labelNames: ["event_name"] as const,
});

// --- Game metrics ---

export const gameSessionsGauge = new client.Gauge({
  name: "infinarena_game_sessions_active",
  help: "Number of currently active game sessions",
});

export const gamePlayersGauge = new client.Gauge({
  name: "infinarena_game_players_connected",
  help: "Total connected players across all sessions",
});

export const gameAnswersCounter = new client.Counter({
  name: "infinarena_game_answers_total",
  help: "Total answers submitted",
  labelNames: ["is_correct"] as const,
});

// --- HTTP metrics ---

export const httpRequestDurationHistogram = new client.Histogram({
  name: "infinarena_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const httpRequestsCounter = new client.Counter({
  name: "infinarena_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
});

export { client as promClient };
