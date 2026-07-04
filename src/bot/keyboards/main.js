/**
 * Главная клавиатура бота
 */
const { Markup } = require('telegraf');

const SUBSCRIPTION_BUTTON = '⭐ Подписка';

const MAIN_KEYBOARD = Markup.keyboard([
    ['🔍 Поиск тайтлов', '📖 Мои тайтлы'],
    ['📚 Каталог', '🆕 Новые главы'],
    [SUBSCRIPTION_BUTTON, '🔗 Привязать аккаунт'],
    ['ℹ️ Помощь'],
]).resize();

module.exports = {
    MAIN_KEYBOARD,
    SUBSCRIPTION_BUTTON,
};