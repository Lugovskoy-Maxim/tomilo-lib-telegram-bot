/**
 * Навигационные обработчики (каталог, новые главы)
 */
const { Markup } = require('telegraf');
const { getLatestUpdates, getChapter, getAllChapters } = require('../../services/api');
const { showChapterAsTeletype } = require('./title');

/**
 * Показать ленту новых глав
 */
async function showNewChaptersFeed(ctx) {
    try {
        console.log('[NAVIGATION] Fetching latest updates...');
        const chapters = await getLatestUpdates(10);
        console.log(`[NAVIGATION] Got ${chapters.length} chapters`);

        if (chapters.length === 0) {
            console.log('[NAVIGATION] No new chapters found');
            await ctx.reply('Новых глав пока нет.');
            return;
        }

        let message = '🆕 *Последние новые главы:*\n\n';

        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            const titleName = chapter.title || 'Без названия';
            const titleSlug = chapter.slug || '';
            const chapterNumber = chapter.chapterNumber || 'N/A';
            const chapterId = chapter._id;

            message += `${i + 1}. *${titleName}* — гл. ${chapter.number ?? chapter.chapterNumber ?? chapter.chapter ?? 'N/A'}\n`;

            if (chapter.timeAgo) {
                const date = new Date(chapter.timeAgo).toLocaleDateString('ru-RU');
                message += `   📅 ${date}\n`;
            }

            if (titleSlug && chapterId) {
                message += `   [Читать на сайте](https://tomilo-lib.ru/titles/${titleSlug})\n`;
            }

            message += '\n';
        }

        const buttons = chapters.map((chapter, index) =>
            Markup.button.callback(`Читать ${index + 1}`, `read_feed_chapter_${chapter._id ?? chapter.id}`)
        );

        const buttonRows = [];
        for (let i = 0; i < buttons.length; i += 2) {
            buttonRows.push(buttons.slice(i, i + 2));
        }

        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttonRows } });
    } catch (error) {
        console.error('Ошибка при получении ленты новых глав:', error);
        await ctx.reply('Произошла ошибка при получении новых глав. Попробуйте позже.');
    }
}

/**
 * Чтение главы из ленты
 */
async function readFeedChapter(ctx, chapterId) {
    try {
        await ctx.answerCbQuery();

        const chapter = await getChapter(chapterId);
        const titleId = chapter.titleId ?? chapter.title?.id ?? chapter.title;
        if (!titleId) {
            await ctx.reply('Не удалось определить тайтл главы.');
            return;
        }

        const allChapters = await getAllChapters(titleId, 1000, 'asc');
        const chapterIndex = allChapters.findIndex(c => (c._id ?? c.id) === chapterId);
        if (chapterIndex === -1) {
            await ctx.reply('Глава не найдена в списке.');
            return;
        }

        await showChapterAsTeletype(ctx, titleId, chapterIndex);
    } catch (error) {
        console.error('Ошибка при чтении главы из ленты:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
}

function setupNavigationHandlers(bot) {
    // Добавляем logging для отладки
    console.log('[NAVIGATION] Setting up navigation handlers');

    // Кнопка "Новые главы"
    bot.hears('🆕 Новые главы', async (ctx) => {
        console.log('[NAVIGATION] MATCHED "🆕 Новые главы" hears handler!');
        console.log('[NAVIGATION] Message text:', ctx.message?.text);
        await showNewChaptersFeed(ctx);
    });

    bot.command('new', async (ctx) => {
        console.log('[NAVIGATION] MATCHED /new command!');
        await showNewChaptersFeed(ctx);
    });

    // Навигация по каталогу
    bot.action(/catalog_page_(\d+)/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage(ctx.update.callback_query.message.message_id);
        } catch (e) {}
        const { showCatalog } = require('../commands/catalog');
        await showCatalog(ctx, page);
    });

    // Чтение главы из ленты
    bot.action(/read_feed_chapter_(.+)/, async (ctx) => {
        await readFeedChapter(ctx, ctx.match[1]);
    });

    // Мои тайтлы — список закладок
    bot.hears('📖 Мои тайтлы', async (ctx) => {
        const bookmarks = ctx.session?.bookmarks;
        if (!bookmarks || bookmarks.length === 0) {
            await ctx.reply('У вас пока нет сохранённых тайтлов. Откройте тайтл из каталога или поиска и нажмите «🔖 Добавить в закладки».');
            return;
        }
        const { getTitle } = require('../../services/api');
        const names = await Promise.all(
            bookmarks.map((id) => getTitle(id).then((t) => t?.name || id).catch(() => id))
        );
        const buttonRows = names.map((name, i) => [
            Markup.button.callback(name.substring(0, 30) + (name.length > 30 ? '…' : ''), `view_title_${bookmarks[i]}`)
        ]);
        await ctx.reply('📖 Мои тайтлы:', { reply_markup: { inline_keyboard: buttonRows } });
    });
}

module.exports = { setupNavigationHandlers, showNewChaptersFeed, readFeedChapter };

