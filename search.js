const { Markup } = require('telegraf');
const axios = require('axios');
const { API_BASE_URL } = require('./config');

// Функция поиска тайтлов
async function searchTitles(ctx, bot) {
    await ctx.reply('Введите название тайтла для поиска:');
    
    // Создаем временный обработчик для следующего сообщения
    const tempHandler = async (ctx2) => {
        const query = ctx2.message.text;
        
        try {
            // Запрашиваем тайтлы у API
            const response = await axios.get(`${API_BASE_URL}/titles?search=${encodeURIComponent(query)}&limit=10`);
            // Обрабатываем разные форматы ответа
            const titles = response.data.data || response.data; // Обрабатываем разные форматы ответа
            
            // Проверяем, что titles - это массив
            if (!Array.isArray(titles) || titles.length === 0) {
                await ctx.reply('Тайтлы не найдены. Попробуйте другой запрос.');
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
            
            await ctx.reply('Результаты поиска:', Markup.inlineKeyboard(buttonRows));
        } catch (error) {
            // Ошибка поиска
            await ctx.reply('Произошла ошибка при поиске тайтлов. Попробуйте позже.');
        }
    };
    
    // Регистрируем временный обработчик
    bot.on('text', tempHandler);
}

module.exports = { searchTitles };