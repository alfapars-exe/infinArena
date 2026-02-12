import { sessionRepository } from "@/lib/repositories/session.repository";
import { NotFoundError } from "@/lib/errors/app-error";
import { ensureDbMigrations } from "@/lib/db/migrations";

export async function getSessionByPin(pin: string) {
  await ensureDbMigrations();
  const session = await sessionRepository.findByPin(pin);
  if (!session) throw new NotFoundError("Session");
  return session;
}

export async function getSessionResults(sessionId: number) {
  await ensureDbMigrations();
  return sessionRepository.getSessionResults(sessionId);
}

export async function terminateSession(sessionId: number) {
  await ensureDbMigrations();
  const session = await sessionRepository.findById(sessionId);
  if (!session) throw new NotFoundError("Session", sessionId);
  return sessionRepository.updateStatus(sessionId, "completed");
}
