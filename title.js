const { Markup } = require("telegraf");
const axios = require("axios");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs").promises;
const path = require("path");
const { API_BASE_URL } = require("./config");
const sharp = require("sharp");

// Функция для получения базового URL без /api для статических файлов
const getBaseURL = () => {
  return API_BASE_URL.replace("/api", "");
};

// Функция для отображения информации о тайтле
async function viewTitle(ctx, titleId, chapterPage = 1) {
  try {
    // Получаем информацию о тайтле
    const titleResponse = await axios.get(`${API_BASE_URL}/titles/${titleId}`, {
      timeout: 10000,
    });
    const title = titleResponse.data.data || titleResponse.data;

    // Получаем общее количество глав
    const countResponse = await axios.get(
      `${API_BASE_URL}/titles/${titleId}/chapters/count`,
      { timeout: 10000 },
    );
    const totalChapters =
      countResponse.data.data?.count || countResponse.data.count || 0;

    // Формируем URL тайтла на сайте
    const baseURL = getBaseURL();
    const titleSlug = title.slug || titleId;
    const titleUrl = `${baseURL}/titles/${titleSlug}`;

    // Формируем описание
    let description = title.description || "Нет описания";
    // Обрезаем слишком длинное описание
    if (description.length > 500) {
      description = description.substring(0, 500) + "...";
    }

    // Формируем подпись с информацией о тайтле
    let caption = `📚 *${title.name}*\n`;
    caption += `📅 Год: ${title.releaseYear || title.year || "N/A"}\n`;
    caption += `📖 Статус: ${title.status || "N/A"}\n`;
    caption += `📚 Глав: ${totalChapters || "N/A"}\n`;
    caption += `📝 ${description}\n\n`;
    caption += `[🌐 Читать на сайте](${titleUrl})`;

    // Проверяем, есть ли обложка у тайтла
    if (title.coverImage) {
      // Формируем полный URL для обложки
      let coverUrl;
      if (title.coverImage.startsWith("/uploads/")) {
        coverUrl = `${baseURL}${title.coverImage}`;
      } else if (title.coverImage.startsWith("/")) {
        coverUrl = `${baseURL}/uploads${title.coverImage}`;
      } else {
        coverUrl = `${baseURL}/uploads/${title.coverImage}`;
      }

      // Отправляем обложку с подписью
      await ctx.replyWithPhoto(coverUrl, {
        caption: caption,
        parse_mode: "Markdown",
      });
    } else {
      // Если обложки нет, отправляем обычное текстовое сообщение
      await ctx.reply(caption, { parse_mode: "Markdown" });
    }

    // Добавляем кнопки для чтения и закладок
    const buttonRows = [
      [
        Markup.button.callback("Читать", `read_title_${titleId}`),
        Markup.button.callback("🔖 В закладки", `bookmark_${titleId}`),
      ],
    ];

    // Отправляем сообщение с кнопками
    // Удаляем предыдущее сообщение, если оно существует
    if (ctx.session && ctx.session.lastMessageId) {
      try {
        await ctx.deleteMessage(ctx.session.lastMessageId);
      } catch (error) {
        // Игнорируем ошибку
      }
    }

    const message = await ctx.reply("Выберите главу:", {
      reply_markup: {
        inline_keyboard: buttonRows,
      },
    });

    // Сохраняем ID сообщения для последующего удаления
    ctx.session = ctx.session || {};
    ctx.session.lastMessageId = message.message_id;
  } catch (error) {
    // Ошибка получения информации о тайтле
    await ctx.reply(
      "Произошла ошибка при получении информации о тайтле. Попробуйте позже.",
    );
  }
}

// Функция для отображения глав тайтла
async function showChapters(ctx, titleId, page = 1) {
  try {
    // Сначала получаем общее количество глав
    const countResponse = await axios.get(
      `${API_BASE_URL}/titles/${titleId}/chapters/count`,
      { timeout: 10000 },
    );
    const totalChapters =
      countResponse.data.data?.count || countResponse.data.count || 0;

    if (totalChapters === 0) {
      await ctx.reply("Главы не найдены.");
      return;
    }

    // Получаем ВСЕ главы тайтла с большим лимитом
    const chaptersResponse = await axios.get(
      `${API_BASE_URL}/chapters/title/${titleId}?sort=number:desc&limit=${totalChapters}`,
      { timeout: 30000 },
    );
    const chaptersData = chaptersResponse.data.data || chaptersResponse.data;
    const allChapters = Array.isArray(chaptersData)
      ? chaptersData
      : chaptersData.chapters || [];

    if (!allChapters || allChapters.length === 0) {
      await ctx.reply("Главы не найдены.");
      return;
    }

    // Пагинация на стороне бота
    const limitPerPage = 50; // 50 глав на странице
    const totalPages = Math.ceil(allChapters.length / limitPerPage);
    
    // Получаем главы для текущей страницы
    const startIndex = (page - 1) * limitPerPage;
    const endIndex = startIndex + limitPerPage;
    const chapters = allChapters.slice(startIndex, endIndex);

    // Создаем кнопки для глав (5 в строке)
    const chapterButtons = chapters.map((chapter, index) =>
      Markup.button.callback(
        `${chapter.chapterNumber}`,
        `select_chapter_${titleId}_${startIndex + index}`,
      ),
    );

    // Разбиваем кнопки на группы по 5
    const buttonRows = [];
    for (let i = 0; i < chapterButtons.length; i += 5) {
      buttonRows.push(chapterButtons.slice(i, i + 5));
    }

    // Добавляем кнопки навигации, если больше одной страницы
    if (totalPages > 1) {
      const navigationButtons = [];

      if (page > 1) {
        navigationButtons.push(
          Markup.button.callback(
            "⬅️ Назад",
            `chapters_page_${titleId}_${page - 1}`,
          ),
        );
      }

      navigationButtons.push(
        Markup.button.callback(
          `${page}/${totalPages}`,
          `chapters_page_${titleId}_${page}`,
        ),
      );

      if (page < totalPages) {
        navigationButtons.push(
          Markup.button.callback(
            "➡️ Далее",
            `chapters_page_${titleId}_${page + 1}`,
          ),
        );
      }

      // Разбиваем навигационные кнопки на группы по 5
      const navigationRows = [];
      for (let i = 0; i < navigationButtons.length; i += 5) {
        navigationRows.push(navigationButtons.slice(i, i + 5));
      }
      buttonRows.push(...navigationRows);
    }

    // Удаляем предыдущее сообщение со списком глав, если оно существует
    ctx.session = ctx.session || {};
    if (ctx.session.chaptersMessageId) {
      try {
        await ctx.deleteMessage(ctx.session.chaptersMessageId);
      } catch (error) {
        // Игнорируем ошибку, если сообщение не найдено
      }
    }

    // Отправляем сообщение с кнопками
    const chaptersMessage = await ctx.reply(`Выберите главу (${allChapters.length} всего, стр. ${page}/${totalPages}):`, {
      reply_markup: {
        inline_keyboard: buttonRows,
      },
    });

    // Сохраняем ID сообщения для последующего удаления
    ctx.session.chaptersMessageId = chaptersMessage.message_id;
  } catch (error) {
    // Ошибка получения глав
    console.error("Ошибка при получении глав:", error.message);
    await ctx.reply("Произошла ошибка при получении глав. Попробуйте позже.");
  }
}

// Функция для проверки, является ли файл валидным изображением
async function validateAndFixImage(imageBytes, imageUrl) {
  try {
    // Проверяем первые байты для определения типа файла
    const buffer = Buffer.from(imageBytes);

    // Проверяем PNG сигнатуру
    if (
      buffer.length >= 8 &&
      buffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a"
    ) {
      return { type: "png", buffer: imageBytes };
    }

    // Проверяем JPEG сигнатуру
    if (buffer.length >= 2 && buffer.slice(0, 2).toString("hex") === "ffd8") {
      return { type: "jpeg", buffer: imageBytes };
    }

    // Проверяем WebP сигнатуру
    if (
      buffer.length >= 12 &&
      buffer.slice(0, 4).toString() === "RIFF" &&
      buffer.slice(8, 12).toString() === "WEBP"
    ) {
      return { type: "webp", buffer: imageBytes };
    }

    // Если тип не определен, пробуем конвертировать с помощью sharp
    try {
      const pngBuffer = await sharp(imageBytes).png().toBuffer();
      return { type: "png", buffer: pngBuffer };
    } catch (sharpError) {
      console.error("Sharp conversion failed:", sharpError.message);
      return null;
    }
  } catch (error) {
    console.error("Image validation error:", error.message);
    return null;
  }
}

// Функция для проверки наличия SOI маркера в JPEG файле
function hasSOIMarker(imageBuffer) {
  // SOI маркер - 0xFFD8
  return imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8;
}

// Функция для исправления поврежденных JPEG файлов
async function fixJPEG(imageBuffer) {
  try {
    // Конвертируем в PNG и обратно в JPEG
    const pngBuffer = await sharp(imageBuffer).png().toBuffer();
    const fixedJpegBuffer = await sharp(pngBuffer).jpeg().toBuffer();
    return fixedJpegBuffer;
  } catch (error) {
    console.error('Failed to fix JPEG:', error);
    return imageBuffer;
  }
}

// Функция для создания директории, если она не существует
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Директория не существует, создаем ее
    await fs.mkdir(dirPath, { recursive: true });
  }
}

// Функция для создания и отправки PDF (запускается в фоновом режиме)
async function createAndSendPDF(ctx, titleId, chapterIndex, chapter, title, chapterUrl, statusMessage, chapters) {
  let pdfPath = null;
  let successImages = 0;
  let tempDir = null;

  try {
    // Создаем временную директорию для изображений
    tempDir = path.join(__dirname, `temp_${chapter._id}`);
    await ensureDir(tempDir);

    const images = chapter.pages || [];
    const imagePaths = [];

    // Скачиваем и обрабатываем изображения
    let lastStatusText = "";
    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];

      try {
        // Формируем текст статуса
        const newStatusText = `📖 Глава ${chapter.number || chapter.chapterNumber || "N/A"} формируется...\nЗагружено изображений: ${successImages}/${images.length}`;

        // Обновляем статус каждые 5 изображений или для первого/последнего, только если текст изменился
        if ((i % 5 === 0 || i === images.length - 1) && newStatusText !== lastStatusText) {
          try {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              statusMessage.message_id,
              null,
              newStatusText,
            );
            lastStatusText = newStatusText;
          } catch (editError) {
            if (!editError.message.includes("message is not modified")) {
              console.error("Ошибка обновления статуса:", editError.message);
            }
          }
        }

        // Формируем полный URL для изображения страницы
        const imageBaseURL = getBaseURL();
        let fullImageUrl;
        if (imageUrl.startsWith("/uploads/")) {
          fullImageUrl = `${imageBaseURL}${imageUrl}`;
        } else if (imageUrl.startsWith("/")) {
          fullImageUrl = `${imageBaseURL}/uploads${imageUrl}`;
        } else {
          fullImageUrl = `${imageBaseURL}/uploads/${imageUrl}`;
        }

        // Получаем изображение
        let imageBytes;
        try {
          const imageResponse = await axios.get(fullImageUrl, {
            responseType: "arraybuffer",
            timeout: 30000,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          });
          imageBytes = imageResponse.data;
        } catch (error) {
          console.error(`Error downloading image ${i + 1}:`, error.message);
          continue;
        }

        // Валидируем и фиксим изображение
        let validatedImage = await validateAndFixImage(imageBytes, imageUrl);
        if (!validatedImage) {
          console.error(`Failed to validate image ${i + 1}`);
          continue;
        }

        // Проверяем, является ли изображение действительным JPEG
        if (validatedImage.type === "jpeg" && !hasSOIMarker(validatedImage.buffer)) {
          console.log(`Invalid JPEG detected for image ${i + 1}, attempting to fix...`);
          validatedImage.buffer = await fixJPEG(validatedImage.buffer);
        }

        // Сохраняем изображение во временную директорию
        const imagePath = path.join(tempDir, `${title.name}_image_${i}.${validatedImage.type}`);
        await fs.writeFile(imagePath, validatedImage.buffer);
        imagePaths.push(imagePath);
        successImages++;
      } catch (error) {
        console.error(`Error processing image ${i + 1}:`, error.message);
      }
    }

    // Проверяем, были ли успешно добавлены изображения
    if (successImages === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMessage.message_id,
        null,
        "❌ Не удалось загрузить изображения для PDF.",
      );
      await ctx.reply(
        "Не удалось создать PDF. Вы можете прочитать главу на сайте:",
        {
          reply_markup: {
            inline_keyboard: [[Markup.button.url("📖 Читать на сайте TOMILO-LIB.RU", chapterUrl)]],
          },
        },
      );
      return;
    }

    // Создаем PDF из сохраненных изображений
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
        pdfPage.drawImage(imageEmbed, {
          x: 0,
          y: 0,
          width: imageEmbed.width,
          height: imageEmbed.height,
        });
      } catch (error) {
        console.error(`Error embedding image ${i + 1}:`, error.message);
      }
    }

    // Сохраняем PDF
    pdfPath = path.join(__dirname, `${title.name}_chapter_${chapter._id}.pdf`);
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytes);

    // Обновляем сообщение о статусе с информацией о размере файла
    const pdfSizeBytes = pdfBytes.length;
    const pdfSizeKB = (pdfSizeBytes / 1024).toFixed(2);
    const pdfSizeMB = (pdfSizeBytes / (1024 * 1024)).toFixed(2);
    const sizeText = pdfSizeBytes > 1024 * 1024 
      ? `${pdfSizeMB} МБ` 
      : `${pdfSizeKB} КБ`;
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      `✅ PDF создан успешно!\n📊 Размер: ${sizeText}\n📝 Отправка может занять несколько минут...`,
    );

    // Создаем кнопки навигации
    const navigationButtons = [];
    if (chapterIndex > 0) {
      navigationButtons.push(
        Markup.button.callback("⬅️ Предыдущая", `select_chapter_${titleId}_${chapterIndex - 1}`),
      );
    }
    if (chapterIndex < chapters.length - 1) {
      navigationButtons.push(
        Markup.button.callback("➡️ Следующая", `select_chapter_${titleId}_${chapterIndex + 1}`),
      );
    }

    // Формируем дату создания главы
    const createdDate = chapter.createdAt 
      ? new Date(chapter.createdAt).toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        })
      : "Дата неизвестна";

    // Отправляем PDF с информацией о главе
    const caption = `📚 *${title.name}*\n` +
      `📖 Глава ${chapter.number || chapter.chapterNumber || "N/A"}\n` +
      `📅 ${createdDate}\n` +
      `✅ Изображений: ${successImages}/${images.length}\n\n` +
      `[🌐 Читать на сайте](${chapterUrl})`;

    // Отправляем PDF
    await ctx.replyWithDocument(
      {
        source: pdfPath,
        filename: `${title.name}_глава_${chapter.number || chapter.chapterNumber || "N/A"}.pdf`,
      },
      {
        caption: caption,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [navigationButtons] },
      },
    );

    // Удаляем сообщение о статусе
    await ctx.deleteMessage(statusMessage.message_id);
  } catch (error) {
    console.error("Ошибка при создании PDF:", error);
    if (statusMessage) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          null,
          `❌ Ошибка: ${error.message || "Неизвестная ошибка"}`,
        );
      } catch (editError) {}
    }
    if (chapterUrl) {
      await ctx.reply(
        "Произошла ошибка при создании PDF. Вы можете прочитать главу на сайте:",
        {
          reply_markup: {
            inline_keyboard: [[Markup.button.url("📖 Читать на сайте", chapterUrl)]],
          },
        },
      );
    } else {
      await ctx.reply("Произошла ошибка при создании PDF. Попробуйте позже.");
    }
  } finally {
    // Удаляем временные файлы
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
}

// Функция для выбора главы и создания PDF
async function selectChapter(ctx, titleId, chapterIndex) {
  // Немедленно отвечаем на нажатие кнопки, чтобы разблокировать бота
  try {
    await ctx.answerCbQuery();
  } catch (e) {}

  let statusMessage = null;
  let chapter = null;
  let title = null;
  let chapterUrl = null;

  try {
    // Сначала получаем общее количество глав
    const countResponse = await axios.get(
      `${API_BASE_URL}/titles/${titleId}/chapters/count`,
      { timeout: 10000 },
    );
    const totalChapters =
      countResponse.data.data?.count || countResponse.data.count || 0;

    if (totalChapters === 0) {
      await ctx.reply("Главы не найдены.");
      return;
    }

    // Получаем ВСЕ главы тайтла с лимитом равным общему количеству
    const chaptersResponse = await axios.get(
      `${API_BASE_URL}/chapters/title/${titleId}?sort=number:desc&limit=${totalChapters}`,
      { timeout: 30000 },
    );
    const chaptersData = chaptersResponse.data.data || chaptersResponse.data;
    const allChapters = Array.isArray(chaptersData)
      ? chaptersData
      : chaptersData.chapters || [];

    if (!allChapters || allChapters.length === 0 || chapterIndex >= allChapters.length) {
      await ctx.reply("Глава не найдена.");
      return;
    }

    const chapterSummary = allChapters[chapterIndex];
    const chapterId = chapterSummary._id;

    // Получаем полную информацию о главе
    const chapterResponse = await axios.get(
      `${API_BASE_URL}/chapters/${chapterId}`,
      { timeout: 15000 },
    );
    chapter = chapterResponse.data.data || chapterResponse.data;

    // Получаем информацию о тайтле
    const titleResponse = await axios.get(`${API_BASE_URL}/titles/${titleId}`, {
      timeout: 10000,
    });
    title = titleResponse.data.data || titleResponse.data;

    // Формируем URL для чтения на сайте
    const baseURL = getBaseURL();
    const titleSlug = title.slug || titleId;
    chapterUrl = `${baseURL}/titles/${titleSlug}/chapter/${chapterId}`;

    const images = chapter.pages || [];
    if (!images || images.length === 0) {
      await ctx.reply("Изображения главы не найдены.");
      return;
    }

    // Отправляем сообщение о начале генерации PDF
    statusMessage = await ctx.reply(
      `📖 Глава ${chapter.number || chapter.chapterNumber || "N/A"} формируется...\nЗагружено изображений: 0/${images.length}`,
    );

    // Запускаем создание PDF в фоновом режиме (не дожидаемся завершения)
    createAndSendPDF(ctx, titleId, chapterIndex, chapter, title, chapterUrl, statusMessage, allChapters).catch(console.error);
  } catch (error) {
    console.error("Ошибка при выборе главы:", error);
    if (statusMessage) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          null,
          `❌ Ошибка: ${error.message || "Неизвестная ошибка"}`,
        );
      } catch (e) {}
    }
    if (chapterUrl) {
      await ctx.reply(
        "Произошла ошибка. Вы можете прочитать главу на сайте:",
        {
          reply_markup: {
            inline_keyboard: [[Markup.button.url("📖 Читать на сайте", chapterUrl)]],
          },
        },
      );
    } else {
      await ctx.reply("Произошла ошибка при создании PDF. Попробуйте позже.");
    }
  }
}

module.exports = { viewTitle, showChapters, selectChapter };
