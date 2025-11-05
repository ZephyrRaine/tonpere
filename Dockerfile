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
# Install su-exec for switching users
RUN apk add --no-cache su-exec

# Create a non-root user
RUN addgroup -S nodegrp && adduser -S nodeusr -G nodegrp

# Copy node_modules from deps layer
COPY --from=deps /app/node_modules ./node_modules

# Copy app source
COPY . .

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Ensure data directory exists and is writable
RUN mkdir -p /app/data && chown -R nodeusr:nodegrp /app

# Use entrypoint to handle permissions (runs as root, then switches to nodeusr)
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
