/**
 * Форматирование и отправка уведомлений о новых главах (как в канале).
 */
const axios = require('axios');
const { SITE_URL, TELEGRAM_BOT_USERNAME } = require('../config');
const { getMediaUrlCandidates } = require('./helpers');

const STATUS_LABELS = {
    ongoing: '🟢 Онгоинг',
    completed: '🟣 Завершён',
    pause: '🟠 Пауза',
    cancelled: '🔴 Отменён',
};

const TYPE_LABELS = {
    manhwa: '🇰🇷 Манхва',
    manga: '🇯🇵 Манга',
    manhua: '🇨🇳 Маньхуа',
    comic: '🇺🇸 Комикс',
    webtoon: '🇰🇷 Вебтун',
};

function escapeHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatAgeLimit(ageLimit) {
    const n = Number(ageLimit);
    if (Number.isNaN(n) || n < 0) return '';
    if (n >= 18) return '⛔️ 18+ 🔞';
    if (n >= 16) return '16+';
    if (n >= 12) return '12+';
    if (n >= 6) return '6+';
    return '0+';
}

function translateType(type) {
    if (!type) return '';
    const key = String(type).trim().toLowerCase();
    return TYPE_LABELS[key] || escapeHtml(type);
}

function formatChapterNotifyMessage(item) {
    const titleName = item.titleName || 'Без названия';
    const chapterNum = item.chapterNumber ?? '?';
    const ageStr = formatAgeLimit(item.ageLimit);
    const titleLine = ageStr
        ? `<b>${escapeHtml(titleName)}</b> (${ageStr})`
        : `<b>${escapeHtml(titleName)}</b>`;

    const typeStr = translateType(item.type);
    const yearStr =
        item.releaseYear != null && Number(item.releaseYear) >= 1900
            ? String(Number(item.releaseYear))
            : '';
    const statusStr = item.status && STATUS_LABELS[String(item.status).toLowerCase()];
    const metaParts = [typeStr, yearStr, statusStr].filter(Boolean);
    const metaLine = metaParts.length ? `<i>${metaParts.join(' · ')}</i>` : '';

    const genres = Array.isArray(item.genres) ? item.genres : [];
    const genreStr = genres
        .slice(0, 3)
        .map((g) => escapeHtml(String(g).trim()))
        .filter(Boolean)
        .join(', ');

    const totalCh =
        item.totalChapters != null && Number(item.totalChapters) > 0
            ? Number(item.totalChapters)
            : 0;
    const totalLine = totalCh ? `<i>Всего глав: ${totalCh}</i>` : '';

    const lines = [
        '<b>✨ НОВАЯ ГЛАВА ✨</b>',
        '',
        titleLine,
        `💎 Глава ${chapterNum} 💎`,
        '─────────────────',
        ...(metaLine ? [metaLine] : []),
        ...(genreStr ? [genreStr] : []),
        ...(totalLine ? [totalLine] : []),
        '',
        'Оставьте впечатления в комментариях на сайте 👇',
    ];

    return lines.filter((line) => line !== undefined && line !== null).join('\n');
}

function buildNotifyKeyboard(item) {
    const sitePath = item.titleSlug
        ? `${SITE_URL}/titles/${item.titleSlug}/chapter/${item.chapterId}`
        : `${SITE_URL}/titles/${item.titleId}/chapter/${item.chapterId}`;
    const botUser = (TELEGRAM_BOT_USERNAME || 'tomilo_lib_bot').replace(/^@/, '');
    const botPath = `https://t.me/${botUser}?start=ch_${item.chapterId}`;

    return {
        inline_keyboard: [
            [
                { text: 'Читать на сайте ↗', url: sitePath },
                { text: 'Открыть в боте', url: botPath },
            ],
        ],
    };
}

function getCoverUrlCandidates(coverImage) {
    if (!coverImage) return [];
    return getMediaUrlCandidates(coverImage, SITE_URL);
}

async function downloadCoverBuffer(urls) {
    for (const url of urls) {
        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; TomiloLibBot/1.0)',
                    Accept: 'image/*',
                },
            });
            if (res.data?.byteLength > 0) {
                return Buffer.from(res.data);
            }
        } catch (_) {}
    }
    return null;
}

async function sendChapterNotification(telegram, item) {
    const chatId = item.chatId;
    if (!chatId) return false;

    const caption = formatChapterNotifyMessage(item);
    const replyMarkup = buildNotifyKeyboard(item);
    const opts = {
        parse_mode: 'HTML',
        caption: caption.length <= 1024 ? caption : caption.slice(0, 1020) + '…',
        reply_markup: replyMarkup,
    };

    const coverUrls = getCoverUrlCandidates(item.coverImage);

    for (const url of coverUrls) {
        try {
            await telegram.sendPhoto(chatId, url, opts);
            return true;
        } catch (_) {}
    }

    const buffer = await downloadCoverBuffer(coverUrls);
    if (buffer) {
        try {
            await telegram.sendPhoto(chatId, { source: buffer }, opts);
            return true;
        } catch (_) {}
    }

    await telegram.sendMessage(chatId, caption, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: replyMarkup,
    });
    return true;
}

module.exports = {
    formatChapterNotifyMessage,
    buildNotifyKeyboard,
    sendChapterNotification,
};