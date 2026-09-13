#!/usr/bin/env bash
# ============================================================
# Деплой текущей версии проекта с локального ПК на сервер
#
# Использование:
#   ./deploy.sh                  — деплой на сервер по умолчанию
#   ./deploy.sh user@host        — деплой на указанный сервер
#   SSH_PORT=22 ./deploy.sh      — с нестандартным портом SSH
#
# Сервер по умолчанию: Admin@192.168.1.111 (Windows, служба vcode)
#
# Что делает:
#   1. Проверяет SSH-подключение
#   2. Отправляет текущие исходники (index.html, server.js, package.json)
#      с локального ПК на сервер
#   3. Перезапускает службу vcode (WinSW)
#   4. Проверяет, что приложение отвечает на порту 3000
# ============================================================

set -euo pipefail

# ---------- Настройки ----------
TARGET="${1:-${TARGET:-Admin@192.168.1.111}}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-C:/opt/vcode}"
SERVICE_NAME="${SERVICE_NAME:-vcode}"
LOCAL_PORT="${LOCAL_PORT:-3000}"
SSH_OPTS=(-p "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

echo "🚀 Деплой: $(pwd) → $TARGET:$REMOTE_DIR"

# ---------- 1. Проверка подключения ----------
echo "📡 Проверка SSH-подключения..."
if ! ssh "${SSH_OPTS[@]}" "$TARGET" "echo ok" >/dev/null 2>&1; then
    echo "❌ Нет SSH-подключения к $TARGET. Проверьте: ssh $TARGET" >&2
    exit 1
fi
echo "✅ Подключение работает"

# ---------- 2. Отправка исходников ----------
echo "📤 Отправка исходников с локального ПК..."
ssh "${SSH_OPTS[@]}" "$TARGET" "if not exist \"$REMOTE_DIR\\logs\" mkdir \"$REMOTE_DIR\\logs\" 2>nul & echo DIR_OK" >/dev/null

for f in index.html server.js package.json; do
    if [[ ! -f "$f" ]]; then
        echo "❌ Локальный файл не найден: $f" >&2
        exit 1
    fi
done

scp -P "$SSH_PORT" -o BatchMode=yes index.html server.js package.json "$TARGET:$REMOTE_DIR/"
echo "✅ Исходники отправлены"

# ---------- 3. Перезапуск службы ----------
echo "⚙️  Перезапуск службы $SERVICE_NAME..."
ssh "${SSH_OPTS[@]}" "$TARGET" "sc query $SERVICE_NAME >nul 2>&1 && (cd /d \"$REMOTE_DIR\" && $SERVICE_NAME-service.exe restart) || echo SERVICE_MISSING" | tail -1
sleep 2

# ---------- 4. Проверка ----------
echo "🔍 Проверка приложения..."
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$LOCAL_PORT/" || echo "000")
if [[ "$CODE" == "200" ]]; then
    echo "✅ Деплой успешен! Приложение отвечает: http://localhost:$LOCAL_PORT (HTTP $CODE)"
else
    echo "❌ Приложение не отвечает (HTTP $CODE). Логи на сервере: $REMOTE_DIR/logs/" >&2
    exit 1
fi
