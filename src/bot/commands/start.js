/**
 * Команда /start
 */
const { Markup } = require('telegraf');

function setupStartCommand(bot) {
    bot.start((ctx) => {
        ctx.reply(
            'Привет! Я бот для чтения манги и новелл.',
            Markup.keyboard([
                ['🔍 Поиск тайтлов', '📖 Мои тайтлы'],
                ['📚 Каталог', '🆕 Новые главы'],
                ['ℹ️ Помощь']
            ]).resize()
        );
    });
}

module.exports = { setupStartCommand };

