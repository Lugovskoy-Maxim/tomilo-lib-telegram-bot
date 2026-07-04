/**
 * Синхронизация chatId привязанного пользователя с бэкендом
 */
const { syncBotSession } = require('../../services/api');

function setupSessionSync(bot) {
    bot.use(async (ctx, next) => {
        const from = ctx.from;
        const chatId = ctx.chat?.id;
        if (from?.id && chatId) {
            try {
                await syncBotSession(from.id, chatId, from.username);
            } catch (error) {
                console.warn('[SESSION] sync failed:', error.message);
            }
        }
        return next();
    });
}

module.exports = { setupSessionSync };