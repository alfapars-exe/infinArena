---
title: infinArena
emoji: 🎯
colorFrom: red
colorTo: blue
sdk: docker
pinned: false
license: mit
app_port: 7860
---

# infinArena - Interactive Quiz Platform

An interactive, real-time quiz platform similar to Kahoot, built with Next.js, Socket.io, and TypeScript.

## Features

- 🎮 **Real-time multiplayer quizzes** - Live quiz sessions with WebSocket support
- 👨‍💏 **Admin panel** - Create and manage quizzes, questions, and live sessions
- 🎵 **Background music** - Optional YouTube integration for background music during quizzes
- 🏆 **Leaderboards** - Real-time scoring and rankings
- 🌍 **Bilingual** - Support for English and Turkish
- 📊 **Statistics** - Question-by-question statistics and final results
- 🎨 **Modern UI** - Beautiful, responsive design with Tailwind CSS and Framer Motion

## How to Use

1. **Admin Panel**: Access at `/infinarenapanel/login` (default credentials: admin/admin)
2. **Create Quiz**: Add questions with multiple choice answers
3. **Start Session**: Get a PIN code for players to join
4. **Players Join**: Visit the homepage and enter the PIN
5. **Start Quiz**: Control the quiz flow from the admin panel

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Backend**: Next.js API Routes, Socket.io
- **Database**: SQLite with Drizzle ORM
- **Authentication**: NextAuth.js
- **Styling**: Tailwind CSS, Bootstrap, Framer Motion
- **Real-time**: Socket.io for live quiz sessions

## Environment Variables

The app uses SQLite by default and doesn't require additional environment variables for basic functionality.

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## License

MIT License - Feel free to use this project for your own purposes.
