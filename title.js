const { Markup } = require("telegraf");
const axios = require("axios");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { API_BASE_URL } = require("./config");

// Функция для получения базового URL без /api для статических файлов
const getBaseURL = () => {
  return API_BASE_URL.replace("/api", "");
};

// Функция для отображения информации о тайтле
async function viewTitle(ctx, titleId, chapterPage = 1) {
  try {
    // Получаем информацию о тайтле
    const titleResponse = await axios.get(`${API_BASE_URL}/titles/${titleId}`);
    const title = titleResponse.data.data || titleResponse.data;

    // Получаем общее количество глав
    const countResponse = await axios.get(
      `${API_BASE_URL}/titles/${titleId}/chapters/count`,
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
    );
    const chaptersData = chaptersResponse.data.data || chaptersResponse.data;
    const chapters = Array.isArray(chaptersData)
      ? chaptersData
      : chaptersData.chapters || [];

    // Получаем общее количество глав для пагинации
    const countResponse = await axios.get(
      `${API_BASE_URL}/titles/${titleId}/chapters/count`,
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

// Функция для выбора главы и создания PDF
async function selectChapter(ctx, titleId, chapterIndex) {
  let pdfPath; // Объявляем переменную в начале функции
  let chapterId; // Объявляем переменную для ID главы
  try {
    // Рассчитываем страницу и индекс на странице
    const limit = 50; // Количество глав на странице
    const page = Math.floor(chapterIndex / limit) + 1;
    const indexOnPage = chapterIndex % limit;
    
    // Получаем главы тайтла с пагинацией
    const offset = (page - 1) * limit;
    const chaptersResponse = await axios.get(
      `${API_BASE_URL}/chapters/title/${titleId}?sort=number:desc&limit=${limit}&offset=${offset}`,
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
    );
    const chapter = chapterResponse.data.data || chapterResponse.data;

    // Получаем информацию о тайтле
    const titleResponse = await axios.get(`${API_BASE_URL}/titles/${titleId}`);
    const title = titleResponse.data.data || titleResponse.data;

    // Изображения из полной информации о главе
    const images = chapter.pages || [];
    // Отображаем пути изображений для отладки

    if (!images || images.length === 0) {
      await ctx.reply("Изображения главы не найдены.");
      return;
    }

    // Отправляем сообщение о начале генерации PDF
    await ctx.reply(
      `📖 Глава ${chapter.number || 'undefined'} формируется... Пожалуйста, подождите.`,
    );

    // Создаем PDF
    pdfPath = path.join(__dirname, `chapter_${chapter._id || chapterId || 'temp'}.pdf`);
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(pdfPath);

    doc.pipe(writeStream);

    // Параметры страницы PDF
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const pageMargin = 20;
    const maxWidth = pageWidth - pageMargin * 2;
    const maxHeight = pageHeight - pageMargin * 2;

    for (const imageUrl of images) {
      try {
        // Формируем полный URL для изображения страницы
        const baseURL = getBaseURL();
        let fullImageUrl;
        if (imageUrl.startsWith("/uploads/")) {
          // Путь уже содержит /uploads/, используем как есть
          fullImageUrl = `${baseURL}${imageUrl}`;
        } else if (imageUrl.startsWith("/")) {
          // Путь начинается с /, но не содержит /uploads/
          fullImageUrl = `${baseURL}/uploads${imageUrl}`;
        } else {
          // Относительный путь
          fullImageUrl = `${baseURL}/uploads/${imageUrl}`;
        }

        // Отображаем путь изображения для отладки
        const imageResponse = await axios.get(fullImageUrl, {
          responseType: "arraybuffer",
        });
        const imageBuffer = Buffer.from(imageResponse.data, "binary");

        // Добавляем изображение в PDF с сохранением пропорций
        doc.addPage().image(imageBuffer, pageMargin, pageMargin, {
          fit: [maxWidth, maxHeight],
          align: "center",
          valign: "center",
        });
      } catch (error) {
        // Ошибка загрузки
      }
    }

    doc.end();

    // Ждем завершения создания PDF
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

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
    const caption = `📚 *${title.name}*\n📖 Глава ${chapter.number || chapter.chapterNumber || 'undefined'}\n📅 ${chapter.createdAt ? new Date(chapter.createdAt).toLocaleDateString() : "Дата неизвестна"}`;

    try {
      await ctx.replyWithDocument(
        { source: pdfPath, filename: `Глава_${chapter.number || chapter.chapterNumber || 'undefined'}.pdf` },
        {
          caption: caption,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [navigationButtons],
          },
        },
      );
    } finally {
      // Удаляем временный PDF файл после отправки
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }
  } catch (error) {
    // Ошибка при выборе главы
    console.error('Ошибка при выборе главы:', error);
    await ctx.reply("Произошла ошибка при загрузке главы. Попробуйте позже.");
    // Удаляем временный файл при ошибке
    // pdfPath уже определен в области видимости функции
    if (pdfPath && fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  }
}

module.exports = { viewTitle, showChapters, selectChapter };
