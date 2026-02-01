const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const axios = require('axios');
const { BOT_TOKEN, API_BASE_URL } = require('./config');
const { searchTitles } = require('./search');
const { showCatalog } = require('./catalog');
const { viewTitle, showChapters, selectChapter } = require('./title');

const bot = new Telegraf(BOT_TOKEN);

// Добавляем сессию для хранения данных между запросами
const { session } = require('telegraf');
bot.use(session());

// Хранение ID чатов для отправки уведомлений
let chatIds = new Set();

// Команда /start
bot.start((ctx) => {
    chatIds.add(ctx.chat.id);
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
    ctx.reply('Я бот для уведомлений о новых главах. Когда появляются новые главы, я отправляю уведомления.\n\nДоступные команды:\n/search - Поиск тайтлов\n/chapters - Просмотр глав\n/help - Помощь');
});

// Обработчик для кнопки "🔍 Поиск тайтлов"
bot.hears('🔍 Поиск тайтлов', async (ctx) => {
    await searchTitles(ctx, bot);
});

// Команда /search
bot.command('search', async (ctx) => {
    await searchTitles(ctx, bot);
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
        const response = await axios.get(`${API_BASE_URL}/titles/titles/latest-updates?limit=10`, { timeout: 15000 });
        const chaptersData = response.data.data || response.data;
        const chapters = Array.isArray(chaptersData) ? chaptersData : (chaptersData.chapters || []);

        if (chapters.length === 0) {
            await ctx.reply('Новых глав пока нет.');
            return;
        }

        // Создаем сообщение с новыми главами
        let message = '🆕 *Последние новые главы:*\n\n';

        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            const titleName = chapter.title?.name || 'Без названия';
            const chapterNumber = chapter.number || chapter.chapterNumber || 'N/A';

            message += `${i + 1}. *${titleName}* - Глава ${chapterNumber}\n`;

            // Добавляем дату, если есть
            if (chapter.createdAt) {
                const date = new Date(chapter.createdAt).toLocaleDateString('ru-RU');
                message += `   📅 ${date}\n`;
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

// Функция для проверки новых глав
async function checkForNewChapters() {
    try {
        // Получаем список последних глав из API
        const response = await axios.get(`${API_BASE_URL}/chapters?limit=5&sort=createdAt:desc`, { timeout: 15000 });
        const chaptersData = response.data.data || response.data;
        const chapters = Array.isArray(chaptersData) ? chaptersData : (chaptersData.chapters || []);
        
        // Отправляем уведомления о новых главах
        for (const chapter of chapters) {
            // Проверяем, не отправляли ли мы уже уведомление об этой главе
            // В реальной реализации здесь должна быть проверка в базе данных
            const chapterKey = `${chapter.titleId}-${chapter.number}`;
            
            // Отправляем уведомление всем подписчикам
            for (const chatId of chatIds) {
                try {
                    // Получаем информацию о тайтле
                    let titleSlug = chapter.titleId?._id || chapter.titleId;
                    if (chapter.title?.slug) {
                        titleSlug = chapter.title.slug;
                    } else if (chapter.titleId) {
                        try {
                            const titleResponse = await axios.get(`${API_BASE_URL}/titles/${chapter.titleId}`, { timeout: 10000 });
                            const titleData = titleResponse.data.data || titleResponse.data;
                            if (titleData?.slug) {
                                titleSlug = titleData.slug;
                            }
                        } catch (titleError) {
                            // Ошибка получения информации
                        }
                    }
                    
                    const baseUrl = API_BASE_URL.replace('/api', '');
                    await bot.telegram.sendMessage(
                        chatId,
                        `Новая глава!\n\nНазвание: ${chapter.title?.name || 'Без названия'}\nНомер: ${chapter.number}\n${chapter.title?.description || ''}`,
                        {
                            reply_markup: Markup.inlineKeyboard([
                                Markup.button.url('Читать', `${baseUrl}/titles/${titleSlug}/chapter/${chapter._id}`)
                            ]),
                            // Добавляем таймаут для отправки сообщения
                        }
                    );
                } catch (error) {
                    console.error('Ошибка отправки сообщения:', error);
                }
            }
        }
    } catch (error) {
        console.error('Ошибка при проверке новых глав:', error);
    }
}

// Планировщик для регулярной проверки новых глав (каждые 30 минут)
cron.schedule('*/30 * * * *', () => {
    // Проверка новых глав
    checkForNewChapters().catch(error => {
        console.error('Ошибка при проверке новых глав по расписанию:', error);
    });
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
