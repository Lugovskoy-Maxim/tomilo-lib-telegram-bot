/**
 * Кэш PDF: chapterId → Telegram file_id (файлы на серверах Telegram).
 * Персистентность в data/pdf-cache.json — переживает перезапуск бота.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'pdf-cache.json');

const inflight = new Map();
let store = null;
let saveTimer = null;

function load() {
    if (store !== null) return store;
    try {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        store = JSON.parse(raw);
    } catch (e) {
        if (e.code === 'ENOENT') store = {};
        else {
            console.error('[PDF-CACHE] Ошибка чтения:', e.message);
            store = {};
        }
    }
    return store;
}

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(CACHE_FILE, JSON.stringify(store || {}, null, 0), 'utf8');
        } catch (e) {
            console.error('[PDF-CACHE] Ошибка записи:', e.message);
        }
    }, 300);
}

function getPdfEntry(chapterId) {
    if (!chapterId) return null;
    const s = load();
    return s[String(chapterId)] || null;
}

function setPdfEntry(chapterId, entry) {
    if (!chapterId || !entry?.fileId) return;
    load();
    store[String(chapterId)] = {
        fileId: entry.fileId,
        filename: entry.filename || 'chapter.pdf',
        titleName: entry.titleName || '',
        chapterNumber: entry.chapterNumber || 'N/A',
        createdDate: entry.createdDate || '',
        successImages: entry.successImages || 0,
        totalImages: entry.totalImages || 0,
        chapterUrl: entry.chapterUrl || '',
        cachedAt: Date.now(),
    };
    scheduleSave();
}

function deletePdfEntry(chapterId) {
    if (!chapterId) return;
    load();
    delete store[String(chapterId)];
    scheduleSave();
}

async function withPdfLock(chapterId, fn) {
    const key = String(chapterId);
    if (inflight.has(key)) {
        return inflight.get(key);
    }
    const promise = Promise.resolve().then(fn).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
}

module.exports = {
    getPdfEntry,
    setPdfEntry,
    deletePdfEntry,
    withPdfLock,
};