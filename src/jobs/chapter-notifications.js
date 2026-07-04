/**
 * Опрос очереди API и отправка уведомлений о главах в закладках.
 * Включено по умолчанию при заданном BOT_API_SECRET.
 */
const cron = require('node-cron');
const { bot } = require('../bot/bot');
const { BOT_API_SECRET } = require('../config');
const {
    getPendingChapterNotifications,
    ackChapterNotifications,
} = require('../services/api');
const { sendChapterNotification } = require('../utils/chapter-notify');

const CRON_ENABLED =
    process.env.ENABLE_CHAPTER_NOTIFY_CRON !== 'false' &&
    process.env.ENABLE_CHAPTER_NOTIFY_CRON !== '0';
const INTERVAL_MINUTES = Math.max(
    1,
    parseInt(process.env.CHAPTER_NOTIFY_INTERVAL_MINUTES || '3', 10),
);
const BATCH_LIMIT = Math.max(
    1,
    Math.min(50, parseInt(process.env.CHAPTER_NOTIFY_BATCH || '25', 10)),
);

let running = false;

async function runChapterNotifyJob() {
    if (!BOT_API_SECRET) return;
    if (running) {
        console.log('[NOTIFY] Пропуск: предыдущий проход ещё выполняется');
        return;
    }
    running = true;
    const started = Date.now();

    try {
        const items = await getPendingChapterNotifications(BATCH_LIMIT);
        if (!items.length) return;

        const delivered = [];
        for (const item of items) {
            try {
                const ok = await sendChapterNotification(bot.telegram, item);
                if (ok && item.notificationId) {
                    delivered.push(item.notificationId);
                    console.log(
                        `[NOTIFY] Отправлено: ${item.titleName} гл.${item.chapterNumber} → ${item.chatId}`,
                    );
                }
            } catch (error) {
                console.warn(
                    `[NOTIFY] Ошибка chat=${item.chatId}:`,
                    error.response?.description || error.message,
                );
            }
        }

        if (delivered.length > 0) {
            await ackChapterNotifications(delivered);
        }
    } catch (error) {
        const status = error.response?.status;
        if (status === 404) {
            console.warn(
                '[NOTIFY] Эндпоинт pending-chapter-notifications недоступен — обновите API (ветка regru)',
            );
        } else {
            console.error('[NOTIFY] Ошибка прохода:', error.message);
        }
    } finally {
        running = false;
        const elapsed = Math.round((Date.now() - started) / 1000);
        if (elapsed > 1) {
            console.log(`[NOTIFY] Проход завершён за ${elapsed} с`);
        }
    }
}

function startChapterNotificationsCron() {
    if (!CRON_ENABLED) {
        console.log('[NOTIFY] Крон уведомлений о главах отключён (ENABLE_CHAPTER_NOTIFY_CRON=false)');
        return;
    }
    if (!BOT_API_SECRET) {
        console.warn('[NOTIFY] BOT_API_SECRET не задан — уведомления о главах не запущены');
        return;
    }

    const schedule = `*/${INTERVAL_MINUTES} * * * *`;
    cron.schedule(schedule, runChapterNotifyJob, {
        scheduled: true,
        timezone: 'Europe/Moscow',
    });
    console.log(
        `[NOTIFY] Уведомления о главах: каждые ${INTERVAL_MINUTES} мин (${schedule})`,
    );

    setTimeout(runChapterNotifyJob, 8000);
}

module.exports = { startChapterNotificationsCron, runChapterNotifyJob };