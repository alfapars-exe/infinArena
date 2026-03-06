# infinArena Backend

Express.js + Socket.IO backend with TypeScript.

## Entrypoints
- `src/server.ts` - Combined server (all routes)
- `src/server-admin.ts` - Admin-only (port 7860)
- `src/server-player.ts` - Player-only (port 7861)
- `src/app.ts` - Express app factory with middleware stack

## Architecture
Routes → Services (`lib/services/`) → Repositories (`lib/repositories/`) → Drizzle ORM

## Key Files
- `lib/db/schema.ts` - Database schema (Drizzle)
- `lib/validators.ts` - Zod validation schemas
- `lib/socket/server.ts` - Socket.IO server + event handlers
- `lib/socket/session-manager.ts` - In-memory session tracking
- `lib/socket/redis-session-store.ts` - Redis session backup
- `lib/scoring.ts` - Point calculation
- `lib/answer-batch-writer.ts` - Batched DB writes
- `lib/auth/token.ts` - JWT utilities
- `lib/logger.ts` - Structured logging
- `lib/metrics.ts` - Prometheus metrics
- `lib/object-storage.ts` - S3/R2/local file storage

## Commands
```bash
pnpm dev:admin          # Dev admin server (7860)
pnpm dev:player         # Dev player server (7861)
pnpm test               # Run tests (tsx --test)
pnpm typecheck          # Type check
pnpm db:push            # Apply migrations
pnpm db:seed            # Seed database
```
