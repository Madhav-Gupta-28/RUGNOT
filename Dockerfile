# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json package-lock.json ./
COPY packages/agent/package.json ./packages/agent/
COPY packages/dashboard/package.json ./packages/dashboard/

# Install all deps (including devDeps needed for build)
RUN npm ci

# Copy source
COPY . .

# Build agent (TypeScript → dist/)
RUN npm run build -w @rugnot/agent

# Build dashboard (Vite → packages/dashboard/dist/)
RUN npm run build -w @rugnot/dashboard

# ── Production image ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Only production deps
COPY package.json package-lock.json ./
COPY packages/agent/package.json ./packages/agent/
COPY packages/dashboard/package.json ./packages/dashboard/
RUN npm ci --omit=dev

# Copy compiled artefacts
COPY --from=builder /app/packages/agent/dist ./packages/agent/dist
COPY --from=builder /app/packages/dashboard/dist ./packages/dashboard/dist

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "packages/agent/dist/index.js"]
