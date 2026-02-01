#!/usr/bin/env node

// Скрипт для проверки вывода в реальном времени

console.log('Проверка вывода в реальном времени...');
console.log('Текущее время:', new Date().toISOString());

// Принудительно очищаем буфер вывода
process.stdout.write('');

// Создаем задержку и проверяем вывод
setTimeout(() => {
    console.log('Проверка через 2 секунды...');
    process.stdout.write('');
}, 2000);

setTimeout(() => {
    console.log('Проверка через 4 секунды...');
    process.stdout.write('');
}, 4000);

setTimeout(() => {
    console.log('Завершение проверки...');
    process.exit(0);
}, 6000);