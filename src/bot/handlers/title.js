/**
 * Обработчики для просмотра тайтлов и глав
 */
const { Markup } = require('telegraf');
const { getTitle, getChapterCount, getAllChapters, getChapter, getBaseURL, getLinkedUser } = require('../../services/api');
const { formatDate } = require('../../utils/helpers');
const { getLink: getChapterViewLink, setLink: setChapterViewLink } = require('../../db/links');
const { createInstantViewForChapter } = require('../../services/telegraph');
const { TELEGRAPH_ACCESS_TOKEN } = require('../../config');

function resolveCoverImageUrl(coverImage, baseURL) {
    if (!coverImage) return null;
    // Strapi и др.: relation может быть массивом (data: [ {...} ])
    const single = Array.isArray(coverImage) ? coverImage[0] : coverImage;
    const media = single?.data ?? single;
    if (!media) return null;
    let pathOrUrl;
    if (typeof media === 'string') {
        pathOrUrl = media;
    } else if (media && typeof media === 'object') {
        const data = media.data ?? media;
        const attrs = data?.attributes ?? data;
        pathOrUrl =
            attrs?.url ??
            attrs?.formats?.large?.url ??
            attrs?.formats?.medium?.url ??
            attrs?.formats?.small?.url ??
            media.url ??
            media.formats?.large?.url ??
            media.formats?.medium?.url ??
            media.formats?.small?.url ??
            single?.url ??
            single?.formats?.large?.url ??
            single?.formats?.medium?.url ??
            single?.formats?.small?.url ??
            coverImage?.url ??
            coverImage?.formats?.large?.url ??
            coverImage?.formats?.medium?.url ??
            coverImage?.formats?.small?.url;
    }
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    if (pathOrUrl.startsWith('/uploads/')) return `${baseURL}${pathOrUrl}`;
    if (pathOrUrl.startsWith('/')) return `${baseURL}/uploads${pathOrUrl}`;
    return `${baseURL}/uploads/${pathOrUrl}`;
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


        const coverImageUrl = resolveCoverImageUrl(getTitleCover(title), baseURL);
        let cardMessage;
        if (coverImageUrl) {
            try {
                cardMessage = await ctx.replyWithPhoto(coverImageUrl, { caption: caption, parse_mode: 'Markdown' });
            } catch (photoErr) {
                if (photoErr.message && (photoErr.message.includes('wrong type') || photoErr.message.includes('failed to get HTTP URL') || photoErr.code === 400)) {
                    cardMessage = await ctx.reply(caption, { parse_mode: 'Markdown' });
                } else {
                    throw photoErr;
                }
            }
        } else {
            const coverRaw = getTitleCover(title);
            if (coverRaw == null) {
                console.log(`[TITLE] У тайтла "${titleName}" нет обложки в ответе API (проверьте populate coverImage/cover в GET /titles/:id).`);
            } else {
                console.log(`[TITLE] У тайтла "${titleName}" обложка в неожиданном формате:`, typeof coverRaw, JSON.stringify(coverRaw).slice(0, 200));
            }
            cardMessage = await ctx.reply(caption, { parse_mode: 'Markdown' });
        }

        const buttonRows = [
            [Markup.button.callback('Выбрать главу', `read_title_${titleId}`), Markup.button.callback('🔖 Добавить в закладки', `bookmark_${titleId}`)]
        ];
        const teletypeUrl = title.teletypeUrl || title.instantViewUrl;
        if (teletypeUrl) {
            buttonRows.push([Markup.button.url('📱 Читать в Telegram (Teletype)', teletypeUrl)]);
        }

        const message = await ctx.reply('Выберите главу:', { reply_markup: { inline_keyboard: buttonRows } });
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

        const limitPerPage = 50;
        const totalPages = Math.ceil(allChapters.length / limitPerPage);
        const startIndex = (page - 1) * limitPerPage;
        const endIndex = startIndex + limitPerPage;
        const chapters = allChapters.slice(startIndex, endIndex);

        const chapterNum = (ch) => ch.number != null ? ch.number : (ch.chapterNumber != null ? ch.chapterNumber : '?');
        const chapterButtons = chapters.map((chapter, index) =>
            Markup.button.callback(`Гл. ${chapterNum(chapter)}`, `select_chapter_${titleId}_${startIndex + index}`)
        );

        const buttonRows = [];
        for (let i = 0; i < chapterButtons.length; i += 5) {
            buttonRows.push(chapterButtons.slice(i, i + 5));
        }

        if (totalPages > 1) {
            const navigationButtons = [];

            if (page > 1) {
                navigationButtons.push(Markup.button.callback('⬅️ Назад', `chapters_page_${titleId}_${page - 1}`));
            }

            navigationButtons.push(Markup.button.callback(`${page}/${totalPages}`, `chapters_page_${titleId}_${page}`));

            if (page < totalPages) {
                navigationButtons.push(Markup.button.callback('➡️ Далее', `chapters_page_${titleId}_${page + 1}`));
            }

            const navigationRows = [];
            for (let i = 0; i < navigationButtons.length; i += 5) {
                navigationRows.push(navigationButtons.slice(i, i + 5));
            }
            buttonRows.push(...navigationRows);
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

        const titleName = title?.name ? ` — ${title.name}` : '';
        const chaptersMessage = await ctx.reply(`📖 Главы тайтла${titleName}\nСтраница ${page} из ${totalPages} (всего глав: ${allChapters.length}). Выберите главу:`, { reply_markup: { inline_keyboard: buttonRows } });
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

    // PDF главы (только премиум)
    bot.action(/pdf_chapter_(.+)_(\d+)/, async (ctx) => {
        const titleId = ctx.match[1];
        const chapterIndex = parseInt(ctx.match[2]);
        const { prepareChapterForReading } = require('../../utils/pdf');
        await prepareChapterForReading(ctx, titleId, chapterIndex);
    });

    // Обработчик для навигации по страницам глав
    bot.action(/chapters_page_(.+)_(\d+)/, async (ctx) => {
        const titleId = ctx.match[1];
        const page = parseInt(ctx.match[2]);
        try {
            await ctx.answerCbQuery();
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

