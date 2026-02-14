/**
 * Основной файл конфигурации Telegram-бота
 */
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('../config');

// Инициализация бота с включенным отладочным режимом
const bot = new Telegraf(BOT_TOKEN, {
    telegram: {
        agent: null // Use default HttpsAgent
    },
    handlerTimeout: 90000, // 90 seconds timeout
    polling: {
        timeout: 10,
        limit: 100,
        retryTime: 10000,
        allowedUpdates: ['message', 'callback_query', 'inline_query']
    }
});

// Enable Telegraf debug logging
bot.use(async (ctx, next) => {
    const updateStr = JSON.stringify(ctx.update);
    console.log('[DEBUG] Incoming update length:', updateStr.length);
    console.log('[DEBUG] Full update:', updateStr);
    return next();
});

// Добавляем сессию для хранения данных между запросами
// ВАЖНО: сессия должна быть добавлена ПЕРЕД регистрацией команд
const { session } = require('telegraf');
bot.use(session());

// Настройка команд
const { setupStartCommand } = require('./commands/start');
const { setupSearchCommand } = require('./commands/search');
const { setupCatalogCommand } = require('./commands/catalog');
const { setupHelpCommand } = require('./commands/help');
const { setupTitleHandlers } = require('./handlers/title');
const { setupNavigationHandlers } = require('./handlers/navigation');

// ВАЖНО: Команды должны быть настроены ПОСЛЕ сессии
// ВАЖНО: Порядок важен! Сначала уникальные команды, потом общие regex обработчики
setupStartCommand(bot);
setupCatalogCommand(bot);
setupNavigationHandlers(bot);
setupSearchCommand(bot);
setupHelpCommand(bot);
setupTitleHandlers(bot);


// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('Ошибка обновления:', err);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
});

// Запуск бота
function launchBot() {
    console.log('[BOT] Starting bot launch...');
    return bot.launch()
        .then(() => {
            console.log('[BOT] Bot launch completed successfully!');
            console.log('Бот успешно запущен и готов к работе!');
        })
        .catch((error) => {
            console.error('[BOT] Bot launch failed:', error.message);
            console.error('Ошибка запуска бота:', error);
        });
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = { bot, launchBot };

