/**
 * Навигационные обработчики (каталог, новые главы)
 */
const { Markup } = require('telegraf');
const { SITE_URL } = require('../../config');
const { getLatestUpdates, getChapter, getAllChapters, getLinkedUser, getBookmarks } = require('../../services/api');
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
                message += `   [Читать на сайте](${SITE_URL}/titles/${titleSlug})\n`;
            }

            message += '\n';
        }

        let linkedInfo = { linked: false, isPremium: false };
        try {
            linkedInfo = await getLinkedUser(ctx.from.id);
        } catch (_) {}

        const buttons = chapters.map((chapter, index) => {
            const chapterId = chapter._id ?? chapter.id ?? chapter.latestChapterId;
            const label = linkedInfo.isPremium ? `Читать ${index + 1}` : `Читать ${index + 1}`;
            return Markup.button.callback(label, `read_feed_chapter_${chapterId}`);
        });

        const buttonRows = [];
        for (let i = 0; i < buttons.length; i += 2) {
            buttonRows.push(buttons.slice(i, i + 2));
        }

        if (linkedInfo.isPremium) {
            const pdfButtons = chapters
                .filter((chapter) => chapter._id ?? chapter.id ?? chapter.latestChapterId)
                .map((chapter, index) => {
                    const chapterId = chapter._id ?? chapter.id ?? chapter.latestChapterId;
                    return Markup.button.callback(`PDF ${index + 1}`, `pdf_feed_chapter_${chapterId}`);
                });
            for (let i = 0; i < pdfButtons.length; i += 2) {
                buttonRows.push(pdfButtons.slice(i, i + 2));
            }
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

    // Мои тайтлы — закладки с сайта (при привязанном аккаунте)
    bot.hears('📖 Мои тайтлы', async (ctx) => {
        try {
            const info = await getLinkedUser(ctx.from.id);
            if (!info.linked) {
                await ctx.reply(
                    'Привяжите аккаунт сайта, чтобы видеть закладки.\n\nСгенерируйте код в профиле и отправьте: /link КОД',
                    Markup.inlineKeyboard([
                        Markup.button.url('Профиль на сайте', `${SITE_URL}/profile?tab=settings&section=telegram`),
                    ]),
                );
                return;
            }

            const bookmarks = await getBookmarks(ctx.from.id);
            const reading = (bookmarks || []).filter(
                (b) => b.category === 'reading' || b.category === 'favorites',
            );

            if (reading.length === 0) {
                await ctx.reply('В закладках «Читаю» и «Избранное» пока нет тайтлов.');
                return;
            }

            const buttons = reading.slice(0, 10).map((b) => {
                const name = b.title?.name || 'Тайтл';
                return [Markup.button.callback(name.slice(0, 40), `view_title_${b.titleId}`)];
            });

            await ctx.reply(`📖 *Мои тайтлы* (${info.username})\n\nВыберите тайтл:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons },
            });
        } catch (error) {
            console.error('showMyTitles error:', error);
            await ctx.reply('Не удалось загрузить закладки. Попробуйте позже.');
        }
    });

    // PDF главы из ленты новостей (только премиум)
    bot.action(/pdf_feed_chapter_(.+)/, async (ctx) => {
        const chapterId = ctx.match[1];
        try {
            await ctx.answerCbQuery();
        } catch (_) {}
        const { prepareChapterForReadingFromFeed } = require('../../utils/pdf');
        await prepareChapterForReadingFromFeed(ctx, chapterId);
    });
}

module.exports = { setupNavigationHandlers, showNewChaptersFeed, readFeedChapter };

