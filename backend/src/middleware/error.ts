import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    code: "NOT_FOUND",
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.api.error(error.message, error.details);
    } else {
      logger.api.warn(error.message, error.details);
    }

    res.status(error.statusCode).json(error.toJSON());
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        error: "File too large. Maximum size is 5MB.",
        code: "VALIDATION_ERROR",
      });
      return;
    }

    res.status(400).json({
      error: "Invalid upload payload",
      code: "VALIDATION_ERROR",
      details: error.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  logger.api.error(`Unexpected error: ${message}`, error);
  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}
