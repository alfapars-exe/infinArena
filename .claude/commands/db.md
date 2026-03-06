---
description: Database operations (push migrations, seed, or inspect)
argument-hint: push|seed|status
allowed-tools: Bash
---

Run database operations based on $ARGUMENTS:

- "push": Run `pnpm --dir backend db:push` to apply pending migrations
- "seed": Run `pnpm --dir backend db:seed` to seed database with initial data
- "status": Show current database configuration from environment
- empty/no args: Show available database commands

Always show the output and report success or failure.
