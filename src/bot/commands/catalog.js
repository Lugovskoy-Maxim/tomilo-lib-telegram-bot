/**
 * Команда /catalog и кнопка "Каталог"
 */
const { Markup } = require('telegraf');
const { getCatalog } = require('../../services/api');

async function showCatalog(ctx, page = 1) {
    try {
        const { titles, total, totalPages } = await getCatalog(page);
        
        if (!Array.isArray(titles) || titles.length === 0) {
            await ctx.reply('Каталог пуст.');
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
            reply_markup: { inline_keyboard: buttonRows }
        });
    } catch (error) {
        await ctx.reply('Произошла ошибка при получении каталога. Попробуйте позже.');
    }
}

function setupCatalogCommand(bot) {
    bot.hears('📚 Каталог', async (ctx) => {
        await showCatalog(ctx, 1);
    });
    
    bot.command('catalog', async (ctx) => {
        await showCatalog(ctx, 1);
    });
}

module.exports = { setupCatalogCommand, showCatalog };
