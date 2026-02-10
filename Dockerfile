# Use Node.js 20 as base image
FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p data public/uploads

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7860
ENV HOSTNAME="0.0.0.0"

# Build the application
RUN pnpm build

# Initialize database and seed
RUN pnpm db:push && pnpm db:seed || echo "Database initialization skipped"

# Expose port
EXPOSE 7860

# Start the server
CMD ["pnpm", "start"]
