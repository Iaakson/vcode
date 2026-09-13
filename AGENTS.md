# AGENTS.md — vcode (TODO List)

## О проекте

**vcode** — TODO List: Vue 3 + TailwindCSS (frontend, через CDN) и Node.js backend с SQLite.
Локально — нативный запуск node (два процесса, docker не используется). Продакшен — один docker-образ.

### Функционал

- **Список задач (TODO):** добавление, отметка выполнения, удаление задач, удаление всех выполненных (`clearCompleted`)
- **Фильтрация и сортировка:** фильтры по статусу, сортировка по приоритету и дедлайну
- **Drag & Drop:** перетаскивание задач для изменения порядка (сохраняется в БД через `POST /api/todos/reorder`)
- **Тёмная тема** с переключением (сохраняется в localStorage — единственное, что хранится на клиенте)
- **Приоритеты** (низкий/средний/высокий) и **дедлайны** с подсветкой просроченных
- **Задачи хранятся в SQLite** (общая таблица `todos` для всех, без аутентификации и привязки к пользователю)
- **Frontend** забирает все данные через API (`/api/todos`)

### Архитектура

```
Локально (нативный node, два процесса):
  apps/frontend/server.js  → порт 3000 (статика + прокси /api → 3001)
  apps/backend/server.js   → порт 3001 (REST API + SQLite)

Продакшен (один docker-образ, docker compose):
  контейнер vcode-todo     → порт 3000
    /api/*  → backend (node apps/backend/server.js, SERVE_STATIC=1)
    / и остальное → frontend (apps/frontend/index.html)
    SQLite  → /data/todos.db (volume vcode_sqlite_data)
```

### Структура проекта

```
vcode/
├── apps/
│   ├── backend/
│   │   └── server.js       # REST API + SQLite (node:sqlite, без npm-зависимостей)
│   └── frontend/
│       ├── index.html      # всё приложение (HTML + Vue + Tailwind, единый файл)
│       └── server.js       # dev-сервер: статика + прокси /api на backend
├── package.json            # скрипты dev/dev:backend/dev:frontend (зависимостей нет)
├── Dockerfile              # один образ: node:22-alpine, backend(/api) + frontend(/)
├── docker-compose.yml      # продакшен, SQLite как volume (vcode_sqlite_data:/data)
├── deploy.sh               # скрипт деплоя на сервер с локального ПК
├── AGENTS.md               # этот файл
└── .dockerignore, .gitignore, .pi/
```

### API

```
GET    /api/todos          — список задач
POST   /api/todos          — создать {text, priority, due}
PATCH  /api/todos/:id      — обновить {done?, text?, priority?, due?}
DELETE /api/todos/:id      — удалить задачу
DELETE /api/todos          — удалить все выполненные
POST   /api/todos/reorder  — новый порядок {ids: [id, ...]}
```

Таблица БД `todos`: `id, text, done, priority, due, position, created_at`.

### Локальный запуск

```bash
npm run dev          # backend (3001) + frontend (3000) в одном вызове
# или по отдельности:
npm run dev:backend  # API + SQLite на http://localhost:3001
npm run dev:frontend # UI на http://localhost:3000 (проксирует /api на 3001)
```

Локальная БД: `apps/backend/data/todos.db` (в `.gitignore`). Порт 3000 должен быть свободен.

---

## Где запущен проект (продакшен)

- **Сервер:** `root@31.76.41.104`, порт SSH `22` (Ubuntu 24.04)
- **Каталог:** `/opt/vcode` (исходники + docker-compose.yml)
- **Docker:** v29.1.3, Compose v2.40.3
- **Запуск:** docker compose, контейнер `vcode-todo` (порт 3000, `restart: unless-stopped`, healthcheck)
- **SQLite:** volume `vcode_sqlite_data` → `/data/todos.db` — данные переживают пересоздание контейнера (проверено)
- **Доступ:** http://31.76.41.104:3000 (frontend HTTP 200, API `/api/todos` HTTP 200)
- **Автозапуск при старте сервера:** `restart: unless-stopped` + Docker daemon (docker.io стартует как системная служба)
- **Логи:** `docker logs vcode-todo`

Полезные команды на сервере:

```bash
docker ps --filter name=vcode-todo        # состояние
docker logs vcode-todo -f                 # логи в реальном времени
docker compose restart                    # перезапуск (cd /opt/vcode)
docker compose down && docker compose up -d   # пересоздание (volume сохраняется)
```

---

## Как обновлять (деплой)

Скрипт в корне проекта (запускается с локального ПК, требует SSH-ключ на сервер):

```bash
./deploy.sh
```

Что делает скрипт:
1. Проверяет SSH-подключение к `root@31.76.41.104`
2. Отправляет текущие исходники (`apps/backend/server.js`, `apps/frontend/index.html`, `apps/frontend/server.js`, `package.json`, `Dockerfile`, `docker-compose.yml`) с локального ПК на сервер в `/opt/vcode`
3. Пересобирает и перезапускает docker compose (`docker compose up -d --build`) — SQLite в volume, данные сохраняются
4. Проверяет HTTP 200 на `http://31.76.41.104:3000/api/todos`

Настройки через переменные окружения: `TARGET` (user@host), `SSH_PORT`, `REMOTE_DIR`, `LOCAL_PORT`. Пример: `SSH_PORT=2222 ./deploy.sh`.

Ручной деплой (без скрипта):

```bash
scp Dockerfile docker-compose.yml package.json root@31.76.41.104:/opt/vcode/
scp apps/backend/server.js root@31.76.41.104:/opt/vcode/apps/backend/
scp apps/frontend/index.html apps/frontend/server.js root@31.76.41.104:/opt/vcode/apps/frontend/
ssh root@31.76.41.104 "cd /opt/vcode && docker compose up -d --build"
```

---

## Заметки для агентов

- **Нет npm-зависимостей** — backend использует встроенный `node:sqlite` (Node ≥ 22.5; в docker `node:22-alpine`), `npm install` не требуется.
- **Локально docker не запускать** — только нативный запуск node (`npm run dev`). Docker используется только на бою.
- Весь фронтенд — один файл `apps/frontend/index.html`; правки UI делаются только там, пересборка не нужна.
- Все данные задач — через API (`/api/todos`); в localStorage хранится только тема.
- После правок `server.js` или `index.html` обязательно запустить `./deploy.sh`.
- При изменении портa/путей БД — править и `Dockerfile`/`docker-compose.yml`, и пере-деплоить.
- Устаревшие файлы удалены: корневые `index.html`/`server.js` (v1), `deploy/vcode.service`, `deploy/vcode-service.xml` (старый systemd/WinSW вариант — прод теперь в docker).
