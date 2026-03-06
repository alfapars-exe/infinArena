# Frontend Coding Rules

## Framework
- Next.js 14 App Router conventions
- File-based routing: page.tsx, layout.tsx, loading.tsx, error.tsx
- Server components by default, 'use client' only when needed

## State Management
- TanStack React Query for all server state (API data)
- Zustand for client-only state (theme, auth, UI state)
- Never use raw fetch - go through `lib/services/api-client.ts`

## Styling
- Tailwind CSS exclusively (no inline styles, no CSS modules)
- Custom theme colors defined in tailwind.config.ts
- Radix UI for accessible component primitives (dialogs, dropdowns, tooltips)

## Components
- Shared components in `src/components/`
- Page-specific components colocated with their page
- Use Radix UI primitives as base for interactive components

## Real-time
- Socket.IO client via custom hooks
- Connection management handled centrally

## Testing
- Vitest with React Testing Library
- Test files: `*.test.tsx`
- Setup: `src/test/setup.ts`
