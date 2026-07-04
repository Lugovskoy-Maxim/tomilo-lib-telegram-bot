const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { BOT_TOKEN, API_BASE_URL, SITE_URL } = require('./config');
const { searchTitles } = require('./search');
const { showCatalog } = require('./catalog');
const { viewTitle, showChapters, selectChapter, createAndSendPDF } = require('./title');
const { handleLinkCommand, handleStatusCommand, handleStartWithPayload } = require('./link');
const { showMyTitles } = require('./bookmarks');
const { getLinkedUser, getChapterForUser } = require('./api');

const bot = new Telegraf(BOT_TOKEN);

const { session } = require('telegraf');
bot.use(session());

bot.start(async (ctx) => {
    const handled = await handleStartWithPayload(ctx);
    if (handled) {
        await ctx.reply(
            'Используйте меню ниже для навигации.',
            Markup.keyboard([
                ['🔍 Поиск тайтлов', '📖 Мои тайтлы'],
                ['📚 Каталог', '🆕 Новые главы'],
                ['🔗 Привязать аккаунт', 'ℹ️ Помощь']
            ]).resize()
        );
        return;
    }

    ctx.reply(
        'Привет! Я бот Tomilo Lib.\n\n' +
        '• Привяжите аккаунт сайта — /link КОД\n' +
        '• Уведомления о новых главах\n' +
        '• PDF глав — для премиум-подписчиков\n\n' +
        'Код генерируется в профиле на сайте.',
        Markup.keyboard([
            ['🔍 Поиск тайтлов', '📖 Мои тайтлы'],
            ['📚 Каталог', '🆕 Новые главы'],
            ['🔗 Привязать аккаунт', 'ℹ️ Помощь']
        ]).resize()
    );
});

bot.help((ctx) => {
    ctx.reply(
        'Tomilo Lib Bot\n\n' +
        '/link КОД — привязать аккаунт сайта\n' +
        '/status — статус привязки и премиум\n' +
        '/search — поиск тайтлов\n' +
        '/catalog — каталог\n' +
        '/new — новые главы\n\n' +
        'PDF глав доступен привязанным премиум-пользователям.'
    );
});

bot.command('link', async (ctx) => {
    const code = (ctx.message.text || '').replace(/^\/link\s*/i, '').trim();
    await handleLinkCommand(ctx, code);
});

bot.command('status', handleStatusCommand);

bot.hears('🔗 Привязать аккаунт', async (ctx) => {
    await ctx.reply(
        'Сгенерируйте код в профиле на сайте (Настройки → Telegram) и отправьте:\n/link КОД',
        Markup.inlineKeyboard([
            Markup.button.url('Открыть профиль', `${SITE_URL}/profile?tab=settings&section=telegram`),
        ]),
    );
});

bot.hears('ℹ️ Помощь', (ctx) => {
    ctx.reply('Доступные команды: /link, /status, /search, /catalog, /new, /help');
});

bot.hears('🔍 Поиск тайтлов', async (ctx) => {
    await searchTitles(ctx, bot);
});

bot.command('search', async (ctx) => {
    await searchTitles(ctx, bot);
});

bot.command('new', async (ctx) => {
    await showNewChaptersFeed(ctx);
});

bot.hears('📚 Каталог', async (ctx) => {
    await showCatalog(ctx, 1);
});

bot.command('catalog', async (ctx) => {
    await showCatalog(ctx, 1);
});

bot.action(/catalog_page_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    try {
        await ctx.answerCbQuery();
        await ctx.deleteMessage(ctx.update.callback_query.message.message_id);
    } catch (e) {}
    await showCatalog(ctx, page);
});

bot.hears('📖 Мои тайтлы', showMyTitles);

bot.action(/view_title_(.+)/, async (ctx) => {
    const match = ctx.match[1].match(/([a-f0-9]+)_(\d+)/);
    if (match) {
        await viewTitle(ctx, match[1], parseInt(match[2]));
    } else {
        await viewTitle(ctx, ctx.match[1]);
    }
});

bot.action(/read_title_(.+)/, async (ctx) => {
    const titleId = ctx.match[1];
    try {
        await ctx.answerCbQuery();
    } catch (e) {}
    await showChapters(ctx, titleId);
});

bot.action(/select_chapter_(.+)_(\d+)/, async (ctx) => {
    const titleId = ctx.match[1];
    const chapterIndex = parseInt(ctx.match[2]);
    try {
        await ctx.answerCbQuery();
    } catch (e) {}
    await selectChapter(ctx, titleId, chapterIndex);
});

bot.action(/chapters_page_(.+)_(\d+)/, async (ctx) => {
    const titleId = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    try {
        await ctx.answerCbQuery();
        await ctx.deleteMessage(ctx.update.callback_query.message.message_id);
    } catch (e) {}
    await showChapters(ctx, titleId, page);
});

bot.action(/read_feed_chapter_(.+)/, async (ctx) => {
    const chapterId = ctx.match[1];
    try {
        await ctx.answerCbQuery();
    } catch (e) {}

    try {
        const linkedInfo = await getLinkedUser(ctx.from.id);
        if (!linkedInfo.linked) {
            await ctx.reply('Для PDF привяжите аккаунт: /link КОД');
            return;
        }
        if (!linkedInfo.isPremium) {
            await ctx.reply('PDF доступен только премиум-подписчикам: https://tomilo-lib.ru/premium');
            return;
        }

        const chapter = await getChapterForUser(ctx.from.id, chapterId);
        const titleId = chapter.titleId?._id || chapter.titleId;
        const titleResponse = await axios.get(`${API_BASE_URL}/titles/${titleId}`, { timeout: 10000 });
        const title = titleResponse.data.data || titleResponse.data;

        const statusMessage = await ctx.reply(
            `📖 Глава ${chapter.number || chapter.chapterNumber || 'N/A'} формируется...\nЗагружено изображений: 0/${chapter.pages?.length || 0}`,
        );

        const baseURL = API_BASE_URL.replace('/api', '');
        const titleSlug = title.slug || titleId;
        const chapterUrl = `${baseURL}/titles/${titleSlug}/chapter/${chapterId}`;

        createAndSendPDF(ctx, titleId, 0, chapter, title, chapterUrl, statusMessage, [chapter]).catch(console.error);
    } catch (error) {
        console.error('Ошибка при чтении главы из ленты:', error);
        const msg = error.response?.data?.message || error.response?.data?.errors?.[0] || 'Произошла ошибка при создании PDF.';
        await ctx.reply(msg);
    }
});

async function showNewChaptersFeed(ctx) {
    try {
        const response = await axios.get(`${API_BASE_URL}/titles/latest-updates?limit=10`, { timeout: 15000 });
        const chaptersData = response.data.data || response.data;
        const items = Array.isArray(chaptersData) ? chaptersData : (chaptersData.chapters || []);

        if (items.length === 0) {
            await ctx.reply('Новых глав пока нет.');
            return;
        }

        let message = '🆕 *Последние обновления:*\n\n';

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const titleName = item.title || 'Без названия';
            const titleSlug = item.slug || '';
            message += `${i + 1}. *${titleName}* — ${item.chapter || item.chapterNumber || 'N/A'}\n`;
            if (titleSlug) {
                message += `   [Читать на сайте](${SITE_URL}/titles/${titleSlug})\n`;
            }
            message += '\n';
        }

        const buttons = items
            .filter((item) => item.latestChapterId)
            .map((item, index) =>
                Markup.button.callback(`PDF ${index + 1}`, `read_feed_chapter_${item.latestChapterId}`)
            );

        const buttonRows = [];
        for (let i = 0; i < buttons.length; i += 2) {
            buttonRows.push(buttons.slice(i, i + 2));
        }

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: buttonRows.length ? { inline_keyboard: buttonRows } : undefined,
            disable_web_page_preview: true,
        });
    } catch (error) {
        console.error('Ошибка при получении ленты новых глав:', error);
        await ctx.reply('Произошла ошибка при получении новых глав. Попробуйте позже.');
    }
}

bot.hears('🆕 Новые главы', async (ctx) => {
    await showNewChaptersFeed(ctx);
});

bot.launch()
    .then(() => {
        console.log('Бот успешно запущен и готов к работе!');
        process.stdout.write('');
    })
    .catch((error) => {
        console.error('Ошибка запуска бота:', error);
    });

bot.catch((err, ctx) => {
    console.error('Ошибка обновления:', err);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;
