/**
 * Конфигурация приложения
 */
const dotenv = require('dotenv');
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const API_BASE_URL = process.env.API_BASE_URL || 'https://tomilo-lib.ru/api';
const API_TOKEN = process.env.API_TOKEN || process.env.BACKEND_API_KEY || '';
const TELEGRAPH_ACCESS_TOKEN = process.env.TELEGRAPH_ACCESS_TOKEN || '';
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || process.env.ADMIN_USER_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

module.exports = {
    BOT_TOKEN,
    API_BASE_URL,
    API_TOKEN,
    TELEGRAPH_ACCESS_TOKEN,
    ADMIN_USER_IDS
};

