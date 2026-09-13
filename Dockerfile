# Сборка образа TODO List — один образ: backend (/api) + frontend (/)
# БД: SQLite, файл в /data (монтируется как volume в docker-compose)
#
# Сборка:  docker compose up -d --build
# Локально docker не используется — только нативный запуск node.

FROM node:22-alpine

WORKDIR /app

# Копируем приложение (backend + frontend, без npm-зависимостей — чистый node)
COPY apps ./apps

# Каталог для БД SQLite (перезаписывается volume'ом из docker-compose)
RUN mkdir -p /data && chown node:node /data

# Порт, который слушает backend (SERVE_STATIC=1 — раздаёт и frontend)
ENV PORT=3000 \
    HOST=0.0.0.0 \
    SERVE_STATIC=1 \
    DB_PATH=/data/todos.db

EXPOSE 3000

USER node

CMD ["node", "apps/backend/server.js"]
