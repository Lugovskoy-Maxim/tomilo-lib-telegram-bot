// Тестовый файл для трассировки использования punycode
console.log('Запуск трассировки punycode...');

// Импортируем основные зависимости бота по одной, чтобы найти источник предупреждения
console.log('Импорт Telegraf...');
const { Telegraf } = require('telegraf');

console.log('Импорт node-cron...');
const cron = require('node-cron');

console.log('Импорт axios...');
const axios = require('axios');

console.log('Импорт dotenv...');
require('dotenv').config();

console.log('Импорт node-fetch...');
const fetch = require('node-fetch');

console.log('Импорт pdfkit...');
const PDFDocument = require('pdfkit');

console.log('Все зависимости импортированы успешно');
console.log('Если предупреждение появилось выше, значит одна из этих библиотек его вызывает');