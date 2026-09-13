// Smoke unit-тест: проверяет целостность проекта и наличие ожидаемых маршрутов в backend.
// Тесты без сети и без запуска серверов — быстрые.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

describe('project smoke', () => {
    test('ключевые файлы проекта существуют', () => {
        for (const f of [
            'package.json', 'jest.config.js', 'AGENTS.md',
            'apps/backend/server.js', 'apps/frontend/index.html', 'apps/frontend/server.js',
        ]) {
            expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
        }
    });

    test('package.json содержит скрипты тестов и dev', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        expect(pkg.scripts.test).toBeDefined();
        expect(pkg.scripts['test:e2e']).toBeDefined();
        expect(pkg.scripts['test:unit']).toBeDefined();
        expect(pkg.scripts.dev).toBeDefined();
    });

    test('backend содержит все заявленные в AGENTS.md маршруты', () => {
        const src = fs.readFileSync(path.join(ROOT, 'apps', 'backend', 'server.js'), 'utf8');
        for (const route of [
            "'/register'", "'/login'", "'/logout'", "'/me'", "'/todos'", "'/todos/reorder'", "'/health'",
        ]) {
            expect(src).toContain(route);
        }
    });
});
