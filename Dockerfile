# Реестр инвазивной пренатальной диагностики.
#
# Сборка идёт в три стадии:
#   builder — ставит зависимости и собирает сервер и фронтенд;
#   app     — то, что запускается как API (node:22-slim);
#   web     — Caddy с готовым фронтендом внутри, он же проксирует /api на app.
#
# Собирать вручную не нужно: `docker compose build` соберёт обе нужные стадии.

# ─────────────────────────── Стадия 1: сборка ───────────────────────────
FROM node:22-slim AS builder

# openssl нужен Prisma для генерации клиента
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Сначала только манифесты — так слой с зависимостями переиспользуется между сборками
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm ci

# Теперь исходники
COPY server ./server
COPY web ./web

# На сервере база — PostgreSQL, а в репозитории схема настроена на SQLite,
# чтобы разработка на ноутбуке работала без установки базы.
# Подменяем провайдер только в копии схемы внутри образа — файл в репозитории не меняется.
ARG DB_PROVIDER=postgresql
RUN sed -i "s/provider = \"sqlite\"/provider = \"${DB_PROVIDER}\"/" server/prisma/schema.prisma

# Клиент Prisma под postgresql + сборка сервера (tsc) и фронтенда (vite)
RUN npx prisma generate --schema=server/prisma/schema.prisma
RUN npm run build

# ─────────────────────────── Стадия 2: приложение (API) ───────────────────────────
FROM node:22-slim AS app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3001 \
    UPLOAD_DIR=/app/uploads

WORKDIR /app

# node_modules переносим целиком, вместе со средствами разработки: в них лежат
# prisma (создание таблиц) и tsx (наполнение справочников через `npm run seed -w server`).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Папку server копируем целиком: кроме собранного dist нужны schema.prisma и prisma/seed.ts,
# а seed.ts читает список справочников из server/src/dictionaries.ts.
COPY --from=builder /app/server ./server

RUN mkdir -p /app/uploads && chown -R node:node /app

USER node
EXPOSE 3001

# Проверка «жив ли сервис» — тот же маршрут, что и в docker-compose.yml
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]

# ─────────────────────────── Стадия 3: фронтенд и веб-сервер ───────────────────────────
# Сервер приложения раздаёт только /api и ничего не знает о собранном фронтенде,
# поэтому статику отдаёт отдельный контейнер с Caddy. Он же терминирует HTTPS.
FROM caddy:2-alpine AS web

COPY --from=builder /app/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
