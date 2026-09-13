// e2e: задачи — создание, список, отметка выполненными, правка, удаление, clearCompleted, reorder, изоляция пользователей.
'use strict';

const { api, registerUser } = require('./helpers');

describe('todos (e2e)', () => {
    test('без сессии /api/todos отвечает 401', async () => {
        expect((await api('GET', '/api/todos')).status).toBe(401);
    });

    test('создание задачи и получение списка', async () => {
        const { api: user } = await registerUser('todo');
        const created = await user('POST', '/api/todos', { text: 'Купить молоко', priority: 'high', due: '2030-01-01' });
        expect(created.status).toBe(201);
        expect(created.data.text).toBe('Купить молоко');
        expect(created.data.done).toBe(false);
        expect(created.data.priority).toBe('high');

        const list = await user('GET', '/api/todos');
        expect(list.status).toBe(200);
        expect(list.data.some(t => t.id === created.data.id)).toBe(true);
    });

    test('создание без текста — 400; неизвестный приоритет → medium', async () => {
        const { api: user } = await registerUser('val');
        expect((await user('POST', '/api/todos', { text: '' })).status).toBe(400);

        const res = await user('POST', '/api/todos', { text: 'задача', priority: 'urgent' });
        expect(res.status).toBe(201);
        expect(res.data.priority).toBe('medium');
    });

    test('пометка выполненной (PATCH done) и отмена', async () => {
        const { api: user } = await registerUser('done');
        const t = (await user('POST', '/api/todos', { text: 'Сделать ДЗ' })).data;

        const marked = await user('PATCH', `/api/todos/${t.id}`, { done: true });
        expect(marked.status).toBe(200);
        expect(marked.data.done).toBe(true);

        const unmarked = await user('PATCH', `/api/todos/${t.id}`, { done: false });
        expect(unmarked.data.done).toBe(false);
    });

    test('правка текста, приоритета и дедлайна', async () => {
        const { api: user } = await registerUser('edit');
        const t = (await user('POST', '/api/todos', { text: 'старый текст' })).data;
        const res = await user('PATCH', `/api/todos/${t.id}`, { text: 'новый текст', priority: 'low', due: '2031-05-05' });
        expect(res.data.text).toBe('новый текст');
        expect(res.data.priority).toBe('low');
        expect(res.data.due).toBe('2031-05-05');
    });

    test('PATCH/DELETE несуществующей задачи — 404', async () => {
        const { api: user } = await registerUser('nf');
        expect((await user('PATCH', '/api/todos/999999', { done: true })).status).toBe(404);
        expect((await user('DELETE', '/api/todos/999999')).status).toBe(404);
    });

    test('удаление задачи', async () => {
        const { api: user } = await registerUser('del');
        const t = (await user('POST', '/api/todos', { text: 'на удаление' })).data;
        expect((await user('DELETE', `/api/todos/${t.id}`)).status).toBe(200);
        const list = await user('GET', '/api/todos');
        expect(list.data.some(x => x.id === t.id)).toBe(false);
    });

    test('clearCompleted (DELETE /api/todos) удаляет только выполненные', async () => {
        const { api: user } = await registerUser('clear');
        const a = (await user('POST', '/api/todos', { text: 'выполнить меня' })).data;
        const b = (await user('POST', '/api/todos', { text: 'остаться' })).data;
        await user('PATCH', `/api/todos/${a.id}`, { done: true });

        const res = await user('DELETE', '/api/todos');
        expect(res.status).toBe(200);
        const ids = res.data.map(t => t.id);
        expect(ids).not.toContain(a.id);
        expect(ids).toContain(b.id);
    });

    test('reorder меняет порядок и сохраняется', async () => {
        const { api: user } = await registerUser('order');
        const t1 = (await user('POST', '/api/todos', { text: 'первая' })).data;
        const t2 = (await user('POST', '/api/todos', { text: 'вторая' })).data;
        const t3 = (await user('POST', '/api/todos', { text: 'третья' })).data;

        const res = await user('POST', '/api/todos/reorder', { ids: [t3.id, t1.id, t2.id] });
        expect(res.status).toBe(200);
        const ids = res.data.map(t => t.id);
        expect(ids).toEqual([t3.id, t1.id, t2.id]);

        // порядок сохранился после перечитывания
        const list = await user('GET', '/api/todos');
        expect(list.data.map(t => t.id)).toEqual([t3.id, t1.id, t2.id]);
    });

    test('задачи изолированы между пользователями', async () => {
        const { api: userA } = await registerUser('isoA');
        const { api: userB } = await registerUser('isoB');
        const t = (await userA('POST', '/api/todos', { text: 'только для A' })).data;

        const listB = await userB('GET', '/api/todos');
        expect(listB.data.some(x => x.id === t.id)).toBe(false);
        // B не может изменить или удалить задачу A
        expect((await userB('PATCH', `/api/todos/${t.id}`, { done: true })).status).toBe(404);
        expect((await userB('DELETE', `/api/todos/${t.id}`)).status).toBe(404);
    });
});
