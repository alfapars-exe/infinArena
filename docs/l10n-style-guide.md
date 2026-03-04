# TR/ENG Localization Style Guide

## Scope

- UI text must be fully localized via `frontend/src/lib/i18n.ts`.
- User-facing copy supports `en` and `tr`.
- Code comments, logs, and internal error messages stay in English unless they are shown directly to end users.

## Terminology

- Keep product term as `Quiz` in Turkish UI copy.
- Do not force domain terms into literal translations if existing product wording is already stable.

## Turkish Copy Rules

- Use proper Turkish characters (`ç, ğ, ı, İ, ö, ş, ü`) in all user-facing text.
- Avoid ASCII transliterations (for example: `Lutfen`, `Dogru`, `Yanlis`).
- Keep tone short and action-oriented for gameplay screens.

## i18n Rules

- `en` and `tr` must have identical translation keys.
- Placeholder variables must match exactly between locales (for example: `{count}`, `{pin}`).
- Any new hardcoded UI text should be moved to i18n keys.

## Validation

- Run `pnpm l10n:check` before merge.
- The script validates:
  - key parity (`en` vs `tr`)
  - placeholder parity
  - known transliteration mistakes
