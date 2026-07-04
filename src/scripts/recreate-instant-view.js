#!/usr/bin/env node
/**
 * Пересоздать Instant View для главы и сохранить ссылку в БД бота.
 * Использование:
 *   npm run recreate-instant-view -- <chapterId>
 *   npm run recreate-instant-view -- <titleId> <chapterIndex>
 *
 * Требуется TELEGRAPH_ACCESS_TOKEN в .env.
 */
require('dotenv').config();
const { createInstantViewForChapter } = require('../services/telegraph');
const { setLink } = require('../db/links');

async function main() {
    const token = process.env.TELEGRAPH_ACCESS_TOKEN;
    if (!token) {
        console.error('Задайте TELEGRAPH_ACCESS_TOKEN в .env');
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
        console.error('Использование: npm run recreate-instant-view -- <chapterId>');
        console.error('         или: npm run recreate-instant-view -- <titleId> <chapterIndex>');
        process.exit(1);
    }

    try {
        let chapterId = input.chapterId;
        if (!chapterId && input.titleId != null && Number.isInteger(input.chapterIndex)) {
            const { getAllChapters } = require('../services/api');
            const list = await getAllChapters(input.titleId, 1000, 'asc');
            const s = list[input.chapterIndex];
            chapterId = s?._id ?? s?.id;
        }
        const url = await createInstantViewForChapter(token, input);
        if (chapterId) setLink(chapterId, url);
        console.log('URL:', url);
        if (chapterId) console.log('Сохранено в БД бота для главы', chapterId);
    } catch (err) {
        console.error(err.message || err);
        process.exit(1);
    }
}

main();
