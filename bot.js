const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { BOT_TOKEN, API_BASE_URL } = require('./config');
const { searchTitles } = require('./search');
const { showCatalog } = require('./catalog');
const { viewTitle, showChapters, selectChapter } = require('./title');

const bot = new Telegraf(BOT_TOKEN);

// Добавляем сессию для хранения данных между запросами
const { session } = require('telegraf');
bot.use(session());

// Команда /start
bot.start((ctx) => {
    ctx.reply('Привет! Я бот для чтения манги и новелл.',
        Markup.keyboard([
            ['🔍 Поиск тайтлов', '📖 Мои тайтлы'],
            ['📚 Каталог', '🆕 Новые главы'],
            ['ℹ️ Помощь']
        ]).resize()
    );
});

// Команда /help
bot.help((ctx) => {
    ctx.reply('Я бот для чтения манги и новелл. Нажмите кнопку "🆕 Новые главы" для просмотра последних обновлений.\n\nДоступные команды:\n/search - Поиск тайтлов\n/catalog - Каталог\n/new - Новые главы\n/help - Помощь');
});

// Обработчик для кнопки "🔍 Поиск тайтлов"
bot.hears('🔍 Поиск тайтлов', async (ctx) => {
    await searchTitles(ctx, bot);
});

// Команда /search
bot.command('search', async (ctx) => {
    await searchTitles(ctx, bot);
});

// Команда /new
bot.command('new', async (ctx) => {
    await showNewChaptersFeed(ctx);
});

// Обработчик для кнопки "📚 Каталог"
bot.hears('📚 Каталог', async (ctx) => {
    await showCatalog(ctx, 1);
});

// Команда /catalog
bot.command('catalog', async (ctx) => {
    await showCatalog(ctx, 1);
});

// Обработчик callback для навигации по каталогу
bot.action(/catalog_page_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    try {
        await ctx.answerCbQuery();
        await ctx.deleteMessage(ctx.update.callback_query.message.message_id);
    } catch (e) {}
    await showCatalog(ctx, page);
});

// Добавляем обработчик для кнопки "📖 Мои тайтлы"
bot.hears('📖 Мои тайтлы', async (ctx) => {
    await ctx.reply('Функция "Мои тайтлы" пока не реализована.');
});

// Обработчик callback для просмотра тайтла
bot.action(/view_title_(.+)/, async (ctx) => {
    const match = ctx.match[1].match(/([a-f0-9]+)_(\d+)/);
    if (match) {
        await viewTitle(ctx, match[1], parseInt(match[2]));
    } else {
        await viewTitle(ctx, ctx.match[1]);
    }
});

// Обработчик callback для кнопки "Читать"
bot.action(/read_title_(.+)/, async (ctx) => {
    const titleId = ctx.match[1];
    try {
        await ctx.answerCbQuery();
    } catch (e) {}
    await showChapters(ctx, titleId);
});

// Обработчик callback для выбора главы
bot.action(/select_chapter_(.+)_(\d+)/, async (ctx) => {
    const titleId = ctx.match[1];
    const chapterIndex = parseInt(ctx.match[2]);
    try {
        await ctx.answerCbQuery();
    } catch (e) {}
    await selectChapter(ctx, titleId, chapterIndex);
});

// Обработчик callback для навигации по страницам глав
bot.action(/chapters_page_(.+)_(\d+)/, async (ctx) => {
    const titleId = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    try {
        await ctx.answerCbQuery();
        // Удаляем предыдущее сообщение со списком глав
        await ctx.deleteMessage(ctx.update.callback_query.message.message_id);
    } catch (e) {
        // Игнорируем ошибки (например, если сообщение уже удалено)
    }
    await showChapters(ctx, titleId, page);
});

// Обработчик callback для чтения главы из ленты
bot.action(/read_feed_chapter_(.+)/, async (ctx) => {
    const chapterId = ctx.match[1];
    try {
        await ctx.answerCbQuery();
    } catch (e) {}

    try {
        // Получаем информацию о главе
        const chapterResponse = await axios.get(`${API_BASE_URL}/chapters/${chapterId}`, { timeout: 10000 });
        const chapter = chapterResponse.data.data || chapterResponse.data;

        // Получаем информацию о тайтле
        const titleResponse = await axios.get(`${API_BASE_URL}/titles/${chapter.titleId}`, { timeout: 10000 });
        const title = titleResponse.data.data || titleResponse.data;

        // Отправляем сообщение о начале генерации PDF
        const statusMessage = await ctx.reply(
            `📖 Глава ${chapter.number || chapter.chapterNumber || "N/A"} формируется...\nЗагружено изображений: 0/${chapter.pages?.length || 0}`,
        );

        // Запускаем создание PDF в фоновом режиме
        const { createAndSendPDF } = require('./title');
        createAndSendPDF(ctx, chapter.titleId, 0, chapter, title, `${API_BASE_URL.replace('/api', '')}/titles/${title.slug || chapter.titleId}/chapter/${chapterId}`, statusMessage, [chapter]).catch(console.error);
    } catch (error) {
        console.error('Ошибка при чтении главы из ленты:', error);
        await ctx.reply('Произошла ошибка при создании PDF. Попробуйте позже.');
    }
});

// Функция для отображения ленты новых глав
async function showNewChaptersFeed(ctx) {
    try {
        // Получаем список последних обновлений из API
        const response = await axios.get(`${API_BASE_URL}/titles/latest-updates?limit=10`, { timeout: 15000 });
        const chaptersData = response.data.data || response.data;
        const chapters = Array.isArray(chaptersData) ? chaptersData : (chaptersData.chapters || []);

        // Отладка: выводим структуру ответа API
        console.log('API Response structure:', JSON.stringify(chaptersData, null, 2));
        console.log('First chapter structure:', JSON.stringify(chapters[0], null, 2));

        if (chapters.length === 0) {
            await ctx.reply('Новых глав пока нет.');
            return;
        }

        // Создаем сообщение с новыми главами
        let message = '🆕 *Последние новые главы:*\n\n';

        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            const titleName = chapter.title || 'Без названия';
            const titleSlug = chapter.slug || '';
            const chapterNumber = chapter.chapterNumber || 'N/A';
            const chapterId = chapter.id; // This seems to be the title ID, not chapter ID

            message += `${i + 1}. *${titleName}* - ${chapter.chapter}\n`;

            // Добавляем дату, если есть
            if (chapter.timeAgo) {
                const date = new Date(chapter.timeAgo).toLocaleDateString('ru-RU');
                message += `   📅 ${date}\n`;
            }

            // Добавляем ссылку на чтение на сайте
            if (titleSlug && chapterId) {
                message += `   [Читать на сайте](https://tomilo-lib.ru/titles/${titleSlug})\n`;
            }

            message += '\n';
        }

        // Создаем кнопки для чтения
        const buttons = chapters.map((chapter, index) =>
            Markup.button.callback(`Читать ${index + 1}`, `read_feed_chapter_${chapter._id}`)
        );

        // Разбиваем кнопки на группы по 2
        const buttonRows = [];
        for (let i = 0; i < buttons.length; i += 2) {
            buttonRows.push(buttons.slice(i, i + 2));
        }

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: buttonRows
            }
        });
    } catch (error) {
        console.error('Ошибка при получении ленты новых глав:', error);
        await ctx.reply('Произошла ошибка при получении новых глав. Попробуйте позже.');
    }
}

// Обработчик для кнопки "🆕 Новые главы"
bot.hears('🆕 Новые главы', async (ctx) => {
    await showNewChaptersFeed(ctx);
});

// Запуск бота
bot.launch()
    .then(() => {
        console.log('Бот успешно запущен и готов к работе!');
        // Принудительно очищаем буфер вывода
        if (process.stdout && typeof process.stdout.flush === 'function') {
            process.stdout.flush();
        }
        // Альтернативный способ принудительной очистки буфера
        process.stdout.write('');
        
        // Отправляем сообщение о запуске (опционально)
        // Если у вас есть ID чата администратора, можно отправить сообщение:
        // bot.telegram.sendMessage(ADMIN_CHAT_ID, 'Бот запущен и готов к работе!');
    })
    .catch((error) => {
        console.error('Ошибка запуска бота:', error);
    });

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('Ошибка обновления:', err);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;

