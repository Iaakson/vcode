// globalSetup для e2e: поднимает backend (3101) + frontend (3100) с чистой тестовой БД.
// Адреса прокидываются в процессные переменные E2E_BACKEND_URL / E2E_FRONTEND_URL.
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_PORT = 3101;
const FRONTEND_PORT = 3100;
const DB_PATH = path.join(ROOT, 'apps', 'backend', 'data', 'todos.test.db');

async function waitFor(url, tries = 60) {
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch { /* ещё не поднялся */ }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`Сервер не ответил на ${url} за ${tries * 250}мс`);
}

module.exports = async function () {
    // чистая тестовая БД (основная todos.db не затрагивается)
    for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
        if (fs.existsSync(f)) fs.rmSync(f);
    }

    const env = {
        ...process.env,
        PORT: String(BACKEND_PORT),
        DB_PATH,
        BACKEND_PORT: String(BACKEND_PORT),
        ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || 'testadmin123',
    };

    const backend = spawn(process.execPath, [path.join(ROOT, 'apps', 'backend', 'server.js')], {
        env, stdio: 'inherit', windowsHide: true,
    });
    const frontend = spawn(process.execPath, [path.join(ROOT, 'apps', 'frontend', 'server.js')], {
        env: { ...env, PORT: String(FRONTEND_PORT) }, stdio: 'inherit', windowsHide: true,
    });

    await waitFor(`http://localhost:${BACKEND_PORT}/api/health`);
    await waitFor(`http://localhost:${FRONTEND_PORT}/`);

    // адреса доступны и в тестах, и в teardown (через process.env воркеров jest наследуют process глобальный)
    process.env.E2E_BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
    process.env.E2E_FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
    // pids для teardown
    process.env.E2E_BACKEND_PID = String(backend.pid);
    process.env.E2E_FRONTEND_PID = String(frontend.pid);
};
