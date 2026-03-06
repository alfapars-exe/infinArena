---
description: Review recent changes for quality, bugs, and security issues
allowed-tools: Bash, Read, Grep, Glob
---

Review the current git changes (staged + unstaged) for:

1. Run `git diff` and `git diff --cached` to see all changes
2. Check for:
   - TypeScript type safety issues (any types, missing types)
   - Security concerns (hardcoded secrets, SQL injection, XSS)
   - Error handling (raw throws instead of AppError)
   - Missing input validation (Zod schemas)
   - Console.log usage (should use logger)
   - Pattern violations (direct DB access instead of repository layer)
3. Verify Socket.IO events follow kebab-case naming
4. Check frontend changes use React Query (not raw fetch) and Tailwind (not inline styles)

Provide a summary with any issues found and suggestions for improvement.
