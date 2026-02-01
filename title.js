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

    // Проверяем, есть ли обложка у тайтла
    if (title.coverImage) {
      // Формируем полный URL для обложки
      const baseURL = getBaseURL();
      let coverUrl;
      if (title.coverImage.startsWith("/uploads/")) {
        // Путь уже содержит /uploads/, используем как есть
        coverUrl = `${baseURL}${title.coverImage}`;
      } else if (title.coverImage.startsWith("/")) {
        // Путь начинается с /, но не содержит /uploads/
        coverUrl = `${baseURL}/uploads${title.coverImage}`;
      } else {
        // Относительный путь
        coverUrl = `${baseURL}/uploads/${title.coverImage}`;
      }

      // Отправляем обложку с подписью
      await ctx.replyWithPhoto(coverUrl, {
        caption: `📚 *${title.name}*\n📅 Год: ${title.releaseYear || title.year || "N/A"}\n📖 Статус: ${title.status || "N/A"}\n📚 Глав: ${totalChapters || "N/A"}\n📝 Описание: ${title.description || "Нет описания"}`,
        parse_mode: "Markdown",
      });
    } else {
      // Если обложки нет, отправляем обычное текстовое сообщение
      let message = `📚 *${title.name}*\n`;
      message += `📅 Год: ${title.releaseYear || title.year || "N/A"}\n`;
      message += `📖 Статус: ${title.status || "N/A"}\n`;
      message += `📚 Глав: ${totalChapters || "N/A"}\n`;
      message += `📝 Описание: ${title.description || "Нет описания"}\n\n`;
      await ctx.reply(message, { parse_mode: "Markdown" });
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

    const message = await ctx.reply("Главы:", {
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
    // Получаем главы тайтла с пагинацией
    const limit = 50; // Количество глав на странице
    const offset = (page - 1) * limit;
    const chaptersResponse = await axios.get(
      `${API_BASE_URL}/chapters/title/${titleId}?sort=number:desc&limit=${limit}&offset=${offset}`,
      { timeout: 15000 },
    );
    const chaptersData = chaptersResponse.data.data || chaptersResponse.data;
    const chapters = Array.isArray(chaptersData)
      ? chaptersData
      : chaptersData.chapters || [];

    // Получаем общее количество глав для пагинации
    const countResponse = await axios.get(
      `${API_BASE_URL}/titles/${titleId}/chapters/count`,
      { timeout: 10000 },
    );
    const totalChapters =
      countResponse.data.data?.count ||
      countResponse.data.count ||
      chapters.length;
    const totalPages = Math.ceil(totalChapters / limit);

    if (!chapters || chapters.length === 0) {
      await ctx.reply("Главы не найдены.");
      return;
    }

    // Создаем кнопки для глав
    const chapterButtons = chapters.map((chapter, index) =>
      Markup.button.callback(
        `${chapter.chapterNumber}`,
        `select_chapter_${titleId}_${(page - 1) * limit + index}`,
      ),
    );

    // Разбиваем кнопки на группы по 2
    const buttonRows = [];
    for (let i = 0; i < chapterButtons.length; i += 2) {
      buttonRows.push(chapterButtons.slice(i, i + 2));
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

      // Разбиваем навигационные кнопки на группы по 2
      const navigationRows = [];
      for (let i = 0; i < navigationButtons.length; i += 2) {
        navigationRows.push(navigationButtons.slice(i, i + 2));
      }
      buttonRows.push(...navigationRows);
    }

    // Отправляем сообщение с кнопками
    await ctx.reply(`Выберите главу (${totalChapters} всего):`, {
      reply_markup: {
        inline_keyboard: buttonRows,
      },
    });
  } catch (error) {
    // Ошибка получения глав
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

// Функция для выбора главы и создания PDF
async function selectChapter(ctx, titleId, chapterIndex) {
  let pdfPath = null;
  let chapterId = null;
  let statusMessage = null;
  let pdfDoc = null;
  let successImages = 0;
  let tempDir = null;

  try {
    // Рассчитываем страницу и индекс на странице
    const limit = 50; // Количество глав на странице
    const page = Math.floor(chapterIndex / limit) + 1;
    const indexOnPage = chapterIndex % limit;

    // Получаем главы тайтла с пагинацией
    const offset = (page - 1) * limit;
    const chaptersResponse = await axios.get(
      `${API_BASE_URL}/chapters/title/${titleId}?sort=number:desc&limit=${limit}&offset=${offset}`,
      { timeout: 15000 },
    );
    const chaptersData = chaptersResponse.data.data || chaptersResponse.data;
    const chapters = Array.isArray(chaptersData)
      ? chaptersData
      : chaptersData.chapters || [];

    if (!chapters || chapters.length === 0 || indexOnPage >= chapters.length) {
      await ctx.reply("Глава не найдена.");
      return;
    }

    const chapterSummary = chapters[indexOnPage];
    chapterId = chapterSummary._id;

    // Получаем полную информацию о главе, включая страницы
    const chapterResponse = await axios.get(
      `${API_BASE_URL}/chapters/${chapterId}`,
      { timeout: 15000 },
    );
    const chapter = chapterResponse.data.data || chapterResponse.data;

    // Получаем информацию о тайтле
    const titleResponse = await axios.get(`${API_BASE_URL}/titles/${titleId}`, {
      timeout: 10000,
    });
    const title = titleResponse.data.data || titleResponse.data;

    // Изображения из полной информации о главе
    const images = chapter.pages || [];

    if (!images || images.length === 0) {
      await ctx.reply("Изображения главы не найдены.");
      return;
    }

    // Создаем временную директорию для изображений
    tempDir = path.join(__dirname, `temp_${chapterId}`);
    await ensureDir(tempDir);

    // Отправляем сообщение о начале генерации PDF с номером главы
    statusMessage = await ctx.reply(
      `📖 Глава ${chapter.number || chapter.chapterNumber || "N/A"} формируется...\nЗагружено изображений: 0/${images.length}`,
    );

    // Скачиваем и обрабатываем изображения
    const imagePaths = [];
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
            // Игнорируем ошибку "message is not modified"
            if (!editError.message.includes("message is not modified")) {
              console.error("Ошибка обновления статуса:", editError.message);
            }
          }
        }

        // Формируем полный URL для изображения страницы
        const baseURL = getBaseURL();
        let fullImageUrl;
        if (imageUrl.startsWith("/uploads/")) {
          fullImageUrl = `${baseURL}${imageUrl}`;
        } else if (imageUrl.startsWith("/")) {
          fullImageUrl = `${baseURL}/uploads${imageUrl}`;
        } else {
          fullImageUrl = `${baseURL}/uploads/${imageUrl}`;
        }

        // Получаем изображение
        let imageBytes;
        try {
          const imageResponse = await axios.get(fullImageUrl, {
            responseType: "arraybuffer",
            timeout: 30000,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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
        if (validatedImage.type === "jpeg") {
          // Проверяем наличие SOI маркера в начале файла
          if (!hasSOIMarker(validatedImage.buffer)) {
            console.log(`Invalid JPEG detected for image ${i + 1}, attempting to fix...`);
            // Конвертируем в PNG и обратно в JPEG для исправления
            validatedImage.buffer = await fixJPEG(validatedImage.buffer);
          }
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
        "❌ Не удалось загрузить ни одного изображения для создания PDF.",
      );
      return;
    }

    // Создаем PDF из сохраненных изображений
    pdfDoc = await PDFDocument.create();
    
    // Обрабатываем каждое сохраненное изображение
    for (let i = 0; i < imagePaths.length; i++) {
      try {
        const imagePath = imagePaths[i];
        const imageBytes = await fs.readFile(imagePath);
        
        // Определяем тип изображения по расширению файла
        const imageExt = path.extname(imagePath).toLowerCase();
        let imageEmbed;
        
        if (imageExt === '.png') {
          imageEmbed = await pdfDoc.embedPng(imageBytes);
        } else if (imageExt === '.jpg' || imageExt === '.jpeg') {
          imageEmbed = await pdfDoc.embedJpg(imageBytes);
        } else {
          // Пытаемся определить тип автоматически
          try {
            imageEmbed = await pdfDoc.embedPng(imageBytes);
          } catch (e) {
            try {
              imageEmbed = await pdfDoc.embedJpg(imageBytes);
            } catch (e2) {
              console.error(`Failed to embed image ${i + 1}`);
              continue;
            }
          }
        }
        
        // Создаем новую страницу с размерами изображения
        const page = pdfDoc.addPage([imageEmbed.width, imageEmbed.height]);
        
        // Рисуем изображение на странице
        page.drawImage(imageEmbed, {
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
    pdfPath = path.join(__dirname, `${title.name}_chapter_${chapterId}.pdf`);
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytes);

    // Обновляем сообщение о статусе
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      `✅ PDF создан успешно!\nДобавлено изображений: ${successImages}/${images.length}\nОтправка...`,
    );

    // Создаем кнопки навигации
    const navigationButtons = [];
    if (chapterIndex > 0) {
      navigationButtons.push(
        Markup.button.callback(
          "⬅️ Предыдущая",
          `select_chapter_${titleId}_${chapterIndex - 1}`,
        ),
      );
    }
    if (chapterIndex < chapters.length - 1) {
      navigationButtons.push(
        Markup.button.callback(
          "➡️ Следующая",
          `select_chapter_${titleId}_${chapterIndex + 1}`,
        ),
      );
    }

    // Отправляем PDF с информацией о главе
    const caption = `📚 *${title.name}*\n📖 Глава ${chapter.number || chapter.chapterNumber || "N/A"}\n📅 ${chapter.createdAt ? new Date(chapter.createdAt).toLocaleDateString() : "Дата неизвестна"}\n✅ Изображений: ${successImages}/${images.length}`;

    // Проверяем существование файла перед отправкой
    try {
      await fs.access(pdfPath);
    } catch (error) {
      throw new Error("PDF файл не найден");
    }

    // Отправляем PDF
    await ctx.replyWithDocument(
      {
        source: pdfPath,
        filename: `${title.name}_глава_${chapter.number || chapter.chapterNumber || "N/A"}.pdf`,
      },
      {
        caption: caption,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [navigationButtons],
        },
      },
    );

    // Удаляем сообщение о статусе
    await ctx.deleteMessage(statusMessage.message_id);
  } catch (error) {
    console.error("Ошибка при выборе главы:", error);

    // Обновляем сообщение о статусе в случае ошибки
    if (statusMessage) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          null,
          `❌ Ошибка: ${error.message || "Неизвестная ошибка"}`,
        );
      } catch (editError) {
        console.error("Ошибка при обновлении сообщения:", editError);
      }
    }

    // Отправляем сообщение об ошибке пользователю
    await ctx.reply("Произошла ошибка при создании PDF. Попробуйте позже.");
  } finally {
    // Удаляем временные файлы и директорию
    if (tempDir) {
      try {
        const files = await fs.readdir(tempDir);
        for (const file of files) {
          await fs.unlink(path.join(tempDir, file));
        }
        await fs.rmdir(tempDir);
      } catch (error) {
        console.error("Ошибка при удалении временной директории:", error);
      }
    }
    
    // Удаляем временный PDF файл если он существует
    if (pdfPath) {
      try {
        await fs.access(pdfPath);
        await fs.unlink(pdfPath);
      } catch (error) {
        // Файл не существует или ошибка при удалении
      }
    }
  }
}

module.exports = { viewTitle, showChapters, selectChapter };
