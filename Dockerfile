# Production image for the API. Two stages: build with dev dependencies, run with only
# what `npm start` needs. Render uses its Node runtime (render.yaml), so this is for any
# other host — and for running the whole stack locally with `docker compose up`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
# `prepare` would run husky; skip hooks in a container.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
# Migrations run at boot (src/server.ts) and need the SQL files.
COPY drizzle ./drizzle
USER node
EXPOSE 4010
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:4010/health || exit 1
CMD ["node", "dist/server.js"]
