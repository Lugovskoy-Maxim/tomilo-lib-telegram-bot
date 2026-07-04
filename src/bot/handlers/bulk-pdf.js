/**
 * Пакетная загрузка PDF глав (диапазон «с — по»).
 */
const { Markup } = require('telegraf');
const {
    getTitle,
    getChapterCount,
    getAllChapters,
    getChapterForUser,
    getBaseURL,
    getLinkedUser,
} = require('../../services/api');
const { deliverChapterPdf, checkPremiumAccess } = require('../../utils/pdf');
const { KEYBOARD_BUTTONS } = require('../keyboards/main');

const MAX_BULK_CHAPTERS = 40;
const CHAPTER_DELAY_MS = 800;

/** @type {Map<number, { stopped: boolean }>} */
const activeJobs = new Map();

function chapterNum(ch) {
    return ch.chapterNumber ?? ch.number ?? ch.chapter ?? '?';
}

function parseChapterRange(text) {
    const t = String(text || '').trim().replace(/\s+/g, '');
    const range = t.match(/^(\d+(?:\.\d+)?)[\-–—](\d+(?:\.\d+)?)$/);
    if (range) {
        return { from: parseFloat(range[1]), to: parseFloat(range[2]) };
    }
    const single = t.match(/^(\d+(?:\.\d+)?)$/);
    if (single) {
        const n = parseFloat(single[1]);
        return { from: n, to: n };
    }
    return null;
}

function resolveChapterIndices(allChapters, fromNum, toNum) {
    if (fromNum > toNum) {
        return { error: 'Начало диапазона больше конца. Пример: 1-10' };
    }
    const indices = [];
    for (let i = 0; i < allChapters.length; i++) {
        const num = parseFloat(chapterNum(allChapters[i]));
        if (!Number.isNaN(num) && num >= fromNum && num <= toNum) {
            indices.push(i);
        }
    }
    if (!indices.length) {
        return { error: `Главы ${fromNum}–${toNum} не найдены в этом тайтле.` };
    }
    if (indices.length > MAX_BULK_CHAPTERS) {
        return {
            error: `Слишком много глав (${indices.length}). Максимум за раз: ${MAX_BULK_CHAPTERS}. Уменьшите диапазон.`,
        };
    }
    return { indices, fromNum, toNum };
}

function isJobStopped(chatId) {
    return activeJobs.get(chatId)?.stopped === true;
}

function requestStop(chatId) {
    const job = activeJobs.get(chatId);
    if (job) job.stopped = true;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function promptBulkRange(ctx, titleId) {
    if (!(await checkPremiumAccess(ctx))) return;

    const [title, totalChapters] = await Promise.all([
        getTitle(titleId).catch(() => ({})),
        getChapterCount(titleId),
    ]);

    if (!totalChapters) {
        await ctx.reply('Главы не найдены.');
        return;
    }

    const allChapters = await getAllChapters(titleId, totalChapters, 'asc');
    const first = chapterNum(allChapters[0]);
    const last = chapterNum(allChapters[allChapters.length - 1]);
    const titleName = title?.name || title?.title || 'Тайтл';

    ctx.session = ctx.session || {};
    ctx.session.bulkPdfAwaiting = { titleId, titleName };

    const lastN = parseFloat(last);
    const firstN = parseFloat(first);
    const quickRows = [];
    const presets = [
        [1, 10],
        [11, 25],
        [26, 50],
    ]
        .map(([a, b]) => [a, Math.min(b, Number.isNaN(lastN) ? b : lastN)])
        .filter(([a, b]) => !Number.isNaN(lastN) && a <= lastN && b >= a && (!Number.isNaN(firstN) ? b >= firstN : true));

    for (const [a, b] of presets) {
        quickRows.push([
            Markup.button.callback(`${a}–${b}`, `bulk_pdf_quick_${titleId}_${a}_${b}`),
        ]);
    }

    await ctx.reply(
        `📥 *Скачать несколько глав*\n\n` +
            `📚 ${titleName}\n` +
            `Доступны главы: *${first}* — *${last}* (всего ${allChapters.length})\n\n` +
            `Отправьте диапазон сообщением, например:\n` +
            `\`1-10\` или \`5\`\n\n` +
            `Максимум ${MAX_BULK_CHAPTERS} глав за раз. Уже отправленные PDF берутся из кэша Telegram.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                ...quickRows,
                [Markup.button.callback('❌ Отмена', 'bulk_pdf_cancel')],
            ]),
        },
    );
}

async function confirmBulkRange(ctx, titleId, fromNum, toNum) {
    const totalChapters = await getChapterCount(titleId);
    const allChapters = await getAllChapters(titleId, totalChapters, 'asc');
    const resolved = resolveChapterIndices(allChapters, fromNum, toNum);

    if (resolved.error) {
        await ctx.reply(`❌ ${resolved.error}`);
        return;
    }

    const title = await getTitle(titleId).catch(() => ({}));
    const titleName = title?.name || title?.title || 'Тайтл';

    ctx.session = ctx.session || {};
    ctx.session.bulkPdfPending = {
        titleId,
        titleName,
        fromNum: resolved.fromNum,
        toNum: resolved.toNum,
        indices: resolved.indices,
    };
    delete ctx.session.bulkPdfAwaiting;

    await ctx.reply(
        `📥 Подтвердите загрузку\n\n` +
            `📚 ${titleName}\n` +
            `Главы: *${resolved.fromNum}* — *${resolved.toNum}* (${resolved.indices.length} шт.)\n\n` +
            `Бот отправит PDF по одной главе. Можно остановить в любой момент.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('▶️ Начать загрузку', `bulk_pdf_run_${titleId}`)],
                [Markup.button.callback('❌ Отмена', 'bulk_pdf_cancel')],
            ]),
        },
    );
}

async function runBulkPdfJob(ctx, titleId, jobOptions = {}) {
    const pending = jobOptions.indices
        ? {
              titleId,
              indices: jobOptions.indices,
              fromNum: jobOptions.fromNum,
              toNum: jobOptions.toNum,
              titleName: jobOptions.titleName,
          }
        : ctx.session?.bulkPdfPending;

    if (!pending || pending.titleId !== titleId || !pending.indices?.length) {
        await ctx.reply('Сессия истекла. Начните заново: откройте тайтл → «Скачать несколько глав».');
        return;
    }

    if (!(await checkPremiumAccess(ctx))) return;

    const chatId = ctx.chat.id;
    if (activeJobs.has(chatId)) {
        await ctx.reply('Уже идёт загрузка. Нажмите «⏹ Стоп» или дождитесь завершения.');
        return;
    }

    activeJobs.set(chatId, { stopped: false });
    delete ctx.session.bulkPdfPending;
    delete ctx.session.bulkPdfRetry;

    const { indices, fromNum, toNum, titleName } = pending;
    const isRetry = !!jobOptions.isRetry;
    const totalChapters = await getChapterCount(titleId);
    const allChapters = await getAllChapters(titleId, totalChapters, 'asc');
    const title = await getTitle(titleId);
    const baseURL = getBaseURL();
    const titleSlug = title.slug || titleId;

    const statusMsg = await ctx.reply(
        `${isRetry ? '🔄 Повтор' : '📥 Загрузка'}: *${titleName}*\n` +
            `Главы ${fromNum}–${toNum}\n` +
            `⏳ Подготовка… (0/${indices.length})`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⏹ Стоп', 'bulk_pdf_stop')]]),
        },
    );

    let sent = 0;
    let cached = 0;
    let failed = 0;
    let skipped = 0;
    const failedIndices = [];

    for (let step = 0; step < indices.length; step++) {
        if (isJobStopped(chatId)) {
            skipped = indices.length - step;
            break;
        }

        const chapterIndex = indices[step];
        const summary = allChapters[chapterIndex];
        const chapterId = summary._id ?? summary.id;
        const chapterNumLabel = chapterNum(summary);

        try {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                null,
                `📥 *${titleName}*\n` +
                    `Глава ${chapterNumLabel} (${step + 1}/${indices.length})\n` +
                    `✅ ${sent} · 📦 из кэша ${cached} · ❌ ${failed}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '⏹ Стоп', callback_data: 'bulk_pdf_stop' }]],
                    },
                },
            );
        } catch (_) {}

        let chapter;
        try {
            chapter = await getChapterForUser(ctx.from.id, chapterId);
        } catch (error) {
            const apiMsg = error.response?.data?.message || error.message;
            failed += 1;
            failedIndices.push(chapterIndex);
            console.warn(`[BULK-PDF] Доступ к главе ${chapterId}:`, apiMsg);
            continue;
        }

        if (!(chapter.pages || []).length) {
            failed += 1;
            failedIndices.push(chapterIndex);
            continue;
        }

        const chapterUrl = `${baseURL}/titles/${titleSlug}/chapter/${chapterId}`;
        const result = await deliverChapterPdf(ctx, {
            titleId,
            chapterIndex,
            allChapters,
            title,
            chapter,
            chapterUrl,
            bulkMode: true,
            forceRecreate: false,
        });

        if (result.ok) {
            if (result.fromCache) cached += 1;
            else sent += 1;
        } else {
            failed += 1;
            failedIndices.push(chapterIndex);
        }

        if (step < indices.length - 1 && !isJobStopped(chatId)) {
            await sleep(CHAPTER_DELAY_MS);
        }
    }

    activeJobs.delete(chatId);

    const stopped = skipped > 0;
    let summary =
        (stopped ? '⏹ *Загрузка остановлена*\n\n' : '✅ *Загрузка завершена*\n\n') +
        `📚 ${titleName}\n` +
        `Главы ${fromNum}–${toNum}\n\n` +
        `📤 Отправлено новых: ${sent}\n` +
        `📦 Из кэша Telegram: ${cached}\n`;
    if (failed) summary += `❌ Ошибок: ${failed}\n`;
    if (skipped) summary += `⏭ Пропущено: ${skipped}\n`;

    const replyMarkup = { parse_mode: 'Markdown' };
    if (failedIndices.length > 0) {
        ctx.session = ctx.session || {};
        ctx.session.bulkPdfRetry = {
            titleId,
            indices: failedIndices,
            fromNum,
            toNum,
            titleName,
        };
        replyMarkup.reply_markup = {
            inline_keyboard: [[
                Markup.button.callback(
                    `🔄 Повторить ошибочные (${failedIndices.length})`,
                    `bulk_pdf_retry_${titleId}`,
                ),
            ]],
        };
    }

    try {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            null,
            summary,
            replyMarkup,
        );
    } catch (_) {
        await ctx.reply(summary, replyMarkup);
    }
}

function setupBulkPdfHandlers(bot) {
    bot.action(/bulk_pdf_start_(.+)/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        } catch (_) {}
        await promptBulkRange(ctx, ctx.match[1]);
    });

    bot.action(/bulk_pdf_quick_(.+)_(\d+(?:\.\d+)?)_(\d+(?:\.\d+)?)/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        } catch (_) {}
        const fromNum = parseFloat(ctx.match[2]);
        const toNum = parseFloat(ctx.match[3]);
        await confirmBulkRange(ctx, ctx.match[1], fromNum, toNum);
    });

    bot.action(/bulk_pdf_run_(.+)/, async (ctx) => {
        try {
            await ctx.answerCbQuery({ text: 'Запускаю загрузку…' });
        } catch (_) {}
        runBulkPdfJob(ctx, ctx.match[1]).catch((err) => {
            console.error('[BULK-PDF] Ошибка:', err);
            activeJobs.delete(ctx.chat?.id);
        });
    });

    bot.action('bulk_pdf_stop', async (ctx) => {
        requestStop(ctx.chat.id);
        try {
            await ctx.answerCbQuery({ text: 'Останавливаю после текущей главы…' });
        } catch (_) {}
    });

    bot.action(/bulk_pdf_retry_(.+)/, async (ctx) => {
        const titleId = ctx.match[1];
        const retry = ctx.session?.bulkPdfRetry;
        if (!retry || retry.titleId !== titleId) {
            try {
                await ctx.answerCbQuery({ text: 'Нет глав для повтора' });
            } catch (_) {}
            await ctx.reply('Нет сохранённых ошибочных глав. Запустите загрузку заново.');
            return;
        }
        try {
            await ctx.answerCbQuery({ text: 'Повторяю…' });
        } catch (_) {}
        runBulkPdfJob(ctx, titleId, {
            indices: retry.indices,
            fromNum: retry.fromNum,
            toNum: retry.toNum,
            titleName: retry.titleName,
            isRetry: true,
        }).catch((err) => {
            console.error('[BULK-PDF] Ошибка повтора:', err);
            activeJobs.delete(ctx.chat?.id);
        });
    });

    bot.action('bulk_pdf_cancel', async (ctx) => {
        if (ctx.session) {
            delete ctx.session.bulkPdfAwaiting;
            delete ctx.session.bulkPdfPending;
        }
        try {
            await ctx.answerCbQuery({ text: 'Отменено' });
        } catch (_) {}
        await ctx.reply('Загрузка отменена.');
    });

    bot.on('text', async (ctx, next) => {
        const awaiting = ctx.session?.bulkPdfAwaiting;
        if (!awaiting?.titleId) return next();

        const text = ctx.message?.text?.trim();
        if (!text || text.startsWith('/') || KEYBOARD_BUTTONS.includes(text)) {
            return next();
        }

        const range = parseChapterRange(text);
        if (!range) {
            await ctx.reply('Не понял диапазон. Пример: `1-10` или `5`', { parse_mode: 'Markdown' });
            return;
        }

        await confirmBulkRange(ctx, awaiting.titleId, range.from, range.to);
    });
}

module.exports = {
    setupBulkPdfHandlers,
    promptBulkRange,
};