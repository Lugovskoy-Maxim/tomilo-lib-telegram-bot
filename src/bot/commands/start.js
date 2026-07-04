/**
 * Команда /start
 */
const { Markup } = require('telegraf');
const { handleStartWithPayload } = require('./link');

const MAIN_KEYBOARD = Markup.keyboard([
    ['🔍 Поиск тайтлов', '📖 Мои тайтлы'],
    ['📚 Каталог', '🆕 Новые главы'],
    ['🔗 Привязать аккаунт', 'ℹ️ Помощь'],
]).resize();

function setupStartCommand(bot) {
    bot.start(async (ctx) => {
        const handled = await handleStartWithPayload(ctx);
        if (handled) {
            await ctx.reply('Используйте меню ниже для навигации.', MAIN_KEYBOARD);
            return;
        }

        await ctx.reply(
            'Привет! Я бот Tomilo Lib.\n\n' +
            '• Привяжите аккаунт сайта — /link КОД\n' +
            '• Уведомления о новых главах\n' +
            '• PDF глав — для премиум-подписчиков\n\n' +
            'Код генерируется в профиле на сайте.',
            MAIN_KEYBOARD,
        );
    });
}

module.exports = { setupStartCommand };