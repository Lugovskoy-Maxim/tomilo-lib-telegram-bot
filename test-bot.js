#!/usr/bin/env node

// Тестовый скрипт для проверки запуска бота

console.log('Тестовый запуск бота...');
console.log('Время начала:', new Date().toISOString());

// Импортируем бота
const bot = require('./bot.js');

// Останавливаем бота через 5 секунд
setTimeout(() => {
    console.log('Остановка бота...');
    console.log('Время остановки:', new Date().toISOString());
    process.exit(0);
}, 5000);