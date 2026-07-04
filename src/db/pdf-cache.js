/**
 * Кэш PDF в оперативной памяти: chapterId → Telegram file_id.
 * Файлы хранятся на серверах Telegram, на диске бота ничего не пишется.
 */
const inflight = new Map();
const cache = new Map();

function getPdfEntry(chapterId) {
    if (!chapterId) return null;
    return cache.get(String(chapterId)) || null;
}

function setPdfEntry(chapterId, entry) {
    if (!chapterId || !entry?.fileId) return;
    cache.set(String(chapterId), {
        fileId: entry.fileId,
        filename: entry.filename || 'chapter.pdf',
        titleName: entry.titleName || '',
        chapterNumber: entry.chapterNumber || 'N/A',
        createdDate: entry.createdDate || '',
        successImages: entry.successImages || 0,
        totalImages: entry.totalImages || 0,
        chapterUrl: entry.chapterUrl || '',
        cachedAt: Date.now(),
    });
}

function deletePdfEntry(chapterId) {
    if (!chapterId) return;
    cache.delete(String(chapterId));
}

/**
 * Один запрос на генерацию PDF для главы; остальные ждут тот же Promise.
 */
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