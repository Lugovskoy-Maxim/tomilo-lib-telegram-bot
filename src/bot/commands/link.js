/**
 * Команды привязки аккаунта сайта
 */
const { Markup } = require('telegraf');
const { SITE_URL } = require('../../config');
const { getLinkedUser, linkAccount } = require('../../services/api');

async function handleLinkCommand(ctx, codeArg) {
    const code = codeArg || (ctx.message?.text || '').replace(/^\/link\s*/i, '').trim();
    if (!code) {
        await ctx.reply(
            'Отправьте код привязки из профиля на сайте:\n/link КОД\n\nИли сгенерируйте код в профиле → Настройки → Telegram.',
        );
        return;
    }

    const telegramUserId = ctx.from.id;
    const chatId = ctx.chat.id;
    const username = ctx.from.username ? `@${ctx.from.username}` : undefined;

    try {
        const result = await linkAccount(code, telegramUserId, chatId, username);
        await ctx.reply(
            `✅ Аккаунт привязан!\n\nСайт: *${result.username}*\n\nТеперь вы будете получать уведомления о новых главах и новостях.`,
            { parse_mode: 'Markdown' },
        );
    } catch (error) {
        const apiMessage =
            error.response?.data?.message ||
            error.response?.data?.errors?.[0];
        let message = apiMessage || error.message || 'Не удалось привязать аккаунт';
        if (apiMessage === 'Bot API is not configured') {
            message =
                'На сервере tomilo-lib.ru не настроен TELEGRAM_BOT_API_SECRET.\n' +
                'Добавьте одинаковый секрет в .env бэкенда и бота, затем перезапустите оба сервиса.';
        } else if (apiMessage === 'Invalid bot API secret') {
            message = 'Секрет бота не совпадает с сервером. Проверьте BOT_API_SECRET в .env бота.';
        }
        await ctx.reply(`❌ ${message}`);
    }
}

async function handleStatusCommand(ctx) {
    try {
        const info = await getLinkedUser(ctx.from.id);
        if (!info.linked) {
            await ctx.reply(
                'Telegram не привязан к аккаунту на сайте.\n\nСгенерируйте код в профиле на tomilo-lib.ru и отправьте: /link КОД',
                Markup.inlineKeyboard([
                    Markup.button.url('Открыть профиль', `${SITE_URL}/profile?tab=settings&section=telegram`),
                ]),
            );
            return;
        }

        let text = `👤 *${info.username}*\n`;
        text += info.isPremium ? '⭐ Премиум активен\n' : 'Премиум не активен\n';
        text += info.telegramUsername ? `Telegram: @${info.telegramUsername}\n` : '';
        text += '\nPDF глав доступен только премиум-подписчикам.';
        await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (error) {
        await ctx.reply('Не удалось получить статус. Попробуйте позже.');
    }
}

async function handleStartWithPayload(ctx) {
    const payload = ctx.startPayload || '';
    if (payload.startsWith('link_')) {
        const code = payload.replace(/^link_/, '');
        await handleLinkCommand(ctx, code);
        return true;
    }
    return false;
}

function setupLinkCommand(bot) {
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
}

module.exports = {
    setupLinkCommand,
    handleLinkCommand,
    handleStatusCommand,
    handleStartWithPayload,
};