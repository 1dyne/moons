# MOONS: one container serves the web app and the API on $PORT.
# The planner Satellite is the same image as a second Railway service with
# WEB_DIST_DIR=/app/artifacts/planner/dist/public (see docs/reports/planner-p1.md).
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG RAILWAY_GIT_COMMIT_SHA
ENV MOONS_BUILD_COMMIT=$RAILWAY_GIT_COMMIT_SHA
RUN BASE_PATH=/ pnpm --filter @workspace/moons run build \
 && BASE_PATH=/ pnpm --filter @workspace/planner run build \
 && pnpm --filter @workspace/api-server run build
ENV NODE_ENV=production \
    WEB_DIST_DIR=/app/artifacts/moons/dist/public
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
