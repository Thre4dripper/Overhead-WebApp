# Overhead API — one long-running Node process (WebSocket fan-out + OpenSky poller). Build from the repo root:
#   docker build -f apps/api/Dockerfile -t overhead-api .
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/altitude/package.json packages/altitude/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @overhead/api...
COPY packages/altitude packages/altitude
COPY packages/shared packages/shared
COPY apps/api apps/api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 AIRCRAFT_DB_CSV=/data/aircraft-db.csv
# the aircraft database (~95 MB) is downloaded here on first start; mount a volume to keep it across deploys
VOLUME ["/data"]
EXPOSE 8787
WORKDIR /app/apps/api
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
