type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  ctx: string;
  msg: string;
  data?: unknown;
  pod?: string;
  env?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === "production" ? "info" : "debug");

const IS_JSON_MODE = process.env.NODE_ENV === "production" || process.env.LOG_FORMAT === "json";
const POD_NAME = process.env.HOSTNAME || process.env.POD_NAME || "local";
const ENV_NAME = process.env.NODE_ENV || "development";

function formatHuman(entry: LogEntry): string {
  const dataStr = entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : "";
  return `[${entry.ctx}] ${entry.level.toUpperCase()}: ${entry.msg}${dataStr}`;
}

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function log(level: LogLevel, context: string, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    ctx: context,
    msg: message,
    pod: POD_NAME,
    env: ENV_NAME,
  };

  if (data !== undefined) {
    // Serialize Error objects properly
    if (data instanceof Error) {
      entry.data = { name: data.name, message: data.message, stack: data.stack };
    } else {
      entry.data = data;
    }
  }

  const formatted = IS_JSON_MODE ? formatJson(entry) : formatHuman(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export function createLogger(context: string) {
  return {
    debug: (message: string, data?: unknown) => log("debug", context, message, data),
    info: (message: string, data?: unknown) => log("info", context, message, data),
    warn: (message: string, data?: unknown) => log("warn", context, message, data),
    error: (message: string, data?: unknown) => log("error", context, message, data),
  };
}

export const logger = {
  ai: createLogger("AI"),
  socket: createLogger("Socket"),
  db: createLogger("DB"),
  api: createLogger("API"),
  export: createLogger("Export"),
  auth: createLogger("Auth"),
  storage: createLogger("Storage"),
  startup: createLogger("Startup"),
};
