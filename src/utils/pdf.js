/**
 * Утилиты для работы с PDF
 */
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const { getBaseURL, getChapter, getTitle, getAllChapters, getChapterCount } = require('../services/api');
const { validateAndFixImage, hasSOIMarker, fixJPEG, downloadImage, formatDate, formatFileSize } = require('./helpers');

/**
 * Создать временную директорию
 */
async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

/**
 * Удалить временные файлы
 */
async function cleanupTempFiles(tempDir, pdfPath) {
    if (tempDir) {
        try {
            const files = await fs.readdir(tempDir);
            for (const file of files) {
                await fs.unlink(path.join(tempDir, file));
            }
            await fs.rmdir(tempDir);
        } catch (error) {}
    }
    if (pdfPath) {
        try {
            await fs.access(pdfPath);
            await fs.unlink(pdfPath);
        } catch (error) {}
    }
}

/**
 * Создать и отправить PDF
 */
async function createAndSendPDF(ctx, titleId, chapterIndex, chapter, title, chapterUrl, statusMessage, allChapters) {
    let pdfPath = null;
    let successImages = 0;
    let tempDir = null;

    try {
        tempDir = path.join(__dirname, `temp_${chapter._id}`);
        await ensureDir(tempDir);

        const images = chapter.pages || [];
        const imagePaths = [];
        const baseURL = getBaseURL();

        let lastStatusText = '';

        // Скачиваем и обрабатываем изображения
        for (let i = 0; i < images.length; i++) {
            const imageUrl = images[i];

            try {
                const newStatusText = `📖 Глава ${chapter.number || chapter.chapterNumber || 'N/A'} формируется...\nЗагружено изображений: ${successImages}/${images.length}`;

                if ((i % 5 === 0 || i === images.length - 1) && newStatusText !== lastStatusText) {
                    try {
                        await ctx.telegram.editMessageText(ctx.chat.id, statusMessage.message_id, null, newStatusText);
                        lastStatusText = newStatusText;
                    } catch (editError) {
                        if (!editError.message.includes('message is not modified')) {
                            console.error('Ошибка обновления статуса:', editError.message);
                        }
                    }
                }

                let imageBytes = await downloadImage(imageUrl, baseURL);
                let validatedImage = await validateAndFixImage(imageBytes);

                if (!validatedImage) {
                    console.error(`Failed to validate image ${i + 1}`);
                    continue;
                }

                if (validatedImage.type === 'jpeg' && !hasSOIMarker(validatedImage.buffer)) {
                    console.log(`Invalid JPEG detected for image ${i + 1}, attempting to fix...`);
                    validatedImage.buffer = await fixJPEG(validatedImage.buffer);
                }

                const imagePath = path.join(tempDir, `${title.name}_image_${i}.${validatedImage.type}`);
                await fs.writeFile(imagePath, validatedImage.buffer);
                imagePaths.push(imagePath);
                successImages++;
            } catch (error) {
                console.error(`Error processing image ${i + 1}:`, error.message);
            }
        }

        if (successImages === 0) {
            await ctx.telegram.editMessageText(ctx.chat.id, statusMessage.message_id, null, '❌ Не удалось загрузить изображения для PDF.');
            await ctx.reply('Не удалось создать PDF. Вы можете прочитать главу на сайте:', {
                reply_markup: {
                    inline_keyboard: [[{ text: '📖 Читать на сайте TOMILO-LIB.RU', url: chapterUrl }]]
                }
            });
            return;
        }

        // Создаем PDF
        const pdfDoc = await PDFDocument.create();

        for (let i = 0; i < imagePaths.length; i++) {
            try {
                const imagePath = imagePaths[i];
                const imageBytes = await fs.readFile(imagePath);
                const imageExt = path.extname(imagePath).toLowerCase();
                let imageEmbed;

                if (imageExt === '.png') {
                    imageEmbed = await pdfDoc.embedPng(imageBytes);
                } else if (imageExt === '.jpg' || imageExt === '.jpeg') {
                    imageEmbed = await pdfDoc.embedJpg(imageBytes);
                } else {
                    try {
                        imageEmbed = await pdfDoc.embedPng(imageBytes);
                    } catch (e) {
                        try {
                            imageEmbed = await pdfDoc.embedJpg(imageBytes);
                        } catch (e2) {
                            continue;
                        }
                    }
                }

                const pdfPage = pdfDoc.addPage([imageEmbed.width, imageEmbed.height]);
                pdfPage.drawImage(imageEmbed, { x: 0, y: 0, width: imageEmbed.width, height: imageEmbed.height });
            } catch (error) {
                console.error(`Error embedding image ${i + 1}:`, error.message);
            }
        }

        pdfPath = path.join(__dirname, `${title.name}_chapter_${chapter._id}.pdf`);
        const pdfBytes = await pdfDoc.save();
        await fs.writeFile(pdfPath, pdfBytes);

        // Обновляем статус с информацией о размере
        const sizeText = formatFileSize(pdfBytes.length);
        await ctx.telegram.editMessageText(ctx.chat.id, statusMessage.message_id, null, `✅ PDF создан успешно!\n📊 Размер: ${sizeText}\n📝 Отправка может занять несколько минут...`);

        // Формируем навигационные кнопки
        const navigationButtons = [];
        if (chapterIndex > 0) {
            navigationButtons.push({ text: '⬅️ Предыдущая', callback_data: `select_chapter_${titleId}_${chapterIndex - 1}` });
        }
        if (chapterIndex < allChapters.length - 1) {
            navigationButtons.push({ text: '➡️ Следующая', callback_data: `select_chapter_${titleId}_${chapterIndex + 1}` });
        }

        const createdDate = formatDate(chapter.createdAt);
        const caption = `📚 *${title.name}*\n📖 Глава ${chapter.number || chapter.chapterNumber || 'N/A'}\n📅 ${createdDate}\n✅ Изображений: ${successImages}/${images.length}\n\n[🌐 Читать на сайте](${chapterUrl})`;

        await ctx.replyWithDocument(
            { source: pdfPath, filename: `${title.name}_глава_${chapter.number || chapter.chapterNumber || 'N/A'}.pdf` },
            {
                caption: caption,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [navigationButtons] }
            }
        );

        await ctx.deleteMessage(statusMessage.message_id);
    } catch (error) {
        console.error('Ошибка при создании PDF:', error);
        if (statusMessage) {
            try {
                await ctx.telegram.editMessageText(ctx.chat.id, statusMessage.message_id, null, `❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`);
            } catch (editError) {}
        }
        if (chapterUrl) {
            await ctx.reply('Произошла ошибка при создании PDF. Вы можете прочитать главу на сайте:', {
                reply_markup: {
                    inline_keyboard: [[{ text: '📖 Читать на сайте', url: chapterUrl }]]
                }
            });
        } else {
            await ctx.reply('Произошла ошибка при создании PDF. Попробуйте позже.');
        }
    } finally {
        await cleanupTempFiles(tempDir, pdfPath);
    }
}

/**
 * Подготовить главу для чтения
 */
async function prepareChapterForReading(ctx, titleId, chapterIndex) {
    let statusMessage = null;
    let chapter = null;
    let title = null;
    let chapterUrl = null;

    try {
        await ctx.answerCbQuery();

        const totalChapters = await getChapterCount(titleId);
        if (totalChapters === 0) {
            await ctx.reply('Главы не найдены.');
            return;
        }

        const allChapters = await getAllChapters(titleId, totalChapters);
        if (!allChapters || allChapters.length === 0 || chapterIndex >= allChapters.length) {
            await ctx.reply('Глава не найдена.');
            return;
        }

        const chapterSummary = allChapters[chapterIndex];
        chapter = await getChapter(chapterSummary._id);
        title = await getTitle(titleId);

        const baseURL = getBaseURL();
        const titleSlug = title.slug || titleId;
        chapterUrl = `${baseURL}/titles/${titleSlug}/chapter/${chapter._id}`;

        const images = chapter.pages || [];
        if (!images || images.length === 0) {
            await ctx.reply('Изображения главы не найдены.');
            return;
        }

        statusMessage = await ctx.reply(`📖 Глава ${chapter.number || chapter.chapterNumber || 'N/A'} формируется...\nЗагружено изображений: 0/${images.length}`);

        createAndSendPDF(ctx, titleId, chapterIndex, chapter, title, chapterUrl, statusMessage, allChapters).catch(console.error);
    } catch (error) {
        console.error('Ошибка при выборе главы:', error);
        if (statusMessage) {
            try {
                await ctx.telegram.editMessageText(ctx.chat.id, statusMessage.message_id, null, `❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`);
            } catch (e) {}
        }
        if (chapterUrl) {
            await ctx.reply('Произошла ошибка. Вы можете прочитать главу на сайте:', {
                reply_markup: {
                    inline_keyboard: [[{ text: '📖 Читать на сайте', url: chapterUrl }]]
                }
            });
        } else {
            await ctx.reply('Произошла ошибка при создании PDF. Попробуйте позже.');
        }
    }
}

module.exports = {
    createAndSendPDF,
    prepareChapterForReading,
    ensureDir,
    cleanupTempFiles
};

