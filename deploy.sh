#!/usr/bin/env bash
# ============================================================
# Деплой текущей версии проекта с локального ПК на сервер
#
# Использование:
#   ./deploy.sh                  — деплой на сервер по умолчанию
#   ./deploy.sh user@host        — деплой на указанный сервер
#   SSH_PORT=22 ./deploy.sh      — с нестандартным портом SSH
#
# Сервер по умолчанию: root@31.76.41.104 (Ubuntu, docker compose)
#
# Что делает:
#   1. Проверяет SSH-подключение
#   2. Отправляет текущие исходники с локального ПК на сервер в /opt/vcode
#   3. Пересобирает и перезапускает docker compose (sqlite в volume)
#   4. Проверяет, что приложение отвечает на порту 3000
# ============================================================

set -euo pipefail

# ---------- Настройки ----------
TARGET="${1:-${TARGET:-root@31.76.41.104}}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/opt/vcode}"
LOCAL_PORT="${LOCAL_PORT:-3000}"
SSH_OPTS=(-p "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
SCP_OPTS=(-P "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

echo "🚀 Деплой: $(pwd) → $TARGET:$REMOTE_DIR"

# ---------- 1. Проверка подключения ----------
echo "📡 Проверка SSH-подключения..."
if ! ssh "${SSH_OPTS[@]}" "$TARGET" "echo ok" >/dev/null 2>&1; then
    echo "❌ Нет SSH-подключения к $TARGET. Проверьте: ssh $TARGET" >&2
    exit 1
fi
echo "✅ Подключение работает"

# ---------- 2. Проверка локальных файлов ----------
for f in apps/backend/server.js apps/frontend/index.html apps/frontend/server.js package.json Dockerfile docker-compose.yml; do
    if [[ ! -f "$f" ]]; then
        echo "❌ Локальный файл не найден: $f" >&2
        exit 1
    fi
done

# ---------- 3. Отправка исходников ----------
echo "📤 Отправка исходников с локального ПК..."
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p '$REMOTE_DIR'" >/dev/null
scp "${SCP_OPTS[@]}" Dockerfile docker-compose.yml package.json "$TARGET:$REMOTE_DIR/"
scp "${SCP_OPTS[@]}" apps/backend/server.js "$TARGET:$REMOTE_DIR/apps/backend/"
scp "${SCP_OPTS[@]}" apps/frontend/index.html apps/frontend/server.js "$TARGET:$REMOTE_DIR/apps/frontend/"
echo "✅ Исходники отправлены"

# ---------- 4. Пересборка и перезапуск docker compose ----------
echo "🐳 Пересборка и перезапуск контейнера..."
ssh "${SSH_OPTS[@]}" "$TARGET" "cd '$REMOTE_DIR' && docker compose up -d --build 2>&1 | tail -3"
sleep 3

# ---------- 5. Проверка ----------
echo "🔍 Проверка приложения..."
HOST_ONLY="${TARGET##*@}"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://$HOST_ONLY:$LOCAL_PORT/api/health" || echo "000")
if [[ "$CODE" == "200" ]]; then
    echo "✅ Деплой успешен! Приложение отвечает: http://$HOST_ONLY:$LOCAL_PORT (HTTP $CODE)"
    ssh "${SSH_OPTS[@]}" "$TARGET" "docker ps --filter name=vcode-todo --format '{{.Names}}: {{.Status}}'" || true
else
    echo "❌ Приложение не отвечает (HTTP $CODE). Логи на сервере: docker logs vcode-todo" >&2
    exit 1
fi
