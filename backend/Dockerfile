FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN PROXY_RUNTIME=true SITES_HOSTED=false npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node backend/*.mjs ./
COPY --from=build --chown=node:node /app/dist ./public
COPY --chown=node:node LICENSE ./public/LICENSE
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
