# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies separately for better caching
FROM base AS deps
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

FROM base AS runner
# Create a non-root user
RUN addgroup -S nodegrp && adduser -S nodeusr -G nodegrp

# Copy node_modules from deps layer
COPY --from=deps /app/node_modules ./node_modules

# Copy app source
COPY . .

# Ensure data directory exists and is writable
RUN mkdir -p /app/data && chown -R nodeusr:nodegrp /app
USER nodeusr

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
