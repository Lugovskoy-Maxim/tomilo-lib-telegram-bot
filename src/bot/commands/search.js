/**
 * Команда /search и кнопка "Поиск тайтлов"
 */
const { Markup } = require('telegraf');
const { searchTitles: searchTitlesAPI } = require('../../services/api');

async function searchTitles(ctx, bot) {
    await ctx.reply('Введите название тайтла для поиска:');
    
    const tempHandler = async (ctx2) => {
        const query = ctx2.message.text;
        
        try {
            const titles = await searchTitlesAPI(query);
            
            if (!Array.isArray(titles) || titles.length === 0) {
                await ctx.reply('Тайтлы не найдены. Попробуйте другой запрос.');
                return;
            }
            
            const buttons = titles.map(title =>
                Markup.button.callback(
                    `${title.name} (${title.releaseYear || title.year || 'N/A'})`,
                    `view_title_${title._id}`
                )
            );
            
            const buttonRows = [];
            for (let i = 0; i < buttons.length; i += 2) {
                buttonRows.push(buttons.slice(i, i + 2));
            }
            
            await ctx.reply('Результаты поиска:', Markup.inlineKeyboard(buttonRows));
        } catch (error) {
            await ctx.reply('Произошла ошибка при поиске тайтлов. Попробуйте позже.');
        }
    };
    
    bot.on('text', tempHandler);
}

function setupSearchCommand(bot) {
    bot.hears('🔍 Поиск тайтлов', async (ctx) => {
        await searchTitles(ctx, bot);
    });
    
    bot.command('search', async (ctx) => {
        await searchTitles(ctx, bot);
    });
}

module.exports = { setupSearchCommand, searchTitles };

