#!/usr/bin/env node

// Подавляем предупреждение о устаревшем модуле punycode
// Это необходимо, потому что одна из зависимостей (telegraf) использует устаревшую библиотеку whatwg-url
process.noDeprecation = true;

// Логируем начало запуска
console.log('Запуск Telegram бота...');

// Запускаем основной бот
require('./bot.js');