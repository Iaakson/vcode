# Сборка образа TODO List (Vue 3 + Tailwind через CDN, раздаётся Node.js-сервером)
# Сборка:  docker build -t vcode-todo .
# Запуск:  docker run -d -p 3000:3000 --name vcode-todo --restart unless-stopped vcode-todo

FROM node:22-alpine

# Рабочая директория в контейнере
WORKDIR /app

# Копируем зависимости и устанавливаем (зависимостей нет — package-lock не требуется)
COPY package.json ./

# Копируем исходники
COPY index.html server.js ./

# Приложение не имеет node_modules (чистый Node http), но на случай добавления
# зависимостей в package.json выполняем установку
RUN npm install --omit=dev --no-audit --no-fund || true

# Порт, который слушает server.js
EXPOSE 3000

# Запуск от непривилегированного пользователя
USER node

CMD ["node", "server.js"]
