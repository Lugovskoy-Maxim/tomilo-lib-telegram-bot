/**
 * Команды привязки аккаунта сайта
 */
const { Markup } = require('telegraf');
const { SITE_URL } = require('../../config');
const { getLinkedUser, linkAccount } = require('../../services/api');
const { SUBSCRIPTION_BUTTON } = require('../keyboards/main');

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
        const buttons = [];

        if (!info.linked) {
            let text = '⭐ *Статус подписки*\n\n';
            text += 'Аккаунт сайта не привязан.\n\n';
            text += 'Привяжите профиль, чтобы видеть статус подписки и скачивать PDF глав.';
            buttons.push([Markup.button.url('Привязать в профиле', `${SITE_URL}/profile?tab=settings&section=telegram`)]);
            await ctx.reply(text, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons),
            });
            return;
        }

        let text = '⭐ *Статус подписки*\n\n';
        text += `👤 *${info.username}*\n`;
        if (info.isPremium) {
            text += '✅ Премиум активен\n';
            text += '\nДоступны платные главы и скачивание PDF в боте.';
        } else {
            text += '❌ Премиум не активен\n';
            text += '\nПлатные главы и PDF в боте доступны только с подпиской.';
            buttons.push([Markup.button.url('Оформить премиум', `${SITE_URL}/premium`)]);
        }
        if (info.telegramUsername) {
            text += `\nTelegram: @${info.telegramUsername}`;
        }
        buttons.push([Markup.button.url('Профиль на сайте', `${SITE_URL}/profile`)]);

        await ctx.reply(text, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons),
        });
    } catch (error) {
        await ctx.reply('Не удалось получить статус подписки. Попробуйте позже.');
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

    bot.hears(SUBSCRIPTION_BUTTON, handleStatusCommand);

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