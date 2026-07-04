/**
 * Mock-данные для локального API (каталог, тайтлы, главы).
 * Используются, если запущен сервер из этого репозитория.
 */

const title1Id = '507f1f77bcf86cd799439011';
const title2Id = '507f1f77bcf86cd799439012';

// Несколько реальных картинок для PDF (picsum)
const samplePages = [
    'https://picsum.photos/400/600?random=1',
    'https://picsum.photos/400/600?random=2',
    'https://picsum.photos/400/600?random=3',
];

const titles = [
    {
        _id: title1Id,
        name: 'Пример манги',
        slug: 'primer-mangi',
        description: 'Описание тайтла для тестирования бота. Каталог, главы и PDF должны работать с этим mock API.',
        releaseYear: 2024,
        year: 2024,
        status: 'Онгоинг',
        views: 1000,
        averageRanked: 4.5,
        coverImage: '/uploads/covers/sample.jpg',
        createdAt: '2024-01-15T10:00:00.000Z',
        teletypeUrl: 'https://teletype.in/@tomilo/sample',
    },
    {
        _id: title2Id,
        name: 'Второй тайтл',
        slug: 'vtoroy-taytl',
        description: 'Ещё один тайтл для проверки каталога и поиска.',
        releaseYear: 2023,
        year: 2023,
        status: 'Завершён',
        views: 500,
        averageRanked: 4.2,
        coverImage: '/uploads/covers/sample2.jpg',
        createdAt: '2023-06-01T10:00:00.000Z',
    },
];

const chaptersByTitle = {
    [title1Id]: [
        { _id: 'ch1', titleId: title1Id, number: 1, chapterNumber: 1, pages: samplePages, createdAt: '2024-02-01T12:00:00.000Z', teletypeUrl: 'https://teletype.in/@tomilo/ch1' },
        { _id: 'ch2', titleId: title1Id, number: 2, chapterNumber: 2, pages: samplePages, createdAt: '2024-02-10T12:00:00.000Z' },
        { _id: 'ch3', titleId: title1Id, number: 3, chapterNumber: 3, pages: samplePages, createdAt: '2024-02-14T12:00:00.000Z' },
    ],
    [title2Id]: [
        { _id: 'ch4', titleId: title2Id, number: 1, chapterNumber: 1, pages: samplePages, createdAt: '2023-07-01T12:00:00.000Z' },
    ],
};

function getTitles() {
    return titles;
}

function getTitleById(id) {
    return titles.find((t) => t._id === id) || null;
}

function getChaptersByTitleId(titleId, sortOrder = 'asc') {
    const list = chaptersByTitle[titleId] || [];
    const sorted = [...list].sort((a, b) => (sortOrder === 'desc' ? b.number - a.number : a.number - b.number));
    return sorted;
}

function getChapterById(chapterId) {
    for (const arr of Object.values(chaptersByTitle)) {
        const ch = arr.find((c) => c._id === chapterId);
        if (ch) return ch;
    }
    return null;
}

function getLatestChapters(limit = 10) {
    const all = [];
    for (const arr of Object.values(chaptersByTitle)) {
        for (const ch of arr) {
            all.push({ ...ch, title: getTitleById(ch.titleId)?.name, slug: getTitleById(ch.titleId)?.slug });
        }
    }
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return all.slice(0, limit);
}

module.exports = {
    getTitles,
    getTitleById,
    getChaptersByTitleId,
    getChapterById,
    getLatestChapters,
};
