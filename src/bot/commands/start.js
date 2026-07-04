/**
 * Команда /start
 */
const { getLinkedUser } = require('../../services/api');
const { handleStartWithPayload, buildMainKeyboard } = require('./link');

function setupStartCommand(bot) {
    bot.start(async (ctx) => {
        const handled = await handleStartWithPayload(ctx);
        let linked = false;
        try {
            const info = await getLinkedUser(ctx.from.id);
            linked = !!info.linked;
        } catch (_) {}

        if (handled) {
            await ctx.reply('Используйте меню ниже для навигации.', buildMainKeyboard(linked));
            return;
        }

        const intro = linked
            ? (
                'С возвращением в Tomilo Lib!\n\n' +
                '• Профиль и подписка — кнопка «👤 Профиль»\n' +
                '• Уведомления о новых главах в закладках\n' +
                '• PDF глав — для премиум-подписчиков'
            )
            : (
                'Привет! Я бот Tomilo Lib.\n\n' +
                '• Привяжите аккаунт сайта — /link КОД\n' +
                '• Профиль и подписка — кнопка «👤 Профиль»\n' +
                '• Уведомления о новых главах в закладках\n' +
                '• PDF глав — для премиум-подписчиков\n\n' +
                'Код генерируется в профиле на сайте.'
            );

        await ctx.reply(intro, buildMainKeyboard(linked));
    });
}

module.exports = { setupStartCommand };