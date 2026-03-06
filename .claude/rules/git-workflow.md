# Git & PR Workflow

## Before Committing
Always run: `pnpm typecheck && pnpm test && pnpm lint`

## Commit Messages
- English, imperative mood ("Add feature", not "Added feature")
- Concise, under 72 characters for subject line
- Prefix with type: feat:, fix:, chore:, refactor:, test:, docs:

## Pull Requests
- PR title under 70 characters
- Include summary of changes and test plan
- Reference related issues

## Branching
- main branch is protected
- Feature branches: feat/description
- Fix branches: fix/description
