/**
 * Конфигурация приложения
 */
const dotenv = require('dotenv');
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const API_BASE_URL = process.env.API_BASE_URL || 'https://tomilo-lib.ru/api';
const API_TOKEN = process.env.API_TOKEN || process.env.BACKEND_API_KEY || '';
const BOT_API_SECRET = process.env.BOT_API_SECRET || process.env.TELEGRAM_BOT_API_SECRET || '';
const SITE_URL = process.env.SITE_URL || process.env.BASE_URL || 'https://tomilo-lib.ru';
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || 'https://tomilolib.s3.regru.cloud';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'tomilolib';
const TELEGRAPH_ACCESS_TOKEN = process.env.TELEGRAPH_ACCESS_TOKEN || '';
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || process.env.ADMIN_USER_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

module.exports = {
    BOT_TOKEN,
    API_BASE_URL,
    API_TOKEN,
    BOT_API_SECRET,
    SITE_URL,
    S3_PUBLIC_URL,
    TELEGRAM_BOT_USERNAME,
    TELEGRAPH_ACCESS_TOKEN,
    ADMIN_USER_IDS
};

