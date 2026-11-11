# syntax=docker/dockerfile:1
# Targets: `api` (API and market-data processes, same image) and `web` (nginx: SPA plus /api proxy).
ARG NODE_VERSION=26.13.0

FROM node:${NODE_VERSION}-alpine AS build
RUN npm install -g pnpm@10.34.9
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/resilience/package.json packages/resilience/
COPY packages/compute-client/package.json packages/compute-client/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm build:packages \
 && pnpm --filter @aitrader/api build \
 && pnpm --filter @aitrader/web build \
 && pnpm --filter @aitrader/api --prod deploy --legacy /out

FROM node:${NODE_VERSION}-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/ ./
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 8000
CMD ["node", "--max-old-space-size=448", "dist/main.js"]

FROM nginx:1-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
