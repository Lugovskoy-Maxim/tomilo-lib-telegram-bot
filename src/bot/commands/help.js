/**
 * Команда /help и кнопка "Помощь"
 */
function getHelpText() {
    return (
        'Tomilo Lib Bot\n\n' +
        '/link КОД — привязать аккаунт сайта\n' +
        '👤 Профиль — аккаунт, подписка, закладки, уведомления\n' +
        '/profile или /status — то же, что кнопка «Профиль»\n' +
        '/search — поиск тайтлов\n' +
        '/catalog — каталог\n' +
        '/new — новые главы\n' +
        '/help — эта справка\n\n' +
        '• Каталог и поиск — выберите тайтл, затем главу.\n' +
        '• Чтение в Telegram — Instant View (Teletype/Telegraph).\n' +
        '• PDF глав — только для привязанных премиум-пользователей.\n' +
        '• «Скачать несколько глав» — диапазон (1-10), по одной в чат; ⏹ Стоп для отмены.\n' +
        '• Уже отправленные PDF повторно не создаются (кэш Telegram).\n' +
        '• «Пересоздать PDF» — только для одной главы отдельной кнопкой.\n' +
        '• «Мои тайтлы» — закладки с сайта (нужна привязка аккаунта).'
    );
}

function setupHelpCommand(bot) {
    bot.help((ctx) => {
        ctx.reply(getHelpText());
    });

    bot.hears('ℹ️ Помощь', (ctx) => {
        ctx.reply(getHelpText());
    });
}

module.exports = { setupHelpCommand };