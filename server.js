// Простой HTTP-сервер для раздачи статики (index.html)
// Запуск: node server.js  (или npm start)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 — слушать все сетевые интерфейсы (доступ из сети)
const ROOT = __dirname;

// MIME-типы для раздачи файлов
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

const server = http.createServer((req, res) => {
    // только GET (и HEAD), остальное — 405
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('405 Method Not Allowed');
    }

    // путь из URL, защита от выхода за пределы папки
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

// Определяем локальные IP-адреса машины для удобного доступа из сети
function getLanIPs() {
    const os = require('os');
    const ips = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
        for (const ni of list) {
            if (ni.family === 'IPv4' && !ni.internal) ips.push({ name, address: ni.address });
        }
    }
    return ips;
}

server.listen(PORT, HOST, () => {
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
    if (HOST === '0.0.0.0') {
        console.log('🌐 Доступен из сети по адресам:');
        for (const { name, address } of getLanIPs()) {
            console.log(`   http://${address}:${PORT}   (${name})`);
        }
    }
    console.log(`📂 Раздаёт файлы из: ${ROOT}`);
});
