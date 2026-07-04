/**
 * PDF без записи на диск: сборка в памяти, кэш через Telegram file_id.
 */
const { PDFDocument } = require('pdf-lib');
const {
    getBaseURL,
    getTitle,
    getAllChapters,
    getChapterCount,
    getLinkedUser,
    getChapterForUser,
} = require('../services/api');
const { SITE_URL } = require('../config');
const { getPdfEntry, setPdfEntry, deletePdfEntry, withPdfLock } = require('../db/pdf-cache');
const {
    validateAndFixImage,
    hasSOIMarker,
    fixJPEG,
    downloadImage,
    formatDate,
    formatFileSize,
} = require('./helpers');

function chapterIdOf(chapter) {
    return String(chapter._id ?? chapter.id ?? '');
}

function chapterNumberOf(chapter) {
    return chapter.number ?? chapter.chapterNumber ?? 'N/A';
}

function buildPdfCaption(entry, chapterUrl) {
    const url = entry.chapterUrl || chapterUrl || '';
    let text = `📚 *${entry.titleName}*\n`;
    text += `📖 Глава ${entry.chapterNumber}\n`;
    if (entry.createdDate) text += `📅 ${entry.createdDate}\n`;
    if (entry.totalImages) {
        text += `✅ Изображений: ${entry.successImages}/${entry.totalImages}\n`;
    }
    if (entry.fromCache) {
        text += '📦 Из кэша (без повторной генерации)\n';
    }
    if (url) text += `\n[🌐 Читать на сайте](${url})`;
    return text;
}

function buildPdfKeyboard(titleId, chapterIndex, allChapters, chapter, chapterUrl) {
    const navigationButtons = [];
    if (chapterIndex > 0) {
        navigationButtons.push({
            text: '⬅️ Предыдущая',
            callback_data: `select_chapter_${titleId}_${chapterIndex - 1}`,
        });
    }
    if (chapterIndex < allChapters.length - 1) {
        navigationButtons.push({
            text: '➡️ Следующая',
            callback_data: `select_chapter_${titleId}_${chapterIndex + 1}`,
        });
    }

    const teletypeUrl = chapter?.teletypeUrl || chapter?.instantViewUrl;
    const linkButtons = [{ text: '🌐 Читать на сайте', url: chapterUrl }];
    if (teletypeUrl) {
        linkButtons.push({ text: '📱 Открыть в Telegram (Teletype)', url: teletypeUrl });
    }

    const rows = [];
    if (navigationButtons.length) rows.push(navigationButtons);
    rows.push(linkButtons);
    rows.push([{ text: '🔄 Пересоздать PDF', callback_data: `pdf_recreate_${titleId}_${chapterIndex}` }]);
    return { inline_keyboard: rows };
}

async function sendCachedPdf(ctx, entry, options) {
    const { titleId, chapterIndex, allChapters, chapter, chapterUrl, statusMessage } = options;
    const caption = buildPdfCaption({ ...entry, fromCache: true }, chapterUrl);
    const replyMarkup = buildPdfKeyboard(titleId, chapterIndex, allChapters, chapter, chapterUrl);

    try {
        await ctx.replyWithDocument(entry.fileId, {
            caption,
            parse_mode: 'Markdown',
            reply_markup: replyMarkup,
        });
        if (statusMessage) {
            try {
                await ctx.deleteMessage(statusMessage.message_id);
            } catch (_) {}
        }
        return true;
    } catch (error) {
        console.warn(`[PDF] Кэш file_id недействителен для ${entry.fileId}:`, error.message);
        return false;
    }
}

async function buildPdfBytes(chapter, title, baseURL, onProgress) {
    const images = chapter.pages || [];
    const imageBuffers = [];

    for (let i = 0; i < images.length; i++) {
        if (onProgress) await onProgress(i, images.length, imageBuffers.length);

        try {
            const imageBytes = await downloadImage(images[i], baseURL);
            let validatedImage = await validateAndFixImage(imageBytes);
            if (!validatedImage) continue;

            if (validatedImage.type === 'jpeg' && !hasSOIMarker(validatedImage.buffer)) {
                validatedImage.buffer = await fixJPEG(validatedImage.buffer);
            }
            imageBuffers.push(validatedImage);
        } catch (error) {
            console.error(`[PDF] Ошибка изображения ${i + 1}:`, error.message);
        }
    }

    if (!imageBuffers.length) {
        return { pdfBytes: null, successImages: 0, totalImages: images.length };
    }

    const pdfDoc = await PDFDocument.create();
    for (const validated of imageBuffers) {
        try {
            let imageEmbed;
            if (validated.type === 'png') {
                imageEmbed = await pdfDoc.embedPng(validated.buffer);
            } else {
                imageEmbed = await pdfDoc.embedJpg(validated.buffer);
            }
            const pdfPage = pdfDoc.addPage([imageEmbed.width, imageEmbed.height]);
            pdfPage.drawImage(imageEmbed, {
                x: 0,
                y: 0,
                width: imageEmbed.width,
                height: imageEmbed.height,
            });
        } catch (error) {
            console.error('[PDF] Ошибка встраивания страницы:', error.message);
        }
    }

    const pdfBytes = await pdfDoc.save();
    return { pdfBytes, successImages: imageBuffers.length, totalImages: images.length };
}

/**
 * Создать и отправить PDF (в памяти, с кэшем file_id)
 */
async function createAndSendPDF(ctx, titleId, chapterIndex, chapter, title, chapterUrl, statusMessage, allChapters, options = {}) {
    const { forceRecreate = false } = options;
    const cid = chapterIdOf(chapter);
    const baseURL = getBaseURL();
    const chapterNum = chapterNumberOf(chapter);
    const filename = `${title.name}_глава_${chapterNum}.pdf`;

    const sendFresh = async () => {
        let lastStatusText = '';
        const { pdfBytes, successImages, totalImages } = await buildPdfBytes(
            chapter,
            title,
            baseURL,
            async (i, total, success) => {
                const newStatusText = `📖 Глава ${chapterNum} формируется...\nЗагружено изображений: ${success}/${total}`;
                if ((i % 5 === 0 || i === total - 1) && newStatusText !== lastStatusText && statusMessage) {
                    try {
                        await ctx.telegram.editMessageText(
                            ctx.chat.id,
                            statusMessage.message_id,
                            null,
                            newStatusText,
                        );
                        lastStatusText = newStatusText;
                    } catch (editError) {
                        if (!editError.message?.includes('message is not modified')) {
                            console.error('[PDF] Ошибка статуса:', editError.message);
                        }
                    }
                }
            },
        );

        if (!pdfBytes || successImages === 0) {
            if (statusMessage) {
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    statusMessage.message_id,
                    null,
                    '❌ Не удалось загрузить изображения для PDF.',
                );
            }
            await ctx.reply('Не удалось создать PDF. Вы можете прочитать главу на сайте:', {
                reply_markup: {
                    inline_keyboard: [[{ text: '📖 Читать на сайте', url: chapterUrl }]],
                },
            });
            return;
        }

        const sizeText = formatFileSize(pdfBytes.length);
        if (statusMessage) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMessage.message_id,
                null,
                `✅ PDF создан!\n📊 Размер: ${sizeText}\n📝 Отправка...`,
            );
        }

        const meta = {
            titleName: title.name,
            chapterNumber: chapterNum,
            createdDate: formatDate(chapter.createdAt),
            successImages,
            totalImages,
            chapterUrl,
            filename,
        };

        const sentMessage = await ctx.replyWithDocument(
            { source: Buffer.from(pdfBytes), filename },
            {
                caption: buildPdfCaption(meta, chapterUrl),
                parse_mode: 'Markdown',
                reply_markup: buildPdfKeyboard(titleId, chapterIndex, allChapters, chapter, chapterUrl),
            },
        );

        const fileId = sentMessage?.document?.file_id;
        if (fileId) {
            setPdfEntry(cid, { fileId, ...meta });
        }

        if (statusMessage) {
            try {
                await ctx.deleteMessage(statusMessage.message_id);
            } catch (_) {}
        }
    };

    try {
        if (!forceRecreate) {
            const cached = getPdfEntry(cid);
            if (cached) {
                const ok = await sendCachedPdf(ctx, cached, {
                    titleId,
                    chapterIndex,
                    allChapters,
                    chapter,
                    chapterUrl,
                    statusMessage,
                });
                if (ok) return;
                deletePdfEntry(cid);
            }
        } else {
            deletePdfEntry(cid);
        }

        await withPdfLock(cid, async () => {
            if (!forceRecreate) {
                const cachedAgain = getPdfEntry(cid);
                if (cachedAgain) {
                    const ok = await sendCachedPdf(ctx, cachedAgain, {
                        titleId,
                        chapterIndex,
                        allChapters,
                        chapter,
                        chapterUrl,
                        statusMessage,
                    });
                    if (ok) return;
                    deletePdfEntry(cid);
                }
            }
            await sendFresh();
        });
    } catch (error) {
        console.error('[PDF] Ошибка при создании PDF:', error);
        if (statusMessage) {
            try {
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    statusMessage.message_id,
                    null,
                    `❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`,
                );
            } catch (_) {}
        }
        if (chapterUrl) {
            await ctx.reply('Произошла ошибка при создании PDF. Вы можете прочитать главу на сайте:', {
                reply_markup: {
                    inline_keyboard: [[{ text: '📖 Читать на сайте', url: chapterUrl }]],
                },
            });
        } else {
            await ctx.reply('Произошла ошибка при создании PDF. Попробуйте позже.');
        }
    }
}

async function checkPremiumAccess(ctx) {
    const linkedInfo = await getLinkedUser(ctx.from.id);
    if (!linkedInfo.linked) {
        await ctx.reply(
            'Для скачивания PDF привяжите аккаунт сайта.\n\nСгенерируйте код в профиле и отправьте: /link КОД',
        );
        return false;
    }
    if (!linkedInfo.isPremium) {
        await ctx.reply(
            `PDF глав доступен только премиум-подписчикам.\n\nОформите подписку на сайте: ${SITE_URL}/premium`,
        );
        return false;
    }
    return true;
}

async function prepareChapterForReading(ctx, titleId, chapterIndex, options = {}) {
    let statusMessage = null;
    let chapterUrl = null;

    try {
        try {
            await ctx.answerCbQuery();
        } catch (_) {}

        if (!(await checkPremiumAccess(ctx))) {
            return;
        }

        const totalChapters = await getChapterCount(titleId);
        if (totalChapters === 0) {
            await ctx.reply('Главы не найдены.');
            return;
        }

        const allChapters = await getAllChapters(titleId, totalChapters);
        if (!allChapters?.length || chapterIndex >= allChapters.length) {
            await ctx.reply('Глава не найдена.');
            return;
        }

        const chapterSummary = allChapters[chapterIndex];
        const chapterId = chapterSummary._id ?? chapterSummary.id;
        const cid = String(chapterId);

        if (!options.forceRecreate) {
            const cached = getPdfEntry(cid);
            if (cached) {
                const chapter = await getChapterForUser(ctx.from.id, chapterId).catch(() => ({}));
                const title = await getTitle(titleId);
                const baseURL = getBaseURL();
                const titleSlug = title.slug || titleId;
                chapterUrl = `${baseURL}/titles/${titleSlug}/chapter/${chapterId}`;
                const ok = await sendCachedPdf(ctx, cached, {
                    titleId,
                    chapterIndex,
                    allChapters,
                    chapter,
                    chapterUrl,
                    statusMessage: null,
                });
                if (ok) return;
                deletePdfEntry(cid);
            }
        }

        const chapter = await getChapterForUser(ctx.from.id, chapterId);
        const title = await getTitle(titleId);
        const baseURL = getBaseURL();
        const titleSlug = title.slug || titleId;
        chapterUrl = `${baseURL}/titles/${titleSlug}/chapter/${chapterId}`;

        const images = chapter.pages || [];
        if (!images.length) {
            await ctx.reply('Изображения главы не найдены.');
            return;
        }

        const statusText = options.forceRecreate
            ? `🔄 Пересоздаю PDF главы ${chapterNumberOf(chapter)}...`
            : `📖 Глава ${chapterNumberOf(chapter)} формируется...\nЗагружено изображений: 0/${images.length}`;

        statusMessage = await ctx.reply(statusText);

        createAndSendPDF(
            ctx,
            titleId,
            chapterIndex,
            chapter,
            title,
            chapterUrl,
            statusMessage,
            allChapters,
            options,
        ).catch(console.error);
    } catch (error) {
        console.error('[PDF] Ошибка при выборе главы:', error);
        const apiMsg = error.response?.data?.message || error.response?.data?.errors?.[0];
        const errText = apiMsg || error.message || 'Неизвестная ошибка';
        if (statusMessage) {
            try {
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    statusMessage.message_id,
                    null,
                    `❌ Ошибка: ${errText}`,
                );
            } catch (_) {}
        }
        if (chapterUrl) {
            await ctx.reply('Произошла ошибка. Вы можете прочитать главу на сайте:', {
                reply_markup: {
                    inline_keyboard: [[{ text: '📖 Читать на сайте', url: chapterUrl }]],
                },
            });
        } else {
            await ctx.reply(errText);
        }
    }
}

async function prepareChapterForReadingFromFeed(ctx, chapterId, options = {}) {
    try {
        if (!(await checkPremiumAccess(ctx))) {
            return;
        }

        const chapter = await getChapterForUser(ctx.from.id, chapterId);
        const titleId = chapter.titleId?._id || chapter.titleId;
        const title = await getTitle(titleId);
        const baseURL = getBaseURL();
        const titleSlug = title.slug || titleId;
        const chapterUrl = `${baseURL}/titles/${titleSlug}/chapter/${chapterId}`;

        const totalChapters = await getChapterCount(titleId);
        const allChapters = await getAllChapters(titleId, totalChapters);
        const chapterIndex = allChapters.findIndex((c) => String(c._id ?? c.id) === String(chapterId));
        const index = chapterIndex >= 0 ? chapterIndex : 0;

        await prepareChapterForReading(ctx, titleId, index, options);
    } catch (error) {
        console.error('[PDF] Ошибка при чтении главы из ленты:', error);
        const msg =
            error.response?.data?.message ||
            error.response?.data?.errors?.[0] ||
            'Произошла ошибка при создании PDF.';
        await ctx.reply(msg);
    }
}

module.exports = {
    createAndSendPDF,
    prepareChapterForReading,
    prepareChapterForReadingFromFeed,
};