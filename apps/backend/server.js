// TODO List — backend API + (опционально) раздача статики frontend
// БД: SQLite (встроенный модуль node:sqlite, без npm-зависимостей)
// Запуск:  node server.js            — API на порту 3001
//          SERVE_STATIC=1 node server.js — API + статика на одном порту (для docker)
//
// API:
//   POST   /api/register      — регистрация {username, password}
//   POST   /api/login         — вход {username, password}
//   POST   /api/logout        — выход (удаление сессии)
//   GET    /api/me            — текущий пользователь | 401
//   GET    /api/todos          — список задач (текущего пользователя)
//   POST   /api/todos          — создать задачу {text, priority, due}
//   PATCH  /api/todos/:id      — обновить {done?, text?, priority?, due?}
//   DELETE /api/todos/:id      — удалить задачу
//   DELETE /api/todos          — удалить все выполненные
//   POST   /api/todos/reorder  — новый порядок {ids: [id, ...]}
//
// Все /api/todos* требуют авторизации (cookie-сессия, 401 без неё).

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const SERVE_STATIC = process.env.SERVE_STATIC === '1';
const STATIC_DIR = path.resolve(__dirname, '..', 'frontend');
const BACKEND_DIR = __dirname;

// ---------- База данных ----------
const DB_PATH = process.env.DB_PATH || path.join(BACKEND_DIR, 'data', 'todos.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        text     TEXT    NOT NULL,
        done     INTEGER NOT NULL DEFAULT 0,
        priority TEXT    NOT NULL DEFAULT 'medium',
        due      TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT  NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        salt          TEXT    NOT NULL,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT    PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT    NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT    NOT NULL
    );
`);

// ---------- Миграция: user_id в todos (идемпотентная) ----------
try {
    db.exec('ALTER TABLE todos ADD COLUMN user_id INTEGER');
    console.log('📦 Миграция: добавлена колонка todos.user_id');
} catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
}
const SESSION_DAYS = 30;
const SESSION_TTL_SEC = SESSION_DAYS * 24 * 60 * 60;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Существующие общие задачи закрепляются за администратором (см. ТЗ)
function ensureAdminUser() {
    let row = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    if (!row) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(ADMIN_PASSWORD, salt, 64).toString('hex');
        const info = db.prepare('INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)')
            .run('admin', hash, salt);
        row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        console.log('👤 Создан пользователь admin (пароль из ADMIN_PASSWORD)');
    }
    const adminId = Number(row.id);
    const unassigned = db.prepare('SELECT COUNT(*) AS c FROM todos WHERE user_id IS NULL').get().c;
    if (unassigned > 0) {
        db.prepare('UPDATE todos SET user_id = ? WHERE user_id IS NULL').run(adminId);
        console.log(`📦 Миграция: ${unassigned} существующих задач закреплено за admin (id=${adminId})`);
    }
    return adminId;
}
ensureAdminUser();

// ---------- Авторизация ----------
function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
    res.setHeader('Set-Cookie', `vcode_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}`);
    return token;
}

function getSessionUser(req) {
    const cookies = String(req.headers.cookie || '');
    const m = cookies.match(/(?:^|;\s*)vcode_session=([^;]+)/);
    if (!m) return null;
    const row = db.prepare(
        'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
    ).get(m[1], new Date().toISOString());
    return row ? { id: Number(row.id), username: row.username } : null;
}

function deleteSession(req, res) {
    const cookies = String(req.headers.cookie || '');
    const m = cookies.match(/(?:^|;\s*)vcode_session=([^;]+)/);
    if (m) db.prepare('DELETE FROM sessions WHERE token = ?').run(m[1]);
    res.setHeader('Set-Cookie', 'vcode_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

const PRIORITY = new Set(['low', 'medium', 'high']);

function rowToTodo(row) {
    return {
        id: Number(row.id),
        text: row.text,
        done: !!row.done,
        priority: row.priority,
        due: row.due || null,
        position: Number(row.position),
        created_at: row.created_at,
    };
}

function getTodos(userId) {
    const rows = db.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY position, id').all(userId);
    return rows.map(rowToTodo);
}

// ---------- HTTP helpers ----------
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

function sendJson(res, code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', c => {
            size += c.length;
            if (size > 1e6) { reject(new Error('payload too large')); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => {
            if (!chunks.length) return resolve({});
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch { reject(new Error('invalid JSON')); }
        });
        req.on('error', reject);
    });
}

// ---------- API-обработчики ----------
async function handleApi(req, res, urlPath) {
    const parts = urlPath.split('/').filter(Boolean); // ['api', ...]
    const route = '/' + parts.slice(1).join('/');     // '/todos', '/todos/123', ...

    // GET /api/health — healthcheck (без авторизации)
    if (req.method === 'GET' && route === '/health') {
        return sendJson(res, 200, { ok: true });
    }

    // POST /api/register
    if (req.method === 'POST' && route === '/register') {
        const body = await readBody(req);
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!username || username.length > 32) return sendJson(res, 400, { error: 'Введите имя (до 32 символов)' });
        if (password.length < 6) return sendJson(res, 400, { error: 'Пароль должен быть не короче 6 символов' });
        if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
            return sendJson(res, 400, { error: 'Это имя уже занято' });
        }
        const salt = crypto.randomBytes(16).toString('hex');
        const info = db.prepare('INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)')
            .run(username, hashPassword(password, salt), salt);
        createSession(res, Number(info.lastInsertRowid));
        return sendJson(res, 201, { id: Number(info.lastInsertRowid), username });
    }

    // POST /api/login
    if (req.method === 'POST' && route === '/login') {
        const body = await readBody(req);
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!row || hashPassword(password, row.salt) !== row.password_hash) {
            return sendJson(res, 401, { error: 'Неверное имя или пароль' });
        }
        createSession(res, Number(row.id));
        return sendJson(res, 200, { id: Number(row.id), username: row.username });
    }

    // POST /api/logout
    if (req.method === 'POST' && route === '/logout') {
        deleteSession(req, res);
        return sendJson(res, 200, { ok: true });
    }

    // GET /api/me
    if (req.method === 'GET' && route === '/me') {
        const user = getSessionUser(req);
        if (!user) return sendJson(res, 401, { error: 'unauthorized' });
        return sendJson(res, 200, user);
    }

    // --- всё дальше требует авторизации ---
    const user = getSessionUser(req);
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });

    // GET /api/todos
    if (req.method === 'GET' && route === '/todos') {
        return sendJson(res, 200, getTodos(user.id));
    }

    // POST /api/todos/reorder
    if (req.method === 'POST' && route === '/todos/reorder') {
        const body = await readBody(req);
        if (!Array.isArray(body.ids)) return sendJson(res, 400, { error: 'ids must be an array' });
        const update = db.prepare('UPDATE todos SET position = ? WHERE id = ? AND user_id = ?');
        body.ids.forEach((id, i) => update.run(i, Number(id), user.id));
        return sendJson(res, 200, getTodos(user.id));
    }

    // POST /api/todos
    if (req.method === 'POST' && route === '/todos') {
        const body = await readBody(req);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) return sendJson(res, 400, { error: 'text is required' });
        const priority = PRIORITY.has(body.priority) ? body.priority : 'medium';
        const due = typeof body.due === 'string' && body.due ? body.due : null;
        const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM todos WHERE user_id = ?').get(user.id).m;
        const info = db.prepare('INSERT INTO todos (text, done, priority, due, position, user_id) VALUES (?, 0, ?, ?, ?, ?)')
            .run(text, priority, due, maxPos + 1, user.id);
        const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(info.lastInsertRowid);
        return sendJson(res, 201, rowToTodo(row));
    }

    // PATCH /api/todos/:id
    if (req.method === 'PATCH' && /^\d+$/.test(parts[parts.length - 1]) && parts[parts.length - 2] === 'todos') {
        const id = Number(parts[parts.length - 1]);
        const row = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(id, user.id);
        if (!row) return sendJson(res, 404, { error: 'todo not found' });
        const body = await readBody(req);
        const done = typeof body.done === 'boolean' ? (body.done ? 1 : 0) : row.done;
        const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : row.text;
        const priority = PRIORITY.has(body.priority) ? body.priority : row.priority;
        const due = body.due === undefined ? row.due : (body.due ? String(body.due) : null);
        db.prepare('UPDATE todos SET done = ?, text = ?, priority = ?, due = ? WHERE id = ? AND user_id = ?')
            .run(done, text, priority, due, id, user.id);
        return sendJson(res, 200, rowToTodo(db.prepare('SELECT * FROM todos WHERE id = ?').get(id)));
    }

    // DELETE /api/todos/... 
    if (req.method === 'DELETE' && route.startsWith('/todos')) {
        if (route === '/todos') {
            // удалить все выполненные (текущего пользователя)
            db.prepare('DELETE FROM todos WHERE done = 1 AND user_id = ?').run(user.id);
            return sendJson(res, 200, getTodos(user.id));
        }
        const id = Number(parts[parts.length - 1]);
        if (!/^\d+$/.test(parts[parts.length - 1])) return sendJson(res, 400, { error: 'invalid id' });
        const info = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, user.id);
        if (info.changes === 0) return sendJson(res, 404, { error: 'todo not found' });
        return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'not found' });
}

// ---------- Раздача статики (только при SERVE_STATIC=1) ----------
function serveStatic(req, res, urlPath) {
    let p = decodeURIComponent(urlPath.split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const filePath = path.normalize(path.join(STATIC_DIR, p));
    if (!filePath.startsWith(STATIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('403 Forbidden');
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 Not Found');
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

// ---------- Сервер ----------
const server = http.createServer(async (req, res) => {
    const urlPath = req.url || '/';
    try {
        if (urlPath === '/api' || urlPath.startsWith('/api/')) {
            return await handleApi(req, res, urlPath);
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('405 Method Not Allowed');
        }
        if (SERVE_STATIC) return serveStatic(req, res, urlPath);
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found (frontend is served separately in dev)');
    } catch (err) {
        sendJson(res, 500, { error: err.message || 'internal error' });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`✅ Backend запущен: http://localhost:${PORT}`);
    console.log(`🗄️  БД: ${DB_PATH}`);
    if (SERVE_STATIC) console.log(`📂 Раздаёт frontend из: ${STATIC_DIR}`);
});
