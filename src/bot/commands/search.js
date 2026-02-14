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
        
        const titleId = (t) => t.id ?? t._id ?? t.documentId ?? t.slug ?? '';
        const buttons = titles.map(title =>
            Markup.button.callback(
                `${title.name || title.title || 'Без названия'} (${title.releaseYear ?? title.year ?? 'N/A'})`,
                `view_title_${titleId(title)}`
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
    // Using hears() instead of on('text') to avoid intercepting all messages
    // This allows bot.hears() for keyboard buttons to work properly
    bot.hears(/^(?![\/])/, async (ctx) => {
        if (!ctx.session || !ctx.session.waitingForSearch) {
            return;
        }
        
        // Skip if this is a command or keyboard button
        const text = ctx.message?.text;
        const keyboardButtons = ['🔍 Поиск тайтлов', '📚 Каталог', '🆕 Новые главы', '📖 Мои тайтлы', 'ℹ️ Помощь'];
        if (text?.startsWith('/') || keyboardButtons.includes(text)) {
            return;
        }
        
        await handleSearchInput(ctx, bot);
    });
}

module.exports = { setupSearchCommand, searchTitles };

