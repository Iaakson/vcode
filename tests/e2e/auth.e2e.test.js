// e2e: аутентификация — регистрация, вход, выход, /api/me, 401 без сессии.
'use strict';

const { api, makeClient, registerUser } = require('./helpers');

describe('auth (e2e)', () => {
    test('без сессии /api/me отвечает 401', async () => {
        const res = await api('GET', '/api/me');
        expect(res.status).toBe(401);
    });

    test('регистрация создаёт пользователя и ставит сессию', async () => {
        const { api: fresh } = await registerUser('newuser');
        const me = await fresh('GET', '/api/me');
        expect(me.status).toBe(200);
        expect(me.data.username).toMatch(/^newuser_/);
        expect(me.data.id).toBeGreaterThan(0);
    });

    test('регистрация с коротким паролем — 400', async () => {
        const res = await api('POST', '/api/register', { username: `short_${Date.now()}`, password: '123' });
        expect(res.status).toBe(400);
        expect(res.data.error).toBeDefined();
    });

    test('повторная регистрация того же имени — 400', async () => {
        const { username } = await registerUser('dup');
        const res = await api('POST', '/api/register', { username, password: 'password123' });
        expect(res.status).toBe(400);
    });

    test('вход с верным паролем — 200, с неверным — 401', async () => {
        const { api: fresh, username, password } = await registerUser('login');
        // выход, чтобы проверить именно вход
        await fresh('POST', '/api/logout');
        expect((await fresh('GET', '/api/me')).status).toBe(401);

        const bad = await makeClient()('POST', '/api/login', { username, password: 'wrongpass' });
        expect(bad.status).toBe(401);

        const c = makeClient();
        const ok = await c('POST', '/api/login', { username, password });
        expect(ok.status).toBe(200);
        expect(ok.data.username).toBe(username);

        const me = await c('GET', '/api/me');
        expect(me.status).toBe(200);
        expect(me.data.username).toBe(username);
    });

    test('logout удаляет сессию', async () => {
        const { api: fresh } = await registerUser('out');
        await fresh('POST', '/api/logout');
        expect((await fresh('GET', '/api/me')).status).toBe(401);
    });
});
