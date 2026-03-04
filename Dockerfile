FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_MODE=standalone

RUN pnpm --dir backend build && pnpm --dir frontend build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    BACKEND_ROLE=all \
    FRONTEND_ROLE=all \
    BACKEND_PORT=7860 \
    FRONTEND_PORT=3001 \
    REQUIRE_PERSISTENT_STORAGE=false

RUN apk add --no-cache caddy

# Runtime backend dependencies and sources
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/backend/node_modules /app/backend/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/backend/package.json /app/backend/package.json
COPY --from=build /app/backend/tsconfig.json /app/backend/tsconfig.json
COPY --from=build /app/backend/drizzle.config.ts /app/backend/drizzle.config.ts
COPY --from=build /app/backend/src /app/backend/src
COPY --from=build /app/backend/dist /app/backend/dist

# Runtime frontend standalone output
COPY --from=build /app/frontend/.next/standalone /app/
COPY --from=build /app/frontend/.next/static /app/frontend/.next/static
COPY --from=build /app/frontend/public /app/frontend/public

COPY Caddyfile /etc/caddy/Caddyfile
COPY scripts/space-entrypoint.sh /usr/local/bin/space-entrypoint.sh

RUN chmod +x /usr/local/bin/space-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/live || exit 1

ENTRYPOINT ["/usr/local/bin/space-entrypoint.sh"]
