# Multi-stage production Dockerfile
# Stage 1: Build & compile TypeScript
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Hardened, least-privilege production runner
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl bash

ENV NODE_ENV=production
ENV PORT=3300
ENV HOST=0.0.0.0

# Create required persistent directories with appropriate ownership
RUN mkdir -p /app/data /app/logs /app/backups && \
    chown -R node:node /app

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts

USER node

EXPOSE 3300

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3300/health/live || exit 1

CMD ["npm", "run", "start:prod"]
