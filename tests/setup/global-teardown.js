// globalTeardown для e2e: останавливает тестовые серверы и удаляет тестовую БД.
'use strict';

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(path.resolve(__dirname, '..', '..'), 'apps', 'backend', 'data', 'todos.test.db');

function killPid(pid) {
    if (!pid) return;
    if (process.platform === 'win32') {
        try { require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* уже мёртв */ }
    } else {
        try { process.kill(Number(pid), 'SIGKILL'); } catch { /* уже мёртв */ }
    }
}

module.exports = async function () {
    killPid(process.env.E2E_BACKEND_PID);
    killPid(process.env.E2E_FRONTEND_PID);
    // дать портам освободиться
    await new Promise(r => setTimeout(r, 500));
    for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
        if (fs.existsSync(f)) {
            try { fs.rmSync(f); } catch { /* Windows может держать файл мгновение */ }
        }
    }
};
