#!/usr/bin/env node
/**
 * Создать страницу Telegraph (Instant View) для главы и вывести URL.
 * Использование:
 *   TELEGRAPH_ACCESS_TOKEN=xxx node src/scripts/create-instant-view.js <chapterId>
 *   TELEGRAPH_ACCESS_TOKEN=xxx node src/scripts/create-instant-view.js <titleId> <chapterIndex>
 *
 * Получить токен один раз:
 *   node -e "require('./src/services/telegraph').createAccount('TOMILO').then(r=>console.log('TELEGRAPH_ACCESS_TOKEN='+r.access_token))"
 *
 * Сохраните URL в бэкенде в поле главы: teletypeUrl или instantViewUrl.
 */
require('dotenv').config();
const { createInstantViewForChapter } = require('../services/telegraph');

async function main() {
    const token = process.env.TELEGRAPH_ACCESS_TOKEN;
    if (!token) {
        console.error('Задайте TELEGRAPH_ACCESS_TOKEN в .env или в окружении.');
        process.exit(1);
    }

    const args = process.argv.slice(2);
    let input;

    if (args.length === 1) {
        input = { chapterId: args[0] };
    } else if (args.length === 2) {
        const chapterIndex = parseInt(args[1], 10);
        if (isNaN(chapterIndex)) {
            console.error('Укажите chapterIndex числом.');
            process.exit(1);
        }
        input = { titleId: args[0], chapterIndex };
    } else {
        console.error('Использование: node create-instant-view.js <chapterId>');
        console.error('         или: node create-instant-view.js <titleId> <chapterIndex>');
        process.exit(1);
    }

    try {
        const url = await createInstantViewForChapter(token, input);
        console.log(url);
    } catch (err) {
        console.error(err.message || err);
        process.exit(1);
    }
}

main();
