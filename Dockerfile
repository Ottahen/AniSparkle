FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY index.html ./index.html
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./package.json
COPY server.mjs ./server.mjs
COPY src/config.js src/provider-resolver.js ./src/
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server.mjs"]
