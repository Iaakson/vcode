// Синхронный субагент для task-batch-solver.
// Запуск: node run-task.mjs <tasks/some-task.md>
// Работает через SDK pi: создаёт сессию с cwd = корень проекта,
// отправляет промпт и ждёт полного завершения (prompt() резолвится после финиша).
//
// Путь к пакету pi-coding-agent берётся из PI_PACKAGE_DIR или из стандартного
// пути установки pi-node (Windows).

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const CANDIDATE_DIRS = [
  process.env.PI_PACKAGE_DIR,
  "C:/Users/Admin/AppData/Local/pi-node/current/node_modules/@earendil-works/pi-coding-agent",
].filter(Boolean);

function resolvePiDir() {
  for (const dir of CANDIDATE_DIRS) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
  }
  console.error("Не найден пакет @earendil-works/pi-coding-agent (задай PI_PACKAGE_DIR)");
  process.exit(1);
}

const piDir = resolvePiDir();
const require = createRequire(import.meta.url);
const {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} = require(path.join(piDir, "dist", "index.js"));

const taskFile = process.argv[2];
if (!taskFile || !fs.existsSync(taskFile)) {
  console.error(`Файл задачи не найден: ${taskFile}`);
  process.exit(1);
}
const taskContent = fs.readFileSync(taskFile, "utf8");
const projectRoot = path.resolve(process.cwd());

const SYSTEM_PROMPT = `Ты субагент-исполнитель задач проекта vcode (TODO List). Ты работаешь автономно, пользователь тебя не видит — вопросов не задавай, все технические решения принимай сам на основе контекста проекта и кодовой базы.

Контекст проекта описан в корневом AGENTS.md (он уже загружен). Ключевые правила:
- Весь фронтенд — один файл apps/frontend/index.html (Vue 3 + Tailwind через CDN), правки UI только там.
- Backend — apps/backend/server.js (SQLite через node:sqlite, без npm-зависимостей).
- Тесты — Jest: unit в tests/unit, e2e в tests/e2e (серверы сами поднимаются на 3100/3101, тестовая БД todos.test.db); принципы — docs/testing.md.
- После каждого функционала прогонять ВСЕ тесты: npm test — всё должно быть зелёным.
- Локально docker не запускать, только нативный node (npm run dev).
- Результат работы сообщи в конце ответа кратко: что сделано, как проверено, результат npm test.

Порядок работы: прочитай задачу (она дана в промпте) → изучи затронутые файлы и смежный код → реализуй по ТЗ → проверь каждый критерий приёмки (npm run dev, chrome-devtools и/или curl по API; без сессии API отвечает 401) → напиши тесты по «Сценариям для тестирования» из ТЗ и docs/testing.md → прогони npm test, почини всё сломанное → в конце выдай итоговый отчёт.`;

const modelRuntime = await ModelRuntime.create();

const { session } = await createAgentSession({
  cwd: projectRoot,
  modelRuntime,
  sessionManager: SessionManager.inMemory(projectRoot),
});

session.subscribe((event) => {
  if (event.type === "message_update") {
    const e = event.assistantMessageEvent;
    if (e.type === "text_delta") process.stdout.write(e.delta);
  }
  if (event.type === "tool_execution_start") {
    console.log(`\n[tool] ${event.toolName}`);
  }
});

try {
  await session.prompt(`${SYSTEM_PROMPT}\n\n---\n\nЗАДАЧА (файл ${taskFile}):\n\n${taskContent}`);
  console.log("\n[subagent] Готово.");
  process.exit(0);
} catch (err) {
  console.error(`\n[subagent] Ошибка: ${err?.message ?? err}`);
  process.exit(1);
}
