# Backend Coding Rules

## Architecture Pattern
- Routes → Services → Repositories → Database
- Never access DB directly from routes or services (use repository layer)
- Business logic belongs in services, not in routes or repositories

## Error Handling
- Use `AppError` class from `lib/errors.ts` for all errors
- Never throw raw `Error` in routes or services
- `asyncHandler` middleware wraps all async route handlers

## Validation
- All external input validated with Zod schemas in `lib/validators.ts`
- Never trust client input without validation

## Database
- Schema defined in `lib/db/schema.ts` using Drizzle ORM
- All queries go through repository layer (`lib/repositories/`)
- Migrations auto-run on startup (lazy migration)
- Dev: SQLite, Prod: PostgreSQL

## Socket.IO
- Events use kebab-case: `player-joined`, `question-started`, `answer-submitted`
- Session state: in-memory (`session-manager.ts`) + Redis backup (`redis-session-store.ts`)
- Redis adapter enables cross-pod broadcasting
- Answer batching via `answer-batch-writer.ts`

## Logging
- Use `logger` from `lib/logger.ts` (never `console.log`)
- Structured logging with context

## Redis
- Keys namespaced with `session:` prefix
- Health checks via `lib/redis.ts`
