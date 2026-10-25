FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/yougle.sqlite

WORKDIR /app

RUN groupadd --system yougle \
    && useradd --system --gid yougle --home-dir /app yougle \
    && mkdir -p /app/data \
    && chown -R yougle:yougle /app

COPY --from=build --chown=yougle:yougle /app/package.json /app/package-lock.json ./
COPY --from=build --chown=yougle:yougle /app/node_modules ./node_modules
COPY --from=build --chown=yougle:yougle /app/dist ./dist

USER yougle

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "start"]

