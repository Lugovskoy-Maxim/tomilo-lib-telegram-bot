#!/usr/bin/env node
/**
 * Один раз создать аккаунт Telegraph и вывести токен для .env.
 * Использование: node src/scripts/telegraph-create-account.js
 * Затем добавьте в .env: TELEGRAPH_ACCESS_TOKEN=полученный_токен
 */
require('dotenv').config();
const { createAccount } = require('../services/telegraph');

createAccount('TOMILO LIB', 'TOMILO LIB', 'https://tomilo-lib.ru')
    .then(({ access_token }) => {
        console.log('Добавьте в .env строку:\n');
        console.log('TELEGRAPH_ACCESS_TOKEN=' + access_token);
    })
    .catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });
