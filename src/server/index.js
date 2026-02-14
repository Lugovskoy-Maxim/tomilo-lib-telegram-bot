/**
 * Локальный API-сервер для разработки и тестирования бота.
 * Эндпоинты совместимы с тем, что ожидает src/services/api.js.
 * Дополнительно: POST /api/create-instant-view — для варианта А (бэкенд создаёт Instant View).
 *
 * Запуск: npm run server
 * Бот с этим API: API_BASE_URL=http://localhost:3099/api npm start
 */
require('dotenv').config();
const http = require('http');
const {
    getTitles,
    getTitleById,
    getChaptersByTitleId,
    getChapterById,
    getLatestChapters,
} = require('./data');

const PORT = parseInt(process.env.PORT || '3099', 10);

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function parseQuery(url) {
    const i = url.indexOf('?');
    if (i === -1) return {};
    const q = {};
    for (const part of url.slice(i + 1).split('&')) {
        const [k, v] = part.split('=');
        if (k && v != null) q[decodeURIComponent(k)] = decodeURIComponent(v);
    }
    return q;
}

function parsePath(pathname) {
    const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    return parts;
}

function send(res, statusCode, data) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(statusCode);
    res.end(JSON.stringify(data));
}

function notFound(res) {
    send(res, 404, { error: 'Not Found' });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url || '', `http://localhost:${PORT}`);
    const pathname = url.pathname;
    const pathParts = parsePath(pathname);
    const query = parseQuery(req.url);

    // GET /api/titles — каталог и поиск
    if (req.method === 'GET' && pathParts[0] === 'titles' && pathParts.length === 1) {
        const limit = Math.min(100, parseInt(query.limit || '10', 10) || 10);
        const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
        const search = (query.search || '').trim().toLowerCase();
        let list = getTitles();
        if (search) {
            list = list.filter((t) => t.name.toLowerCase().includes(search) || (t.description && t.description.toLowerCase().includes(search)));
        }
        const total = list.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const start = (page - 1) * limit;
        const titles = list.slice(start, start + limit);
        send(res, 200, { data: titles, total, totalPages });
        return;
    }

    // GET /api/titles/latest-updates
    if (req.method === 'GET' && pathParts[0] === 'titles' && pathParts[1] === 'latest-updates') {
        const limit = Math.min(50, parseInt(query.limit || '10', 10) || 10);
        const chapters = getLatestChapters(limit);
        send(res, 200, { data: chapters });
        return;
    }

    // GET /api/titles/:id
    if (req.method === 'GET' && pathParts[0] === 'titles' && pathParts.length === 2) {
        const id = pathParts[1];
        const title = getTitleById(id);
        if (!title) {
            notFound(res);
            return;
        }
        send(res, 200, { data: title });
        return;
    }

    // GET /api/titles/:id/chapters/count
    if (req.method === 'GET' && pathParts[0] === 'titles' && pathParts.length === 4 && pathParts[2] === 'chapters' && pathParts[3] === 'count') {
        const titleId = pathParts[1];
        const list = getChaptersByTitleId(titleId);
        send(res, 200, { data: { count: list.length }, count: list.length });
        return;
    }

    // GET /api/chapters/title/:id
    if (req.method === 'GET' && pathParts[0] === 'chapters' && pathParts[1] === 'title' && pathParts.length === 3) {
        const titleId = pathParts[2];
        const limit = Math.min(1000, parseInt(query.limit || '1000', 10) || 1000);
        const sort = (query.sort || 'number:asc').toLowerCase();
        const sortOrder = sort.includes('desc') ? 'desc' : 'asc';
        const list = getChaptersByTitleId(titleId, sortOrder).slice(0, limit);
        send(res, 200, { data: list });
        return;
    }

    // GET /api/chapters/latest
    if (req.method === 'GET' && pathParts[0] === 'chapters' && pathParts[1] === 'latest') {
        const limit = Math.min(50, parseInt(query.limit || '10', 10) || 10);
        const chapters = getLatestChapters(limit);
        send(res, 200, { data: chapters });
        return;
    }

    // GET /api/chapters?limit=&sort=
    if (req.method === 'GET' && pathParts[0] === 'chapters' && pathParts.length === 1) {
        const limit = Math.min(50, parseInt(query.limit || '10', 10) || 10);
        const chapters = getLatestChapters(limit);
        send(res, 200, { data: chapters });
        return;
    }

    // GET /api/chapters/:id
    if (req.method === 'GET' && pathParts[0] === 'chapters' && pathParts.length === 2) {
        const chapterId = pathParts[1];
        const chapter = getChapterById(chapterId);
        if (!chapter) {
            notFound(res);
            return;
        }
        send(res, 200, { data: chapter });
        return;
    }

    // POST /api/create-instant-view — создаёт Telegraph-страницу для главы, возвращает URL (вариант А: вызов с бэкенда)
    if (req.method === 'POST' && pathParts[0] === 'create-instant-view' && pathParts.length === 1) {
        const token = process.env.TELEGRAPH_ACCESS_TOKEN;
        if (!token) {
            send(res, 503, { error: 'TELEGRAPH_ACCESS_TOKEN not configured' });
            return;
        }
        readBody(req)
            .then((body) => {
                let payload;
                try {
                    payload = body ? JSON.parse(body) : {};
                } catch (e) {
                    send(res, 400, { error: 'Invalid JSON body' });
                    return;
                }
                const input = payload.chapterId
                    ? { chapterId: payload.chapterId }
                    : payload.titleId != null && Number.isInteger(payload.chapterIndex)
                        ? { titleId: payload.titleId, chapterIndex: payload.chapterIndex }
                        : null;
                if (!input) {
                    send(res, 400, { error: 'Body must contain "chapterId" or "titleId" and "chapterIndex"' });
                    return;
                }
                const { createInstantViewForChapter } = require('../services/telegraph');
                return createInstantViewForChapter(token, input).then(
                    (url) => send(res, 200, { url }),
                    (err) => {
                        console.error('[SERVER] create-instant-view:', err.message);
                        send(res, 502, { error: err.message || 'Telegraph error' });
                    }
                );
            })
            .catch((err) => {
                console.error('[SERVER] create-instant-view body read:', err);
                send(res, 500, { error: 'Server error' });
            });
        return;
    }

    notFound(res);
});

server.listen(PORT, () => {
    console.log(`[SERVER] API доступен по адресу http://localhost:${PORT}/api`);
    console.log(`[SERVER] Для бота задайте: API_BASE_URL=http://localhost:${PORT}/api`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[SERVER] Порт ${PORT} занят. Задайте другой: PORT=3100 npm run server`);
    } else {
        console.error('[SERVER] Ошибка:', err.message);
    }
    process.exitCode = 1;
});

module.exports = { server };
