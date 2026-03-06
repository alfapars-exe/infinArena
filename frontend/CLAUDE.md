# infinArena Frontend

Next.js 14 App Router with React 18, Tailwind CSS, and TypeScript.

## Page Structure
- `src/app/admin/` - Admin dashboard, quiz editor, live game control, results
- `src/app/play/[pin]` - Player join and gameplay
- `src/app/admin/login/` - Admin authentication
- `src/app/admin/quizzes/[id]/` - Quiz editor
- `src/app/admin/live/[sessionId]/` - Live game control

## Key Files
- `src/lib/services/api-client.ts` - Backend API client with URL routing
- `src/components/` - Shared UI components
- `tailwind.config.ts` - Theme colors, custom animations (score-pop, streak-fire)
- `src/test/setup.ts` - Vitest test setup

## Stack
- TanStack React Query - Server state (API calls)
- Zustand - Client state (theme, auth)
- Radix UI - Accessible primitives
- Tailwind CSS - Styling
- Socket.IO client - Real-time updates
- Motion - Animations

## Commands
```bash
pnpm dev:admin          # Dev admin UI (3000)
pnpm dev:player         # Dev player UI (3001)
pnpm test               # Run tests (Vitest)
pnpm typecheck          # Type check
```
