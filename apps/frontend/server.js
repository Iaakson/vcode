// Dev-сервер frontend: раздаёт статику и проксирует /api на backend
// Запуск: node server.js  (порт 3000; backend ожидается на порту 3001)

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 3001;
const BACKEND_HOST = process.env.BACKEND_HOST || 'localhost';
const ROOT = __dirname;

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

// Проксирование /api → backend
function proxyApi(req, res) {
    const opts = {
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
    };
    const upstream = http.request(opts, up => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
    });
    upstream.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `backend недоступен на ${BACKEND_HOST}:${BACKEND_PORT}: ${err.message}` }));
    });
    req.pipe(upstream);
}

const server = http.createServer((req, res) => {
    if (req.url === '/api' || req.url.startsWith('/api/')) {
        return proxyApi(req, res);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('405 Method Not Allowed');
    }

    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
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
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Frontend dev-сервер: http://localhost:${PORT}`);
    console.log(`🔀 /api проксируется на: http://${BACKEND_HOST}:${BACKEND_PORT}`);
    console.log(`📂 Раздаёт файлы из: ${ROOT}`);
});
