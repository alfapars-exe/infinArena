---
description: Start development servers for the project
allowed-tools: Bash
---

Start the development environment for infinArena.

1. Check if dependencies are installed (node_modules exist in both backend/ and frontend/)
2. If not, run `pnpm install`
3. Start the requested servers based on $ARGUMENTS:
   - "all" or empty: Start backend admin + player + frontend admin + player
   - "backend": Start backend admin (7860) + player (7861)
   - "frontend": Start frontend admin (3000) + player (3001)
   - "admin": Start backend admin + frontend admin
   - "player": Start backend player + frontend player

Run each server as a background task so the user can interact while servers run.

Commands:
- Backend admin: `pnpm dev:backend:admin`
- Backend player: `pnpm dev:backend:player`
- Frontend admin: `pnpm dev:frontend:admin`
- Frontend player: `pnpm dev:frontend:player`
