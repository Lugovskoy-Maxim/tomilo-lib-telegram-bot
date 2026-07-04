/**
 * Навигационные обработчики (каталог, лента новых глав)
 */
const { Markup } = require('telegraf');
const { SITE_URL } = require('../../config');
const {
    getLatestUpdates,
    getChapter,
    getAllChapters,
    getLinkedUser,
    getBookmarks,
    updateChapterNotifySettings,
} = require('../../services/api');
const { showChapterAsTeletype } = require('./title');

const FEED_LIMIT = 15;
const MY_BOOKMARK_CATEGORIES = new Set(['reading', 'favorites', 'planned', 'completed']);

const NOTIFY_MODES = {
    all: { key: 'all', label: '📚 Все новые главы', desc: 'Уведомления о каждой новой главе на сайте' },
    bookmarks: { key: 'bookmarks', label: '🔖 Только закладки', desc: 'Только тайтлы из ваших закладок' },
    off: { key: 'off', label: '🔕 Выключить', desc: 'Уведомления не приходят' },
};

function normalizeFeedItem(item) {
    const titleId = item.id ?? item.titleId ?? item._id;
    const chapterId = item.latestChapterId ?? item.chapterId ?? item._id ?? item.id;
    return {
        title: item.title || item.name || 'Без названия',
        slug: item.slug || '',
        chapterNumber: item.chapterNumber ?? item.number ?? item.chapter ?? 'N/A',
        chapterId: chapterId ? String(chapterId) : null,
        titleId: titleId ? String(titleId) : null,
        timeAgo: item.timeAgo ?? item.lastUpdate ?? item.createdAt,
        chapters: item.chapters,
    };
}

function formatFeedDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function resolveNotifyMode(linkedInfo, session) {
    if (linkedInfo?.chapterNotifyMode && NOTIFY_MODES[linkedInfo.chapterNotifyMode]) {
        return linkedInfo.chapterNotifyMode;
    }
    if (session?.chapterNotifyMode && NOTIFY_MODES[session.chapterNotifyMode]) {
        return session.chapterNotifyMode;
    }
    if (linkedInfo?.notifications?.newChapters === false) {
        return 'off';
    }
    return 'bookmarks';
}

function modeButton(mode, current) {
    const prefix = current === mode.key ? '✅ ' : '';
    return Markup.button.callback(`${prefix}${mode.label}`, `feed_notif_${mode.key}`);
}

async function sendOrEditMenu(ctx, text, keyboard, edit = false) {
    const opts = { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) };
    if (edit && ctx.callbackQuery?.message) {
        try {
            await ctx.editMessageText(text, opts);
            return;
        } catch (error) {
            if (!error.message?.includes('message is not modified')) {
                throw error;
            }
            return;
        }
    }
    await ctx.reply(text, opts);
}

async function showFeedMenu(ctx, options = {}) {
    let linkedInfo = { linked: false, isPremium: false, notifications: { newChapters: true } };
    try {
        linkedInfo = await getLinkedUser(ctx.from.id);
    } catch (_) {}

    ctx.session = ctx.session || {};
    const currentMode = resolveNotifyMode(linkedInfo, ctx.session);
    const current = NOTIFY_MODES[currentMode];

    const rows = [
        [modeButton(NOTIFY_MODES.all, currentMode)],
        [modeButton(NOTIFY_MODES.bookmarks, currentMode)],
        [modeButton(NOTIFY_MODES.off, currentMode)],
        [Markup.button.callback('📰 Посмотреть ленту', 'feed_browse')],
    ];

    if (!linkedInfo.linked) {
        rows.push([
            Markup.button.url(
                '🔗 Привязать аккаунт',
                `${SITE_URL}/profile?tab=settings&section=telegram`,
            ),
        ]);
    }

    const modeTitles = {
        all: 'Все новые главы',
        bookmarks: 'Только закладки',
        off: 'Выключены',
    };

    let text =
        '🔔 *Уведомления о новых главах*\n\n' +
        `Сейчас: *${modeTitles[currentMode]}*\n` +
        `_${current.desc}_`;

    if (linkedInfo.linked) {
        if (currentMode !== 'off') {
            text += '\n\n_Сообщения приходят в этот чат с обложкой тайтла._';
        }
    } else {
        text +=
            '\n\n_Для режимов «Все» и «Закладки» привяжите аккаунт сайта._\n' +
            '_Режим «Выключить» сохраняется локально в боте._';
    }

    await sendOrEditMenu(ctx, text, rows, options.edit);
}

async function showFeedBrowseMenu(ctx) {
    let linkedInfo = { linked: false };
    try {
        linkedInfo = await getLinkedUser(ctx.from.id);
    } catch (_) {}

    const rows = [[Markup.button.callback('📰 Все новые главы', 'feed_all')]];
    if (linkedInfo.linked) {
        rows.push([Markup.button.callback('🔖 Только мои (закладки)', 'feed_mine')]);
    }
    rows.push([Markup.button.callback('◀️ Настройки уведомлений', 'feed_menu')]);

    await sendOrEditMenu(
        ctx,
        '📰 *Лента новых глав*\n\nВыберите, что показать:',
        rows,
        true,
    );
}

async function fetchFeedItems(mode, telegramUserId) {
    const raw = await getLatestUpdates(mode === 'mine' ? 50 : FEED_LIMIT);
    let items = (raw || []).map(normalizeFeedItem).filter((i) => i.chapterId);

    if (mode === 'mine') {
        const bookmarks = await getBookmarks(telegramUserId);
        const titleIds = new Set(
            (bookmarks || [])
                .filter((b) => !b.category || MY_BOOKMARK_CATEGORIES.has(b.category))
                .map((b) => String(b.titleId)),
        );
        items = items.filter((i) => i.titleId && titleIds.has(i.titleId));
        items = items.slice(0, FEED_LIMIT);
    }

    return items;
}

/**
 * Показать ленту новых глав
 * @param {'all'|'mine'} mode
 */
async function showNewChaptersFeed(ctx, mode = 'all') {
    try {
        if (mode === 'mine') {
            const info = await getLinkedUser(ctx.from.id);
            if (!info.linked) {
                await ctx.reply(
                    'Привяжите аккаунт сайта, чтобы видеть новые главы из закладок.',
                    Markup.inlineKeyboard([
                        Markup.button.url('Привязать', `${SITE_URL}/profile?tab=settings&section=telegram`),
                    ]),
                );
                return;
            }
        }

        const items = await fetchFeedItems(mode, ctx.from.id);

        if (!items.length) {
            const emptyText =
                mode === 'mine'
                    ? 'Новых глав в ваших закладках пока нет.'
                    : 'Новых глав пока нет.';
            await ctx.reply(emptyText, Markup.inlineKeyboard([
                [Markup.button.callback('◀️ Настройки уведомлений', 'feed_menu')],
            ]));
            return;
        }

        const header =
            mode === 'mine' ? '🔖 *Новые главы из закладок:*' : '📰 *Все новые главы:*';
        let message = `${header}\n\n`;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            message += `${i + 1}. *${item.title}* — гл. ${item.chapterNumber}\n`;
            const date = formatFeedDate(item.timeAgo);
            if (date) message += `   📅 ${date}\n`;
            if (item.slug) {
                message += `   [На сайте](${SITE_URL}/titles/${item.slug})\n`;
            }
            message += '\n';
        }

        let linkedInfo = { linked: false, isPremium: false };
        try {
            linkedInfo = await getLinkedUser(ctx.from.id);
        } catch (_) {}

        const buttonRows = [];
        const readButtons = items.map((item, index) =>
            Markup.button.callback(`Читать ${index + 1}`, `read_feed_chapter_${item.chapterId}`),
        );
        for (let i = 0; i < readButtons.length; i += 2) {
            buttonRows.push(readButtons.slice(i, i + 2));
        }

        if (linkedInfo.isPremium) {
            const pdfButtons = items.map((item, index) =>
                Markup.button.callback(`PDF ${index + 1}`, `pdf_feed_chapter_${item.chapterId}`),
            );
            for (let i = 0; i < pdfButtons.length; i += 2) {
                buttonRows.push(pdfButtons.slice(i, i + 2));
            }
        }

        buttonRows.push([Markup.button.callback('◀️ Настройки уведомлений', 'feed_menu')]);

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttonRows },
        });
    } catch (error) {
        console.error('Ошибка при получении ленты новых глав:', error);
        await ctx.reply('Произошла ошибка при получении новых глав. Попробуйте позже.');
    }
}

async function setChapterNotifyMode(ctx, mode) {
    if (!NOTIFY_MODES[mode]) return;

    ctx.session = ctx.session || {};
    ctx.session.chapterNotifyMode = mode;

    if (mode !== 'off') {
        const info = await getLinkedUser(ctx.from.id);
        if (!info.linked) {
            await ctx.answerCbQuery?.({ text: 'Нужна привязка аккаунта' }).catch(() => {});
            await ctx.reply(
                'Для уведомлений о главах привяжите аккаунт сайта: /link КОД',
                Markup.inlineKeyboard([
                    Markup.button.url('Привязать', `${SITE_URL}/profile?tab=settings&section=telegram`),
                ]),
            );
            return;
        }
    }

    try {
        if (mode === 'off') {
            try {
                const info = await getLinkedUser(ctx.from.id);
                if (info.linked) {
                    await updateChapterNotifySettings(ctx.from.id, 'off');
                }
            } catch (_) {}
        } else {
            await updateChapterNotifySettings(ctx.from.id, mode);
        }

        try {
            await ctx.answerCbQuery({ text: NOTIFY_MODES[mode].label });
        } catch (_) {}

        await showFeedMenu(ctx, { edit: true });
    } catch (error) {
        console.error('setChapterNotifyMode:', error);
        try {
            await ctx.answerCbQuery({ text: 'Ошибка сохранения' });
        } catch (_) {}
        await ctx.reply('Не удалось сохранить настройки уведомлений.');
    }
}

/**
 * Чтение главы из ленты
 */
async function readFeedChapter(ctx, chapterId) {
    try {
        await ctx.answerCbQuery();

        const chapter = await getChapter(chapterId);
        const titleId = chapter.titleId?._id ?? chapter.titleId ?? chapter.title?.id ?? chapter.title;
        if (!titleId) {
            await ctx.reply('Не удалось определить тайтл главы.');
            return;
        }

        const allChapters = await getAllChapters(titleId, 1000, 'asc');
        const chapterIndex = allChapters.findIndex((c) => String(c._id ?? c.id) === String(chapterId));
        if (chapterIndex === -1) {
            await ctx.reply('Глава не найдена в списке.');
            return;
        }

        await showChapterAsTeletype(ctx, titleId, chapterIndex);
    } catch (error) {
        console.error('Ошибка при чтении главы из ленты:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
}

function setupNavigationHandlers(bot) {
    console.log('[NAVIGATION] Setting up navigation handlers');

    bot.hears('🆕 Новые главы', async (ctx) => {
        await showFeedMenu(ctx);
    });

    bot.command('new', async (ctx) => {
        await showFeedMenu(ctx);
    });

    bot.action('feed_menu', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        } catch (_) {}
        await showFeedMenu(ctx, { edit: true });
    });

    bot.action('feed_browse', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        } catch (_) {}
        await showFeedBrowseMenu(ctx);
    });

    bot.action('feed_all', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        } catch (_) {}
        await showNewChaptersFeed(ctx, 'all');
    });

    bot.action('feed_mine', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        } catch (_) {}
        await showNewChaptersFeed(ctx, 'mine');
    });

    for (const mode of Object.keys(NOTIFY_MODES)) {
        bot.action(`feed_notif_${mode}`, async (ctx) => {
            await setChapterNotifyMode(ctx, mode);
        });
    }

    bot.action(/catalog_page_(\d+)/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        try {
            await ctx.answerCbQuery();
            await ctx.deleteMessage(ctx.update.callback_query.message.message_id);
        } catch (e) {}
        const { showCatalog } = require('../commands/catalog');
        await showCatalog(ctx, page);
    });

    bot.action(/read_feed_chapter_(.+)/, async (ctx) => {
        await readFeedChapter(ctx, ctx.match[1]);
    });

    bot.hears('📖 Мои тайтлы', async (ctx) => {
        try {
            const info = await getLinkedUser(ctx.from.id);
            if (!info.linked) {
                await ctx.reply(
                    'Привяжите аккаунт сайта, чтобы видеть закладки.\n\nСгенерируйте код в профиле и отправьте: /link КОД',
                    Markup.inlineKeyboard([
                        Markup.button.url('Профиль на сайте', `${SITE_URL}/profile?tab=settings&section=telegram`),
                    ]),
                );
                return;
            }

            const bookmarks = await getBookmarks(ctx.from.id);
            const reading = (bookmarks || []).filter(
                (b) => b.category === 'reading' || b.category === 'favorites',
            );

            if (reading.length === 0) {
                await ctx.reply('В закладках «Читаю» и «Избранное» пока нет тайтлов.');
                return;
            }

            const buttons = reading.slice(0, 10).map((b) => {
                const name = b.title?.name || 'Тайтл';
                return [Markup.button.callback(name.slice(0, 40), `view_title_${b.titleId}`)];
            });

            await ctx.reply(`📖 *Мои тайтлы* (${info.username})\n\nВыберите тайтл:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons },
            });
        } catch (error) {
            console.error('showMyTitles error:', error);
            await ctx.reply('Не удалось загрузить закладки. Попробуйте позже.');
        }
    });

    bot.action(/pdf_feed_chapter_(.+)/, async (ctx) => {
        const chapterId = ctx.match[1];
        try {
            await ctx.answerCbQuery();
        } catch (_) {}
        const { prepareChapterForReadingFromFeed } = require('../../utils/pdf');
        await prepareChapterForReadingFromFeed(ctx, chapterId);
    });

    bot.action(/pdf_feed_retry_(.+)/, async (ctx) => {
        const chapterId = ctx.match[1];
        try {
            await ctx.answerCbQuery({ text: 'Повторяю…' });
        } catch (_) {}
        const { prepareChapterForReadingFromFeed } = require('../../utils/pdf');
        await prepareChapterForReadingFromFeed(ctx, chapterId, { forceRecreate: false });
    });
}

module.exports = {
    setupNavigationHandlers,
    showFeedMenu,
    showNewChaptersFeed,
    readFeedChapter,
};