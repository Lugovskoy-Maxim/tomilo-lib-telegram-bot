/**
 * Навигационные обработчики (каталог, новые главы)
 */
const axios = require('axios');
const { Markup } = require('telegraf');
const { API_BASE_URL } = require('../../config');
const { getLatestUpdates } = require('../../services/api');
const { createAndSendPDF } = require('../../utils/pdf');

/**
 * Показать ленту новых глав
 */
async function showNewChaptersFeed(ctx) {
    try {
        const chapters = await getLatestUpdates(10);

        if (chapters.length === 0) {
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

            message += `${i + 1}. *${titleName}* - ${chapter.chapter}\n`;

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
            Markup.button.callback(`Читать ${index + 1}`, `read_feed_chapter_${chapter._id}`)
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

        const chapterResponse = await axios.get(`${API_BASE_URL}/chapters/${chapterId}`, { timeout: 10000 });
        const chapter = chapterResponse.data.data || chapterResponse.data;

        const titleResponse = await axios.get(`${API_BASE_URL}/titles/${chapter.titleId}`, { timeout: 10000 });
        const title = titleResponse.data.data || titleResponse.data;

        const statusMessage = await ctx.reply(`📖 Глава ${chapter.number || chapter.chapterNumber || 'N/A'} формируется...\nЗагружено изображений: 0/${chapter.pages?.length || 0}`);

        const baseURL = API_BASE_URL.replace('/api', '');
        const chapterUrl = `${baseURL}/titles/${title.slug || chapter.titleId}/chapter/${chapterId}`;

        const { getAllChapters } = require('../../services/api');
        const allChapters = await getAllChapters(chapter.titleId, 1000);
        const chapterIndex = allChapters.findIndex(c => c._id === chapterId);

        createAndSendPDF(ctx, chapter.titleId, chapterIndex, chapter, title, chapterUrl, statusMessage, allChapters).catch(console.error);
    } catch (error) {
        console.error('Ошибка при чтении главы из ленты:', error);
        await ctx.reply('Произошла ошибка при создании PDF. Попробуйте позже.');
    }
}

function setupNavigationHandlers(bot) {
    // Кнопка "Новые главы"
    bot.hears('🆕 Новые главы', async (ctx) => {
        await showNewChaptersFeed(ctx);
    });

    bot.command('new', async (ctx) => {
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

    // Мои тайтлы (заглушка)
    bot.hears('📖 Мои тайтлы', async (ctx) => {
        await ctx.reply('Функция "Мои тайтлы" пока не реализована.');
    });
}

module.exports = { setupNavigationHandlers, showNewChaptersFeed, readFeedChapter };

