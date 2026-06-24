# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/backend/package.json ./packages/backend/
RUN npm ci

COPY . .
RUN npm run build -w @dance-videos/shared \
    && npm run build -w @dance-videos/frontend \
    && npm run build -w @dance-videos/backend

FROM node:22-bookworm-slim AS runtime

# install `ffmpeg` (`ffmpeg` + `ffprobe`) and `util-linux` (for `ionice`).
# `nice` is already installed from `coreutils`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        util-linux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

COPY --from=builder /app/packages/frontend/dist /srv/www

RUN mkdir -p /data /storage /temp /logs /branding

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_PATH=/data \
    STORAGE_PATH=/storage \
    TEMP_PATH=/temp \
    LOG_PATH=/logs \
    DIST_DIR=/srv/www \
    BRANDING_PATH=/branding

EXPOSE 3000

CMD ["node", "/app/packages/backend/dist/index.js"]
