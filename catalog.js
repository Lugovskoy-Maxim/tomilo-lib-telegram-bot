const { Markup } = require('telegraf');
const axios = require('axios');
const { API_BASE_URL } = require('./config');

// Функция для отображения каталога тайтлов
async function showCatalog(ctx, page = 1) {
    const limit = 10; // Количество тайтлов на странице
    const offset = (page - 1) * limit;
    
    try {
        // Запрашиваем тайтлы у API
        const response = await axios.get(`${API_BASE_URL}/titles?limit=${limit}&page=${page}&sort=createdAt:desc`);
        // Логирование ответа сервера при запросе каталога
        
        // Обрабатываем разные форматы ответа
        let titles = [];
        let total = 0;
        let totalPages = 0;
        
        if (response.data.data && response.data.data.titles) {
            // Новый формат с пагинацией
            titles = response.data.data.titles;
            total = response.data.data.pagination.total;
            totalPages = response.data.data.pagination.pages;
        } else if (response.data.data) {
            // Старый формат с data как массив
            titles = response.data.data;
            total = response.data.total || titles.length;
            totalPages = Math.ceil(total / limit);
        } else {
            // Прямой массив
            titles = response.data;
            total = titles.length;
            totalPages = Math.ceil(total / limit);
        }
        
        // Обработанные данные: titles.length, total, totalPages
        
        if (!Array.isArray(titles) || titles.length === 0) {
            await ctx.reply('Каталог пуст.');
            return;
        }
        
        // Создаем кнопки для выбора тайтла
        const buttons = titles.map(title =>
            Markup.button.callback(`${title.name} (${title.releaseYear || title.year || 'N/A'})`, `view_title_${title._id}`)
        );
        
        // Разбиваем кнопки на группы по 2
        const buttonRows = [];
        for (let i = 0; i < buttons.length; i += 2) {
            buttonRows.push(buttons.slice(i, i + 2));
        }
        
        // Добавляем кнопки навигации
        const navigationButtons = [];
        if (page > 1) {
            navigationButtons.push(Markup.button.callback('⬅️ Назад', `catalog_page_${page - 1}`));
        }
        if (page < totalPages) {
            navigationButtons.push(Markup.button.callback('➡️ Далее', `catalog_page_${page + 1}`));
        }
        
        if (navigationButtons.length > 0) {
            buttonRows.push(navigationButtons);
        }
        
        await ctx.reply(`Каталог тайтлов (страница ${page} из ${totalPages}):`, {
            reply_markup: {
                inline_keyboard: buttonRows
            }
        });
    } catch (error) {
        // Ошибка получения каталога
        await ctx.reply('Произошла ошибка при получении каталога. Попробуйте позже.');
    }
}

module.exports = { showCatalog };