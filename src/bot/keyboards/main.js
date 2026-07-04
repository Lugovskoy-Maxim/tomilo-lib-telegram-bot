/**
 * Главная клавиатура бота
 */
const { Markup } = require('telegraf');

const PROFILE_BUTTON = '👤 Профиль';
const LINK_BUTTON = '🔗 Привязать аккаунт';

const KEYBOARD_BUTTONS = [
    PROFILE_BUTTON,
    LINK_BUTTON,
    '🔍 Поиск тайтлов',
    '📖 Мои тайтлы',
    '📚 Каталог',
    '🆕 Новые главы',
    'ℹ️ Помощь',
];

function buildMainKeyboard(linked = false) {
    const rows = [
        ['🔍 Поиск тайтлов', '📖 Мои тайтлы'],
        ['📚 Каталог', '🆕 Новые главы'],
    ];
    if (linked) {
        rows.push([PROFILE_BUTTON]);
    } else {
        rows.push([PROFILE_BUTTON, LINK_BUTTON]);
    }
    rows.push(['ℹ️ Помощь']);
    return Markup.keyboard(rows).resize();
}

module.exports = {
    PROFILE_BUTTON,
    LINK_BUTTON,
    KEYBOARD_BUTTONS,
    buildMainKeyboard,
};