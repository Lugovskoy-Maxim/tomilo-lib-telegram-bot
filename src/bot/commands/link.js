/**
 * Команды привязки аккаунта и профиля
 */
const { Markup } = require('telegraf');
const { SITE_URL } = require('../../config');
const { getLinkedUser, linkAccount } = require('../../services/api');
const {
    PROFILE_BUTTON,
    LINK_BUTTON,
    buildMainKeyboard,
} = require('../keyboards/main');

function formatDateTime(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatProfileText(info) {
    if (!info.linked) {
        return (
            '👤 *Профиль*\n\n' +
            'Аккаунт сайта не привязан.\n\n' +
            'Привяжите профиль, чтобы видеть закладки, получать уведомления о новых главах и скачивать PDF.'
        );
    }

    const lines = ['👤 *Профиль*', '', `🆔 *${info.username}*`];

    if (info.level != null) {
        lines.push(`📊 Уровень: *${info.level}*`);
    }
    if (info.balance != null) {
        lines.push(`🪙 Монеты активности: *${info.balance}*`);
    }

    lines.push('');
    if (info.isPremium) {
        lines.push('⭐ *Премиум активен*');
        const expires = formatDateTime(info.subscriptionExpiresAt);
        if (expires) {
            lines.push(`Действует до: ${expires}`);
        }
        lines.push('Доступны платные главы и PDF в боте.');
    } else {
        lines.push('❌ *Премиум не активен*');
        lines.push('Платные главы и PDF доступны с подпиской.');
    }

    const bc = info.bookmarksCount;
    if (bc) {
        lines.push('');
        lines.push('🔖 *Закладки*');
        lines.push(`Всего: ${bc.total}`);
        if (bc.reading) lines.push(`Читаю: ${bc.reading}`);
        if (bc.favorites) lines.push(`Избранное: ${bc.favorites}`);
        if (bc.planned) lines.push(`В планах: ${bc.planned}`);
        if (bc.completed) lines.push(`Прочитано: ${bc.completed}`);
        if (bc.dropped) lines.push(`Брошено: ${bc.dropped}`);
    }

    const n = info.notifications;
    if (n) {
        lines.push('');
        lines.push('🔔 *Уведомления*');
        lines.push(`Новые главы: ${n.newChapters ? '✅ вкл' : '❌ выкл'}`);
        lines.push(`Новости: ${n.news ? '✅ вкл' : '❌ выкл'}`);
        lines.push(`Комментарии: ${n.comments ? '✅ вкл' : '❌ выкл'}`);
        if (n.newChapters === false) {
            lines.push('\n_Уведомления о главах отключены в настройках сайта._');
        } else if (info.telegramChatConfigured === false) {
            lines.push('\n_Напишите боту любое сообщение, чтобы получать личные уведомления о главах в закладках._');
        } else {
            lines.push('\n_Уведомления о главах в закладках приходят сюда, с обложкой тайтла._');
        }
    }

    lines.push('');
    if (info.telegramUsername) {
        lines.push(`Telegram: @${info.telegramUsername}`);
    }
    const linkedAt = formatDateTime(info.linkedAt);
    if (linkedAt) {
        lines.push(`Привязан: ${linkedAt}`);
    }

    return lines.join('\n');
}

function buildProfileKeyboard(info) {
    const buttons = [];
    if (!info.linked) {
        buttons.push([
            Markup.button.url(
                'Привязать в профиле',
                `${SITE_URL}/profile?tab=settings&section=telegram`,
            ),
        ]);
        return buttons;
    }
    if (!info.isPremium) {
        buttons.push([Markup.button.url('Оформить премиум', `${SITE_URL}/premium`)]);
    }
    buttons.push([
        Markup.button.url('Настройки на сайте', `${SITE_URL}/profile?tab=settings`),
    ]);
    buttons.push([Markup.button.url('Профиль на сайте', `${SITE_URL}/profile`)]);
    return buttons;
}

async function sendProfile(ctx) {
    const info = await getLinkedUser(ctx.from.id);
    await ctx.reply(formatProfileText(info), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buildProfileKeyboard(info)),
    });
    return info;
}

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
            `✅ Аккаунт привязан!\n\nСайт: *${result.username}*\n\nУведомления о новых главах в закладках будут приходить сюда (с обложкой). Управление — в меню «🆕 Новые главы» или в профиле на сайте.`,
            { parse_mode: 'Markdown', ...buildMainKeyboard(true) },
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
        await sendProfile(ctx);
    } catch (error) {
        await ctx.reply('Не удалось получить профиль. Попробуйте позже.');
    }
}

async function handleStartWithPayload(ctx) {
    const payload = ctx.startPayload || '';
    if (payload.startsWith('link_')) {
        const code = payload.replace(/^link_/, '');
        await handleLinkCommand(ctx, code);
        return true;
    }
    if (payload.startsWith('ch_')) {
        const chapterId = payload.replace(/^ch_/, '');
        if (chapterId) {
            const { readFeedChapter } = require('../handlers/navigation');
            await readFeedChapter(ctx, chapterId);
            return true;
        }
    }
    return false;
}

function setupLinkCommand(bot) {
    bot.command('link', async (ctx) => {
        const code = (ctx.message.text || '').replace(/^\/link\s*/i, '').trim();
        await handleLinkCommand(ctx, code);
    });

    bot.command('status', handleStatusCommand);
    bot.command('profile', handleStatusCommand);

    bot.hears(PROFILE_BUTTON, handleStatusCommand);

    bot.hears(LINK_BUTTON, async (ctx) => {
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
    sendProfile,
    buildMainKeyboard,
};