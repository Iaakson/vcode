// Хелпер для e2e-тестов: fetch с автоматическим cookie-jar (сессия в httpOnly cookie).
// База: E2E_BACKEND_URL (прокидывается global-setup). Использование:
//   const { api, registerUser } = require('../helpers');
//   const { api: userApi, user } = await registerUser('ivan');
'use strict';

const BASE = process.env.E2E_BACKEND_URL || 'http://localhost:3101';

function makeClient(cookie) {
    return async function api(method, path, body) {
        const res = await fetch(`${BASE}${path}`, {
            method,
            headers: {
                ...(cookie ? { Cookie: cookie } : {}),
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        let data = null;
        const text = await res.text();
        if (text) { try { data = JSON.parse(text); } catch { data = text; } }
        return { status: res.status, data };
    };
}

// Регистрирует уникального пользователя и возвращает его клиент + имя/пароль.
function registerUser(prefix = 'user') {
    const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const password = 'password123';
    const api = makeClient();
    return api('POST', '/api/register', { username, password }).then(res => {
        if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res)}`);
        return { api, username, password, id: res.data.id };
    });
}

module.exports = { api: makeClient(), makeClient, registerUser, BASE };
