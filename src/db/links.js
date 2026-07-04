/**
 * Локальное хранилище ссылок на просмотр глав (Telegraph/Instant View).
 * Файл data/chapter-links.json: { "chapterId": "https://telegra.ph/..." }
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const LINKS_FILE = path.join(DATA_DIR, 'chapter-links.json');

let store = null;

function load() {
    if (store !== null) return store;
    try {
        const raw = fs.readFileSync(LINKS_FILE, 'utf8');
        store = JSON.parse(raw);
    } catch (e) {
        if (e.code === 'ENOENT') store = {};
        else throw e;
    }
    return store;
}

function save() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(LINKS_FILE, JSON.stringify(store || {}, null, 0), 'utf8');
    } catch (e) {
        console.error('[DB] Ошибка записи chapter-links:', e.message);
    }
}

/**
 * Получить ссылку на просмотр главы по id главы.
 * @param {string} chapterId
 * @returns {string|null}
 */
function getLink(chapterId) {
    if (!chapterId) return null;
    const s = load();
    return s[chapterId] || null;
}

/**
 * Сохранить ссылку для главы.
 * @param {string} chapterId
 * @param {string} url
 */
function setLink(chapterId, url) {
    if (!chapterId || !url) return;
    load();
    store[chapterId] = url;
    save();
}

/**
 * Получить все сохранённые ссылки (для отладки/бэкапа).
 * @returns {{ [chapterId: string]: string }}
 */
function getAllLinks() {
    return { ...load() };
}

module.exports = {
    getLink,
    setLink,
    getAllLinks
};
