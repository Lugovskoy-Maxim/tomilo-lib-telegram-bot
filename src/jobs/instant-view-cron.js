/**
 * Вариант Б: крон раз в N минут находит главы без teletypeUrl,
 * создаёт для них Instant View (Telegraph) и обновляет главу в API.
 *
 * Включение: ENABLE_INSTANT_VIEW_CRON=true и TELEGRAPH_ACCESS_TOKEN в .env
 * Интервал: INSTANT_VIEW_CRON_INTERVAL_MINUTES=60 (по умолчанию)
 * Лимит глав за проход: INSTANT_VIEW_CRON_BATCH=20
 * Задержка между главами (чтобы не получить FLOOD_WAIT от Telegraph): INSTANT_VIEW_CRON_DELAY_MS=2000
 *
 * Бэкенд должен поддерживать PATCH /chapters/:id с телом { teletypeUrl: "https://telegra.ph/..." }
 */
const cron = require('node-cron');
const { getLatestUpdates, getChapter, updateChapter } = require('../services/api');
const { createInstantViewForChapter } = require('../services/telegraph');
const { getLink, setLink: saveLinkToDb } = require('../db/links');

const CRON_ENABLED = process.env.ENABLE_INSTANT_VIEW_CRON === 'true' || process.env.ENABLE_INSTANT_VIEW_CRON === '1';
const TOKEN = process.env.TELEGRAPH_ACCESS_TOKEN;
const INTERVAL_MINUTES = Math.max(1, parseInt(process.env.INSTANT_VIEW_CRON_INTERVAL_MINUTES || '60', 10));
const BATCH = Math.max(1, Math.min(100, parseInt(process.env.INSTANT_VIEW_CRON_BATCH || '20', 10)));
const DELAY_MS = parseInt(process.env.INSTANT_VIEW_CRON_DELAY_MS || '2000', 10) || 2000;

function hasInstantViewUrl(chapter) {
    const raw = chapter?.attributes ? { ...chapter.attributes, ...chapter } : chapter;
    return !!(raw?.teletypeUrl || raw?.instantViewUrl);
}

function runJob() {
    if (!TOKEN) return;
    const start = Date.now();
    console.log('[CRON] Instant View: старт прохода, лимит глав:', BATCH);

    getLatestUpdates(BATCH)
        .then((list) => {
            if (!list || list.length === 0) {
                console.log('[CRON] Instant View: нет глав в ленте');
                return;
            }
            return list.reduce((promise, summary, index) => {
                const chapterId =
                    summary.chapter?._id ??
                    summary.chapter?.id ??
                    summary.lastChapter?._id ??
                    summary.lastChapter?.id ??
                    summary._id ??
                    summary.id;
                if (!chapterId) return promise;
                const titleIdHint =
                    summary.titleId ??
                    summary.title?._id ??
                    summary.title?.id ??
                    ((summary.chapter ?? summary.lastChapter) ? (summary._id ?? summary.id) : null);
                return promise
                    .then(() => (index > 0 ? new Promise((r) => setTimeout(r, DELAY_MS)) : null))
                    .then(() =>
                        getChapter(chapterId).then((full) => {
                            if (getLink(chapterId) || hasInstantViewUrl(full)) return;
                            return createInstantViewForChapter(TOKEN, { chapterId, titleIdHint })
                                .then((url) => {
                                    saveLinkToDb(chapterId, url);
                                    console.log('[CRON] Instant View: создан и сохранён в БД бота для главы', chapterId);
                                    return updateChapter(chapterId, { teletypeUrl: url }).catch((err) => {
                                        if (err.response?.status === 401) {
                                            console.warn('[CRON] Бэкенд не принял PATCH (401); ссылка сохранена в БД бота.');
                                        }
                                    });
                                })
                                .catch((err) => console.warn('[CRON] Instant View: ошибка для главы', chapterId, err.message));
                        })
                    )
                    .catch((err) => console.warn('[CRON] Instant View: ошибка для главы', chapterId, err.message));
            }, Promise.resolve());
        })
        .then(() => {
            console.log('[CRON] Instant View: проход завершён за', Math.round((Date.now() - start) / 1000), 'с');
        })
        .catch((err) => {
            console.error('[CRON] Instant View: ошибка прохода', err.message);
        });
}

function startInstantViewCron() {
    if (!CRON_ENABLED || !TOKEN) {
        if (CRON_ENABLED && !TOKEN) {
            console.warn('[CRON] Instant View: включён, но TELEGRAPH_ACCESS_TOKEN не задан — крон не запущен');
        }
        return;
    }

    const schedule = `*/${INTERVAL_MINUTES} * * * *`;
    cron.schedule(schedule, runJob, { scheduled: true, timezone: 'Europe/Moscow' });
    console.log('[CRON] Instant View: запущен, интервал', INTERVAL_MINUTES, 'мин, расписание', schedule);

    runJob();
}

module.exports = { startInstantViewCron, runJob };
