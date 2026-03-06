# infinArena

Real-time multiplayer quiz/game platform. Players join via PIN, answer timed questions, compete on leaderboards.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js, TypeScript, Socket.IO, Drizzle ORM, Zod |
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, Radix UI |
| State | Zustand (client), TanStack React Query (server) |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Cache | Redis (ioredis), Socket.IO Redis adapter |
| Testing | tsx --test + supertest (backend), Vitest + RTL (frontend), k6 (load) |
| DevOps | Docker, Kubernetes, Caddy, GitHub Actions, Prometheus, OpenTelemetry |

## Architecture

- **Monorepo**: pnpm workspaces — `backend/` and `frontend/`
- **Role-based backend**: `BACKEND_ROLE` env controls admin (7860) / player (7861) split
- **Real-time**: Socket.IO + Redis adapter for cross-pod broadcasting
- **Session state**: In-memory for speed, Redis backup for failover
- **Answer batching**: Player answers batched before DB writes
- **Storage**: Local FS / AWS S3 / Cloudflare R2
- **AI**: Hugging Face API for quiz generation
- **i18n**: Turkish and English

## Commands

```bash
pnpm install                    # Install dependencies
pnpm dev:backend:admin          # Backend admin (7860)
pnpm dev:backend:player         # Backend player (7861)
pnpm dev:frontend:admin         # Frontend admin (3000)
pnpm dev:frontend:player        # Frontend player (3001)
pnpm build                      # Build all
pnpm typecheck                  # TypeScript checks
pnpm test                       # Backend tests
pnpm lint                       # ESLint
pnpm l10n:check                 # i18n consistency
pnpm --dir backend db:push      # Apply migrations
pnpm --dir backend db:seed      # Seed database
```

## Coding Standards

- TypeScript strict, no `any` types
- Zod for all external input validation
- Backend: service-repository pattern, `AppError` for errors, `asyncHandler` for routes
- Frontend: React Query for API, Zustand for client state, Tailwind only
- Socket.IO events: kebab-case (`player-joined`, `question-started`)
- Logging: `logger` from `lib/logger.ts` (never console.log)
- Run `pnpm typecheck && pnpm test && pnpm lint` before committing

## Environment

- Dev config: `backend/.env.local`
- Required: `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- Optional: `HF_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `S3_*` vars
