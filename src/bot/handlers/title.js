/**
 * Обработчики для просмотра тайтлов и глав
 */
const { Markup } = require('telegraf');
const { getTitle, getChapterCount, getAllChapters } = require('../../services/api');
const { prepareChapterForReading } = require('../../utils/pdf');

/**
 * Просмотр информации о тайтле
 */
async function viewTitleHandler(ctx, titleId, chapterPage = 1) {
    try {
        console.log(`[TITLE] Просмотр тайтла: ${titleId}`);
        
        const title = await getTitle(titleId);
        console.log(`[TITLE] Тайтл получен:`, title?.name || 'Без названия');
        
        const totalChapters = await getChapterCount(titleId);
        console.log(`[TITLE] Количество глав: ${totalChapters}`);

        const baseURL = require('../../services/api').getBaseURL();
        const titleSlug = title.slug || titleId;
        const titleUrl = `${baseURL}/titles/${titleSlug}`;

        let description = title.description || 'Нет описания';
        if (description.length > 500) {
            description = description.substring(0, 500) + '...';
        }

        let caption = `📚 *${title.name}*\n`;
        caption += `📅 Год: ${title.releaseYear || title.year || 'N/A'}\n`;
        caption += `📖 Статус: ${title.status || 'N/A'}\n`;
        caption += `Глав: ${totalChapters || 'N/A'}\n`;
        caption += `Просмотров: ${title.views || 'N/A'}\n`;
        caption += `Рейтинг: ${title.averageRanked.toFix(2) || 'N/A'}\n`;
        caption += `📝 ${description}\n\n`;
        caption += `[🌐 Читай мангу, манхву и маньхуа на сайте TOMILO LIB ](https://tomilo-lib.ru)\n`;
        caption += `[🌐 Читать ${title.name} на сайте](${titleUrl})\n`;

        if (title.coverImage) {
            let coverUrl;
            if (title.coverImage.startsWith('/uploads/')) {
                coverUrl = `${baseURL}${title.coverImage}`;
            } else if (title.coverImage.startsWith('/')) {
                coverUrl = `${baseURL}/uploads${title.coverImage}`;
            } else {
                coverUrl = `${baseURL}/uploads/${title.coverImage}`;
            }

            await ctx.replyWithPhoto(coverUrl, { caption: caption, parse_mode: 'Markdown' });
        } else {
            await ctx.reply(caption, { parse_mode: 'Markdown' });
        }

        const buttonRows = [
            [Markup.button.callback('Выбрать главу', `read_title_${titleId}`), Markup.button.callback('🔖 Добавить в закладки', `bookmark_${titleId}`)]
        ];

        if (ctx.session && ctx.session.lastMessageId) {
            try {
                await ctx.deleteMessage(ctx.session.lastMessageId);
            } catch (error) {}
        }

        const message = await ctx.reply('Выберите главу:', { reply_markup: { inline_keyboard: buttonRows } });
        ctx.session = ctx.session || {};
        ctx.session.lastMessageId = message.message_id;
    } catch (error) {
        await ctx.reply('Произошла ошибка при получении информации о тайтле. Попробуйте позже.');
    }
}

/**
 * Показать главы тайтла
 */
async function showChaptersHandler(ctx, titleId, page = 1) {
    try {
        console.log(`[CHAPTERS] Показать главы для тайтла: ${titleId}, страница: ${page}`);
        
        const totalChapters = await getChapterCount(titleId);
        console.log(`[CHAPTERS] Всего глав: ${totalChapters}`);

        if (totalChapters === 0) {
            await ctx.reply('Главы не найдены.');
            return;
        }

        const allChapters = await getAllChapters(titleId, totalChapters);

        if (!allChapters || allChapters.length === 0) {
            await ctx.reply('Главы не найдены.');
            return;
        }

        const limitPerPage = 50;
        const totalPages = Math.ceil(allChapters.length / limitPerPage);
        const startIndex = (page - 1) * limitPerPage;
        const endIndex = startIndex + limitPerPage;
        const chapters = allChapters.slice(startIndex, endIndex);

        const chapterButtons = chapters.map((chapter, index) =>
            Markup.button.callback(`${chapter.chapterNumber}`, `select_chapter_${titleId}_${startIndex + index}`)
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
            try {
                await ctx.deleteMessage(ctx.session.chaptersMessageId);
            } catch (error) {}
        }

        const chaptersMessage = await ctx.reply(`Выберите главу (${allChapters.length} всего, стр. ${page}/${totalPages}):`, { reply_markup: { inline_keyboard: buttonRows } });
        ctx.session.chaptersMessageId = chaptersMessage.message_id;
    } catch (error) {
        console.error('Ошибка при получении глав:', error.message);
        await ctx.reply('Произошла ошибка при получении глав. Попробуйте позже.');
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

    // Обработчик для выбора главы
    bot.action(/select_chapter_(.+)_(\d+)/, async (ctx) => {
        const titleId = ctx.match[1];
        const chapterIndex = parseInt(ctx.match[2]);
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
}

module.exports = { setupTitleHandlers, viewTitleHandler, showChaptersHandler };

