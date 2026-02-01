/**
 * Команда /search и кнопка "Поиск тайтлов"
 */
const { Markup } = require('telegraf');
const { searchTitles: searchTitlesAPI } = require('../../services/api');

async function searchTitles(ctx, bot) {
    // Set flag that we're waiting for search input
    ctx.session = ctx.session || {};
    ctx.session.waitingForSearch = true;
    
    await ctx.reply('Введите название тайтла для поиска:');
}

async function handleSearchInput(ctx, bot) {
    if (!ctx.session || !ctx.session.waitingForSearch) {
        return;
    }
    
    // Reset the flag immediately to prevent duplicate handling
    ctx.session.waitingForSearch = false;
    
    const query = ctx.message.text;
    
    // Skip if this is a command
    if (query.startsWith('/')) {
        return;
    }
    
    try {
        const titles = await searchTitlesAPI(query);
        
        console.log('Search API response:', JSON.stringify(titles, null, 2));
        
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
        console.error('Search error:', error.message);
        await ctx.reply('Произошла ошибка при поиске тайтлов. Попробуйте позже.');
    }
}

function setupSearchCommand(bot) {
    bot.hears('🔍 Поиск тайтлов', async (ctx) => {
        await searchTitles(ctx, bot);
    });
    
    bot.command('search', async (ctx) => {
        await searchTitles(ctx, bot);
    });
    
    // Handle search input - only runs when waitingForSearch flag is set
    bot.on('text', async (ctx) => {
        const waitingForSearch = ctx.session?.waitingForSearch;
        console.log('[SEARCH] Text message received:', ctx.message?.text, '| waitingForSearch:', waitingForSearch);
        
        if (!waitingForSearch) {
            console.log('[SEARCH] Ignoring text message - not waiting for search');
            return;
        }
        
        await handleSearchInput(ctx, bot);
    });
}

module.exports = { setupSearchCommand, searchTitles };

