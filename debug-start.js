#!/usr/bin/env node

// Скрипт для отладки запуска бота с принудительной очисткой буфера

console.log('Начало запуска бота...');
console.log('Текущее время:', new Date().toISOString());

// Принудительно очищаем буфер
if (process.stdout && typeof process.stdout.flush === 'function') {
    process.stdout.flush();
}

// Запускаем бота
console.log('Загрузка модуля бота...');
require('./bot.js');

console.log('Скрипт завершен');