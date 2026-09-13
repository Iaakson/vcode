// Конфигурация тестов: два проекта — unit (быстрые, без сети) и e2e (HTTP API против реальных серверов)
// Запуск: npm test (все) | npm run test:unit | npm run test:e2e
'use strict';

module.exports = {
    projects: [
        {
            displayName: 'unit',
            testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
        },
        {
            displayName: 'e2e',
            testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
            globalSetup: '<rootDir>/tests/setup/global-setup.js',
            globalTeardown: '<rootDir>/tests/setup/global-teardown.js',
            testTimeout: 15000,
        },
    ],
};
