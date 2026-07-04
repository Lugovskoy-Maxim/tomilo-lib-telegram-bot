const dotenv = require('dotenv');
dotenv.config();

// Замените 'YOUR_BOT_TOKEN' на токен вашего бота Telegram
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const API_BASE_URL = process.env.API_BASE_URL || 'https://tomilo-lib.ru/api';
const BOT_API_SECRET = process.env.BOT_API_SECRET || '';
const SITE_URL = process.env.SITE_URL || 'https://tomilo-lib.ru';

module.exports = {
    BOT_TOKEN,
    API_BASE_URL,
    BOT_API_SECRET,
    SITE_URL,
};