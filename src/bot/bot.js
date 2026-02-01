/**
 * Основной файл конфигурации Telegram-бота
 */
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('../config');

// Инициализация бота
const bot = new Telegraf(BOT_TOKEN);

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

setupStartCommand(bot);
setupSearchCommand(bot);
setupCatalogCommand(bot);
setupHelpCommand(bot);
setupTitleHandlers(bot);
setupNavigationHandlers(bot);

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('Ошибка обновления:', err);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
});

// Запуск бота
function launchBot() {
    return bot.launch()
        .then(() => {
            console.log('Бот успешно запущен и готов к работе!');
        })
        .catch((error) => {
            console.error('Ошибка запуска бота:', error);
        });
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = { bot, launchBot };

