---
title: infinArena
emoji: "🎯"
colorFrom: red
colorTo: blue
sdk: docker
pinned: false
license: mit
app_port: 7860
python_version: "3.9"
---

# infinArena - Interactive Quiz Platform

An interactive, real-time quiz platform similar to Kahoot, built with Next.js, Socket.io, and TypeScript.

## Features

- Real-time multiplayer quizzes with WebSocket support
- Admin panel to create and manage quizzes
- Optional YouTube background music support
- Live leaderboard and scoring
- English and Turkish language support
- Per-question and final result statistics

## How to Use

1. Admin panel: `/infinarenapanel/login` (default: `admin / inFina2026!!**`)
2. Create a quiz with questions and choices
3. Start a live session and share the PIN
4. Players join from `/`
5. Control quiz flow from the admin panel

## Tech Stack

- Frontend: Next.js 14, React 18, TypeScript
- Backend: Next.js API Routes, Socket.io
- Database: SQLite + Drizzle ORM
- Authentication: NextAuth.js
- Styling: Tailwind CSS, Bootstrap, Framer Motion

## Storage and Persistence

This app stores:

- Quiz data in SQLite (`quiz.db`)
- Uploaded media files in `uploads/`

By default:

- Local development uses `./data`
- Hugging Face Spaces uses `/data/infinarena`

### Required Hugging Face Setup

Enable **Persistent Storage** in your Space settings.  
Without it, data will be lost on rebuild/redeploy.

Recommended Variables/Secrets in Space:

- `APP_STORAGE_DIR=/data/infinarena`
- `REQUIRE_PERSISTENT_STORAGE=true`
- `NEXTAUTH_SECRET=<strong-random-value>`

Optional:

- `DATABASE_URL=<override-url>` (if you want external DB instead of local SQLite file)

### Environment Variables

- `APP_STORAGE_DIR`
  - Storage root path for DB and uploads.
  - Default: `/data/infinarena` in Hugging Face Spaces, `./data` locally.
- `REQUIRE_PERSISTENT_STORAGE`
  - If `true`, app fails fast when storage is not mounted/writable under `/data`.
  - Default: `true` in Hugging Face Spaces, `false` locally.
- `DATABASE_URL`
  - Optional DB URL override.
  - If missing, app uses `file:<APP_STORAGE_DIR>/quiz.db`.

## Deployment Persistence Check

1. Deploy app to your Hugging Face Space.
2. Create a new quiz and upload an image.
3. Trigger a new deploy (push a commit).
4. Open admin panel again.
5. Verify:
   - quiz still exists
   - uploaded image URL still works

## Development

```bash
pnpm install
pnpm dev
```

Build and start:

```bash
pnpm build
pnpm start
```

## License

MIT
