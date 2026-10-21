FROM node:24.22.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.11.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
COPY demo/export-plugin.mjs ./demo/export-plugin.mjs
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cheddar/api build
RUN VITE_API_BASE_URL=http://127.0.0.1:3101 pnpm --filter @cheddar/web build
RUN VITE_API_BASE_URL=http://localhost:3101 VITE_WEB_BASE_URL=http://127.0.0.1:5173 VITE_PLUGIN_UI_URL= pnpm --filter @cheddar/figma-plugin build

FROM build AS api
WORKDIR /app/apps/api
CMD ["node", "dist/scripts/start-demo.js"]

FROM build AS plugin
CMD ["node", "demo/export-plugin.mjs"]

FROM nginx:stable-alpine AS web
COPY demo/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
