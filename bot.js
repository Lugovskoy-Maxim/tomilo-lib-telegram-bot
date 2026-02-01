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
    ctx.reply('Привет! Я бот для уведомлений о новых главах. Вы будете получать уведомления о новых главах.',
        Markup.keyboard([
            ['🔍 Поиск тайтлов', '📖 Мои тайтлы'],
            ['📚 Каталог', 'ℹ️ Помощь']
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
    await ctx.deleteMessage(ctx.update.callback_query.message.message_id);
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
    await showChapters(ctx, titleId);
});

// Обработчик callback для выбора главы
bot.action(/select_chapter_(.+)_(\d+)/, async (ctx) => {
    const titleId = ctx.match[1];
    const chapterIndex = parseInt(ctx.match[2]);
    await selectChapter(ctx, titleId, chapterIndex);
});

// Обработчик callback для навигации по страницам глав
bot.action(/chapters_page_(.+)_(\d+)/, async (ctx) => {
    const titleId = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    await showChapters(ctx, titleId, page);
});

// Функция для проверки новых глав
async function checkForNewChapters() {
    try {
        // Получаем список последних глав из API
        const response = await axios.get(`${API_BASE_URL}/chapters?limit=5&sort=createdAt:desc`);
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
                            const titleResponse = await axios.get(`${API_BASE_URL}/titles/${chapter.titleId}`);
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
                        Markup.inlineKeyboard([
                            Markup.button.url('Читать', `${baseUrl}/titles/${titleSlug}/chapter/${chapter._id}`)
                        ])
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
    checkForNewChapters();
});

// Запуск бота
bot.launch()
    .then(() => {
        console.log('Бот успешно запущен и готов к работе!');
        // Отправляем сообщение о запуске (опционально)
        // Если у вас есть ID чата администратора, можно отправить сообщение:
        // bot.telegram.sendMessage(ADMIN_CHAT_ID, 'Бот запущен и готов к работе!');
        
        // Проверяем новые главы при запуске
        checkForNewChapters();
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

