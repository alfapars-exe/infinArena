---
description: Run all quality checks (typecheck, test, lint)
allowed-tools: Bash
---

Run all quality checks for the project sequentially and report results:

1. `pnpm typecheck` - TypeScript type checking
2. `pnpm test` - Backend unit tests
3. `pnpm lint` - ESLint
4. `pnpm l10n:check` - Localization consistency (Turkish/English)

Report a summary at the end: which checks passed and which failed.
If any check fails, show the relevant error output.
