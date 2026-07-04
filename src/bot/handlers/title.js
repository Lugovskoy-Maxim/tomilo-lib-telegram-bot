/**
 * Обработчики для просмотра тайтлов и глав
 */
const axios = require('axios');
const { Markup } = require('telegraf');
const { getTitle, getChapterCount, getAllChapters, getChapter, getBaseURL, getLinkedUser } = require('../../services/api');
const { formatDate, getMediaUrlCandidates } = require('../../utils/helpers');
const { getLink: getChapterViewLink, setLink: setChapterViewLink } = require('../../db/links');
const { createInstantViewForChapter } = require('../../services/telegraph');
const { TELEGRAPH_ACCESS_TOKEN } = require('../../config');

const CHAPTERS_PER_PAGE = 25;

function extractCoverPath(coverImage) {
    if (!coverImage) return null;
    const single = Array.isArray(coverImage) ? coverImage[0] : coverImage;
    const media = single?.data ?? single;
    if (!media) return null;
    if (typeof media === 'string') return media;
    if (typeof media === 'object') {
        const data = media.data ?? media;
        const attrs = data?.attributes ?? data;
        return (
            attrs?.url ??
            attrs?.formats?.large?.url ??
            attrs?.formats?.medium?.url ??
            attrs?.formats?.small?.url ??
            media.url ??
            media.formats?.large?.url ??
            media.formats?.medium?.url ??
            media.formats?.small?.url ??
            single?.url ??
            coverImage?.url ??
            null
        );
    }
    return null;
}

function chapterNum(ch) {
    return ch.chapterNumber ?? ch.number ?? ch.chapter ?? '?';
}

async function sendCoverPhoto(ctx, coverImage, baseURL, caption) {
    const path = extractCoverPath(coverImage);
    const candidates = getMediaUrlCandidates(path, baseURL);
    for (const url of candidates) {
        try {
            return await ctx.replyWithPhoto(url, { caption, parse_mode: 'Markdown' });
        } catch (error) {
            console.log(`[TITLE] Обложка по URL не загрузилась (${url}):`, error.message);
        }
    }
    for (const url of candidates) {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 20000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            return await ctx.replyWithPhoto(
                { source: Buffer.from(response.data) },
                { caption, parse_mode: 'Markdown' },
            );
        } catch (error) {
            console.log(`[TITLE] Обложка через буфер не загрузилась (${url}):`, error.message);
        }
    }
    return null;
}

function buildChaptersCaption(title, allChapters, safePage, totalPages, startIndex, chapterSlice) {
    const titleName = title?.name || title?.title || 'Тайтл';
    const fromNum = chapterNum(allChapters[startIndex]);
    const toIdx = Math.min(startIndex + chapterSlice.length - 1, allChapters.length - 1);
    const toNum = chapterNum(allChapters[toIdx]);
    const total = allChapters.length;

    return (
        `📖 *${titleName}*\n\n` +
        `Главы *${fromNum}–${toNum}*  ·  стр. *${safePage}/${totalPages}*\n` +
        `Всего: *${total}*`
    );
}

function buildChapterKeyboard(titleId, allChapters, currentPage) {
    const totalPages = Math.ceil(allChapters.length / CHAPTERS_PER_PAGE);
    const safePage = Math.min(Math.max(currentPage, 1), totalPages);
    const startIndex = (safePage - 1) * CHAPTERS_PER_PAGE;
    const chapters = allChapters.slice(startIndex, startIndex + CHAPTERS_PER_PAGE);
    const rows = [];

    const chapterButtons = chapters.map((chapter, index) =>
        Markup.button.callback(String(chapterNum(chapter)), `select_chapter_${titleId}_${startIndex + index}`),
    );
    for (let i = 0; i < chapterButtons.length; i += 5) {
        rows.push(chapterButtons.slice(i, i + 5));
    }

    if (totalPages <= 1) {
        return rows;
    }

    const nav = [];
    if (safePage > 1) {
        nav.push(Markup.button.callback('⏮', `chapters_page_${titleId}_1`));
        nav.push(Markup.button.callback('◀️', `chapters_page_${titleId}_${safePage - 1}`));
    }
    nav.push(Markup.button.callback(`${safePage} / ${totalPages}`, `chapters_page_${titleId}_${safePage}`));
    if (safePage < totalPages) {
        nav.push(Markup.button.callback('▶️', `chapters_page_${titleId}_${safePage + 1}`));
        nav.push(Markup.button.callback('⏭', `chapters_page_${titleId}_${totalPages}`));
    }
    rows.push(nav);

    if (totalPages > 6) {
        const segmentCount = Math.min(5, Math.max(3, Math.ceil(totalPages / 5)));
        const pagesPerSegment = Math.ceil(totalPages / segmentCount);
        const segments = [];

        for (let s = 0; s < segmentCount; s++) {
            const pageStart = s * pagesPerSegment + 1;
            if (pageStart > totalPages) break;

            const pageEnd = Math.min((s + 1) * pagesPerSegment, totalPages);
            const idxStart = (pageStart - 1) * CHAPTERS_PER_PAGE;
            const idxEnd = Math.min(pageEnd * CHAPTERS_PER_PAGE - 1, allChapters.length - 1);
            const from = chapterNum(allChapters[idxStart]);
            const to = chapterNum(allChapters[idxEnd]);
            const active = safePage >= pageStart && safePage <= pageEnd;
            const label = active ? `• ${from}–${to}` : `${from}–${to}`;

            segments.push(Markup.button.callback(label, `chapters_page_${titleId}_${pageStart}`));
        }

        for (let i = 0; i < segments.length; i += 3) {
            rows.push(segments.slice(i, i + 3));
        }
    }

    return rows;
}

/** Получить объект обложки из тайтла (разные API могут отдавать в разных полях) */
function getTitleCover(title) {
    if (!title) return null;
    return (
        title.coverImage ??
        title.cover ??
        title.poster ??
        title.image ??
        title.thumbnail ??
        null
    );
}

/**
 * Просмотр информации о тайтле
 */
async function viewTitleHandler(ctx, titleId, chapterPage = 1) {
    try {
        console.log(`[TITLE] Просмотр тайтла: ${titleId}`);

        // Удаляем предыдущую карточку и кнопки, чтобы не копились при переключении тайтлов
        const session = ctx.session || {};
        if (session.lastCardMessageId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastCardMessageId); } catch (_) {}
            delete session.lastCardMessageId;
        }
        if (session.lastMessageId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastMessageId); } catch (_) {}
            delete session.lastMessageId;
        }
        ctx.session = session;

        const title = await getTitle(titleId);
        if (!title) {
            await ctx.reply('Тайтл не найден.');
            return;
        }
        console.log(`[TITLE] Тайтл получен:`, title.name || title.title || 'Без названия');
        
        const totalChapters = await getChapterCount(titleId);
        console.log(`[TITLE] Количество глав: ${totalChapters}`);

        const baseURL = require('../../services/api').getBaseURL();
        const titleSlug = title.slug || titleId;
        const titleUrl = `${baseURL}/titles/${titleSlug}`;

        let description = title.description || 'Нет описания';
        if (description.length > 500) {
            description = description.substring(0, 500) + '...';
        }

        const titleName = title.name || title.title || 'Без названия';
        let caption = `📚 *${titleName}*\n`;
        caption += `📅 Год: ${title.releaseYear || title.year || 'N/A'}\n`;
        caption += `📖 Статус: ${title.status || 'N/A'}\n`;
        caption += `Глав: ${totalChapters || 'N/A'}\n`;
        caption += `Просмотров: ${title.views || 'N/A'}\n`;
        caption += `Рейтинг: ${(title.averageRanked != null && !isNaN(title.averageRanked)) ? Number(title.averageRanked).toFixed(2) : 'N/A'}\n`;
        caption += `📝 ${description}\n\n`;
        caption += `[🌐 Читать ${titleName} на сайте](${titleUrl})\n`;
        caption += `Читай мангу, манхву и маньхуа на сайте TOMILO LIB tomilo-lib.ru\n`;


        const coverRaw = getTitleCover(title);
        let cardMessage = await sendCoverPhoto(ctx, coverRaw, baseURL, caption);
        if (!cardMessage) {
            if (coverRaw == null) {
                console.log(`[TITLE] У тайтла "${titleName}" нет обложки в ответе API.`);
            } else {
                console.log(`[TITLE] Не удалось отправить обложку "${titleName}":`, extractCoverPath(coverRaw));
            }
            cardMessage = await ctx.reply(caption, { parse_mode: 'Markdown' });
        }

        let linkedInfo = { linked: false, isPremium: false };
        try {
            linkedInfo = await getLinkedUser(ctx.from.id);
        } catch (_) {}

        const buttonRows = [
            [Markup.button.callback('📑 Список глав', `read_title_${titleId}`), Markup.button.callback('🔖 В закладки', `bookmark_${titleId}`)],
        ];
        if (linkedInfo.isPremium) {
            buttonRows.push([Markup.button.callback('📥 Скачать несколько глав', `bulk_pdf_start_${titleId}`)]);
        }
        const teletypeUrl = title.teletypeUrl || title.instantViewUrl;
        if (teletypeUrl) {
            buttonRows.push([Markup.button.url('📱 Читать в Telegram', teletypeUrl)]);
        }

        const message = await ctx.reply('👇 Выберите действие:', { reply_markup: { inline_keyboard: buttonRows } });
        ctx.session = ctx.session || {};
        if (cardMessage) ctx.session.lastCardMessageId = cardMessage.message_id;
        ctx.session.lastMessageId = message.message_id;
    } catch (error) {
        console.error('[TITLE] Ошибка просмотра тайтла:', error.message, error.response ? JSON.stringify(error.response.data) : '');
        await ctx.reply('Произошла ошибка при получении информации о тайтле. Попробуйте позже.');
    }
}

/**
 * Показать главы тайтла
 */
async function showChaptersHandler(ctx, titleId, page = 1) {
    try {
        console.log(`[CHAPTERS] Показать главы для тайтла: ${titleId}, страница: ${page}`);
        
        const [totalChapters, title] = await Promise.all([
            getChapterCount(titleId),
            getTitle(titleId).catch(() => ({}))
        ]);
        console.log(`[CHAPTERS] Всего глав: ${totalChapters}`);

        if (totalChapters === 0) {
            await ctx.reply('Главы не найдены.');
            return;
        }

        const allChapters = await getAllChapters(titleId, totalChapters, 'asc');

        if (!allChapters || allChapters.length === 0) {
            await ctx.reply('Главы не найдены.');
            return;
        }

        const totalPages = Math.ceil(allChapters.length / CHAPTERS_PER_PAGE);
        const safePage = Math.min(Math.max(page, 1), totalPages);
        const startIndex = (safePage - 1) * CHAPTERS_PER_PAGE;
        const chapters = allChapters.slice(startIndex, startIndex + CHAPTERS_PER_PAGE);
        const buttonRows = buildChapterKeyboard(titleId, allChapters, safePage);

        let linkedInfo = { linked: false, isPremium: false };
        try {
            linkedInfo = await getLinkedUser(ctx.from.id);
        } catch (_) {}
        if (linkedInfo.isPremium) {
            buttonRows.push([Markup.button.callback('📥 Скачать несколько глав', `bulk_pdf_start_${titleId}`)]);
        }

        ctx.session = ctx.session || {};
        if (ctx.session.chaptersMessageId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.chaptersMessageId); } catch (_) {}
        }
        // Убираем «Выберите главу» — заменяем его списком глав
        if (ctx.session.lastMessageId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.lastMessageId); } catch (_) {}
            delete ctx.session.lastMessageId;
        }

        const chaptersMessage = await ctx.reply(
            buildChaptersCaption(title, allChapters, safePage, totalPages, startIndex, chapters),
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttonRows } },
        );
        ctx.session.chaptersMessageId = chaptersMessage.message_id;
    } catch (error) {
        console.error('Ошибка при получении глав:', error.message);
        await ctx.reply('Произошла ошибка при получении глав. Попробуйте позже.');
    }
}

/**
 * Показать главу через Teletype (без PDF): сообщение + кнопки «Открыть в Telegram» и «Читать на сайте»
 */
async function showChapterAsTeletype(ctx, titleId, chapterIndex) {
    try {
        await ctx.answerCbQuery();

        // Удаляем список глав — навигация по главам есть в карточке главы (Предыдущая/Следующая)
        if (ctx.session?.chaptersMessageId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.chaptersMessageId); } catch (_) {}
            delete ctx.session.chaptersMessageId;
        }

        const totalChapters = await getChapterCount(titleId);
        if (totalChapters === 0) {
            await ctx.reply('Главы не найдены.');
            return;
        }

        const allChapters = await getAllChapters(titleId, totalChapters, 'asc');
        if (!allChapters || allChapters.length === 0 || chapterIndex < 0 || chapterIndex >= allChapters.length) {
            await ctx.reply('Глава не найдена.');
            return;
        }

        const chapterSummary = allChapters[chapterIndex];
        const chapterId = chapterSummary._id ?? chapterSummary.id;
        const chapter = await getChapter(chapterId);
        const title = await getTitle(titleId);
        if (!title) {
            await ctx.reply('Тайтл не найден.');
            return;
        }

        const baseURL = getBaseURL();
        const titleSlug = title.slug || titleId;
        const titleUrl = `${baseURL}/titles/${titleSlug}`;
        const chapterUrl = `${baseURL}/titles/${titleSlug}/chapter/${chapter._id ?? chapter.id ?? chapterId}`;
        let teletypeUrl = getChapterViewLink(chapterId) || chapter.teletypeUrl || chapter.instantViewUrl;

        if (!teletypeUrl && TELEGRAPH_ACCESS_TOKEN) {
            const statusMsg = await ctx.reply('📖 Формирую просмотр для Telegram…');
            try {
                teletypeUrl = await createInstantViewForChapter(TELEGRAPH_ACCESS_TOKEN, {
                    chapterId,
                    titleIdHint: titleId
                });
                setChapterViewLink(chapterId, teletypeUrl);
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
                } catch (_) {}
            } catch (err) {
                console.error('[TITLE] Ошибка создания Instant View:', err.message);
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
                } catch (_) {}
            }
        }

        const chapterNum = chapter.number ?? chapter.chapterNumber ?? 'N/A';
        const titleName = title.name || title.title || 'Без названия';
        const createdDate = formatDate(chapter.createdAt);

        let text = `📚 *${titleName}*\n📖 Глава ${chapterNum}\n📅 ${createdDate}\n\n`;
        if (teletypeUrl) {
            text += 'Откройте главу в Telegram — материал отобразится прямо в чате (Teletype).';
        } else {
            text += 'Читайте главу на сайте по кнопке ниже.';
        }

        const buttonRows = [];
        if (teletypeUrl) {
            buttonRows.push([{ text: '📱 Читать в Telegram (Instant View)', url: teletypeUrl }]);
        }
        buttonRows.push([{ text: '🌐 Глава на сайте', url: chapterUrl }, { text: '📚 Тайтл на сайте', url: titleUrl }]);

        const nav = [];
        if (chapterIndex > 0) {
            nav.push(Markup.button.callback('⬅️ Предыдущая', `select_chapter_${titleId}_${chapterIndex - 1}`));
        }
        if (chapterIndex < allChapters.length - 1) {
            nav.push(Markup.button.callback('➡️ Следующая', `select_chapter_${titleId}_${chapterIndex + 1}`));
        }

        let linkedInfo = { linked: false, isPremium: false };
        try {
            linkedInfo = await getLinkedUser(ctx.from.id);
        } catch (_) {}

        const rows = (nav.length ? [nav] : []).concat(buttonRows);
        if (linkedInfo.isPremium) {
            rows.push([Markup.button.callback('📥 Скачать PDF', `pdf_chapter_${titleId}_${chapterIndex}`)]);
        }
        rows.push([Markup.button.callback('🔄 Пересоздать просмотр', `recreate_iv_${titleId}_${chapterIndex}`)]);
        await ctx.reply(text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: rows }
        });
    } catch (error) {
        console.error('[TITLE] Ошибка показа главы:', error.message);
        await ctx.reply('Не удалось открыть главу. Попробуйте позже.');
    }
}

function setupTitleHandlers(bot) {
    // Обработчик для просмотра тайтла
    bot.action(/view_title_(.+)/, async (ctx) => {
        const match = ctx.match[1].match(/([a-f0-9]+)_(\d+)/);
        if (match) {
            await viewTitleHandler(ctx, match[1], parseInt(match[2]));
        } else {
            await viewTitleHandler(ctx, ctx.match[1]);
        }
    });

    // Обработчик для чтения (показа глав)
    bot.action(/read_title_(.+)/, async (ctx) => {
        const titleId = ctx.match[1];
        try {
            await ctx.answerCbQuery();
        } catch (e) {}
        await showChaptersHandler(ctx, titleId);
    });

    // Обработчик для выбора главы (показ через Teletype)
    bot.action(/select_chapter_(.+)_(\d+)/, async (ctx) => {
        const titleId = ctx.match[1];
        const chapterIndex = parseInt(ctx.match[2]);
        await showChapterAsTeletype(ctx, titleId, chapterIndex);
    });

    // PDF главы (только премиум, из кэша если уже создавался)
    bot.action(/pdf_chapter_(.+)_(\d+)/, async (ctx) => {
        const titleId = ctx.match[1];
        const chapterIndex = parseInt(ctx.match[2]);
        const { prepareChapterForReading } = require('../../utils/pdf');
        await prepareChapterForReading(ctx, titleId, chapterIndex, { forceRecreate: false });
    });

    // Пересоздать PDF по запросу пользователя
    bot.action(/pdf_recreate_(.+)_(\d+)/, async (ctx) => {
        const titleId = ctx.match[1];
        const chapterIndex = parseInt(ctx.match[2]);
        const { prepareChapterForReading } = require('../../utils/pdf');
        await prepareChapterForReading(ctx, titleId, chapterIndex, { forceRecreate: true });
    });

    // Обработчик для навигации по страницам глав
    bot.action(/chapters_page_(.+)_(\d+)/, async (ctx) => {
        const titleId = ctx.match[1];
        const page = parseInt(ctx.match[2]);
        try {
            await ctx.answerCbQuery({ text: `Страница ${page}` });
            await ctx.deleteMessage(ctx.update.callback_query.message.message_id);
        } catch (e) {}
        await showChaptersHandler(ctx, titleId, page);
    });

    // Пересоздать Instant View (если глава сломана — доступно всем). callback_data до 64 байт: только titleId_index
    bot.action(/recreate_iv_(.+)_(\d+)$/, async (ctx) => {
        const titleId = ctx.match[1];
        const chapterIndex = parseInt(ctx.match[2], 10);
        if (!titleId || !TELEGRAPH_ACCESS_TOKEN) {
            await ctx.answerCbQuery({ text: 'Нет данных или не задан TELEGRAPH_ACCESS_TOKEN.' }).catch(() => {});
            return;
        }
        const totalChapters = await getChapterCount(titleId);
        const allChapters = await getAllChapters(titleId, totalChapters, 'asc');
        const summary = allChapters[chapterIndex];
        if (!summary) {
            await ctx.answerCbQuery({ text: 'Глава не найдена.' }).catch(() => {});
            return;
        }
        const chapterId = summary._id ?? summary.id;
        await ctx.answerCbQuery();
        const statusMsg = await ctx.reply('🔄 Пересоздаю просмотр…');
        try {
            const url = await createInstantViewForChapter(TELEGRAPH_ACCESS_TOKEN, {
                chapterId,
                titleIdHint: titleId
            });
            setChapterViewLink(chapterId, url);
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                null,
                `✅ Просмотр пересоздан.\n📱 [Открыть в Telegram](${url})`,
                { parse_mode: 'Markdown' }
            );
            await showChapterAsTeletype(ctx, titleId, chapterIndex);
        } catch (err) {
            console.error('[TITLE] Ошибка пересоздания:', err.message);
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                null,
                `❌ Ошибка: ${err.message}`
            ).catch(() => {});
        }
    });

    // Закладки: добавить тайтл
    bot.action(/bookmark_(.+)/, async (ctx) => {
        const titleId = ctx.match[1];
        try {
            await ctx.answerCbQuery();
            ctx.session = ctx.session || {};
            ctx.session.bookmarks = ctx.session.bookmarks || [];
            if (!ctx.session.bookmarks.includes(titleId)) {
                ctx.session.bookmarks.push(titleId);
                await ctx.reply('✅ Тайтл добавлен в «Мои тайтлы».');
            } else {
                await ctx.reply('Этот тайтл уже в закладках.');
            }
        } catch (e) {
            await ctx.reply('Не удалось добавить в закладки.');
        }
    });
}

module.exports = { setupTitleHandlers, viewTitleHandler, showChaptersHandler, showChapterAsTeletype };

