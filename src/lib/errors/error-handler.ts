import { NextResponse } from "next/server";
import { AppError } from "./app-error";
import { createLogger } from "../logger";
import type { Socket } from "socket.io";

const apiLogger = createLogger("API");
const socketLogger = createLogger("Socket");

export function handleApiError(error: unknown, context?: string): NextResponse {
  if (error instanceof AppError) {
    const prefix = context ? `[${context}] ` : "";
    if (error.statusCode >= 500) {
      apiLogger.error(`${prefix}${error.message}`, error.details);
    } else {
      apiLogger.warn(`${prefix}${error.message}`, error.details);
    }
    return NextResponse.json(error.toJSON(), { status: error.statusCode });
  }

  const message =
    error instanceof Error ? error.message : String(error);
  const prefix = context ? `[${context}] ` : "";
  apiLogger.error(`${prefix}Unexpected error: ${message}`, error);

  return NextResponse.json(
    { error: "Internal server error", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}

export function handleSocketError(
  error: unknown,
  socket: Socket,
  context?: string
): void {
  const message =
    error instanceof Error ? error.message : String(error);
  const prefix = context ? `[${context}] ` : "";

  if (error instanceof AppError) {
    socketLogger.error(`${prefix}${error.message}`, error.details);
    socket.emit("error", { message: error.message });
  } else {
    socketLogger.error(`${prefix}Unexpected error: ${message}`, error);
    socket.emit("error", { message: "An unexpected error occurred" });
  }
}
