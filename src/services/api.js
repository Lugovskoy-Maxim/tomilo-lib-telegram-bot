/**
 * API сервис для работы с внешним API
 */
const axios = require('axios');
const { API_BASE_URL, API_TOKEN } = require('../config');

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
});

if (API_TOKEN) {
    apiClient.interceptors.request.use((config) => {
        if (API_TOKEN.startsWith('Bearer ') || API_TOKEN.length > 100) {
            config.headers.Authorization = API_TOKEN.startsWith('Bearer ') ? API_TOKEN : `Bearer ${API_TOKEN}`;
        } else {
            config.headers['X-API-Key'] = API_TOKEN;
        }
        return config;
    });
}

/**
 * Получить базовый URL без /api для статических файлов
 */
function getBaseURL() {
    return API_BASE_URL.replace('/api', '');
}

/**
 * Поиск тайтлов
 */
async function searchTitles(query, page = 1, limit = 20) {
    console.log('Searching for:', query);
    console.log('API URL:', API_BASE_URL + `/titles?search=${encodeURIComponent(query)}&limit=${limit}&page=${page}`);
    
    const response = await apiClient.get(`/titles?search=${encodeURIComponent(query)}&limit=${limit}&page=${page}`);
    
    console.log('API response status:', response.status);
    console.log('API response data:', JSON.stringify(response.data).substring(0, 500));
    
    // Handle different response structures
    if (response.data.data && Array.isArray(response.data.data)) {
        return response.data.data;
    } else if (response.data.data && response.data.data.titles) {
        return response.data.data.titles;
    } else if (Array.isArray(response.data.data)) {
        return response.data.data;
    } else if (Array.isArray(response.data)) {
        return response.data;
    }
    
    return [];
}

/**
 * Получить каталог тайтлов
 */
async function getCatalog(page = 1, limit = 10) {
    console.log(`[API] Запрос каталога: page=${page}, limit=${limit}`);
    
    try {
        const response = await apiClient.get(`/titles?limit=${limit}&page=${page}&sort=createdAt:desc`);
        
        console.log(`[API] Ответ каталога: status=${response.status}`);
        console.log(`[API] Структура ответа:`, JSON.stringify(response.data).substring(0, 1000));
        
        let titles = [];
        let total = 0;
        let totalPages = 0;
        
        // Обрабатываем разные форматы ответа API
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
            // Формат: { data: [...] }
            titles = response.data.data;
            total = response.data.total || titles.length;
            totalPages = Math.ceil(total / limit);
            console.log(`[API] Найдено тайтлов: ${titles.length}, всего: ${total}, страниц: ${totalPages}`);
        } else if (response.data && response.data.data && response.data.data.titles) {
            // Формат: { data: { titles: [...], pagination: {...} } }
            titles = response.data.data.titles;
            total = response.data.data.pagination?.total || titles.length;
            totalPages = response.data.data.pagination?.pages || Math.ceil(total / limit);
            console.log(`[API] Найдено тайтлов: ${titles.length}, всего: ${total}, страниц: ${totalPages}`);
        } else if (response.data && Array.isArray(response.data)) {
            // Формат: [...]
            titles = response.data;
            total = titles.length;
            totalPages = Math.ceil(total / limit);
            console.log(`[API] Найдено тайтлов: ${titles.length}`);
        } else if (response.data && response.data.titles && Array.isArray(response.data.titles)) {
            // Формат: { titles: [...] }
            titles = response.data.titles;
            total = response.data.total || titles.length;
            totalPages = Math.ceil(total / limit);
            console.log(`[API] Найдено тайтлов: ${titles.length}`);
        } else {
            console.log(`[API] Неизвестный формат ответа:`, typeof response.data, response.data);
        }
        
        return { titles, total, totalPages };
    } catch (error) {
        console.error(`[API] Ошибка получения каталога:`, error.message);
        if (error.response) {
            console.error(`[API] Ответ сервера:`, error.response.status, error.response.data);
        }
        throw error;
    }
}

/**
 * Нормализовать объект тайтла из разных форматов API (в т.ч. Strapi v4: id + attributes)
 */
function normalizeTitle(raw) {
    if (!raw) return null;
    if (raw.attributes && typeof raw.attributes === 'object') {
        const id = raw.id ?? raw.documentId;
        return { _id: id, id, documentId: raw.documentId, ...raw.attributes };
    }
    const id = raw.id ?? raw._id ?? raw.documentId;
    return { ...raw, _id: raw._id ?? id, id: raw.id ?? id };
}

/**
 * Получить информацию о тайтле
 */
async function getTitle(titleId) {
    if (titleId != null && typeof titleId === 'object') {
        titleId = titleId._id ?? titleId.id ?? titleId.documentId ?? null;
        if (titleId != null) titleId = String(titleId);
    }
    if (!titleId || typeof titleId !== 'string') {
        console.warn('[API] getTitle: неверный titleId', titleId);
        return null;
    }
    console.log(`[API] Запрос тайтла: ${titleId}`);
    
    try {
        const response = await apiClient.get(`/titles/${titleId}`);
        
        console.log(`[API] Ответ тайтла: status=${response.status}`);
        
        if (response.data && response.data.success === false) {
            return null;
        }
        const raw = response.data.data ?? response.data;
        const titleData = normalizeTitle(raw);
        console.log(`[API] Данные тайтла:`, titleData ? JSON.stringify(titleData).substring(0, 500) : 'null');
        
        return titleData;
    } catch (error) {
        console.error(`[API] Ошибка получения тайтла ${titleId}:`, error.message);
        if (error.response) {
            console.error(`[API] Ответ сервера:`, error.response.status, error.response.data);
        }
        throw error;
    }
}

/**
 * Получить количество глав тайтла (при ошибке API возвращаем 0, чтобы карточка тайтла всё равно открылась)
 */
async function getChapterCount(titleId) {
    console.log(`[API] Запрос количества глав для тайтла: ${titleId}`);
    
    try {
        const response = await apiClient.get(`/titles/${titleId}/chapters/count`);
        
        const count = response.data.data?.count ?? response.data.count ?? 0;
        console.log(`[API] Количество глав: ${count}`);
        
        return count;
    } catch (error) {
        console.warn(`[API] Количество глав для ${titleId} недоступно:`, error.message);
        if (error.response) {
            console.warn(`[API] Ответ:`, error.response.status, error.response.data);
        }
        return 0;
    }
}

/**
 * Получить все главы тайтла
 * @param {string} titleId - ID тайтла
 * @param {number} limit - макс. количество глав
 * @param {'asc'|'desc'} sortOrder - порядок: asc (1,2,3...) для списка глав, desc для новостей
 */
async function getAllChapters(titleId, limit = 1000, sortOrder = 'asc') {
    const sort = sortOrder === 'desc' ? 'number:desc' : 'number:asc';
    const response = await apiClient.get(`/chapters/title/${titleId}?sort=${sort}&limit=${limit}`);
    const chaptersData = response.data.data || response.data;
    return Array.isArray(chaptersData) ? chaptersData : chaptersData.chapters || [];
}

/**
 * Получить информацию о главе
 */
function normalizeChapter(chapter) {
    if (!chapter) return null;
    const raw = chapter.attributes ? { ...chapter.attributes, id: chapter.id, ...chapter } : chapter;
    let pages = raw.pages ?? raw.images ?? [];
    if (!Array.isArray(pages)) pages = [];
    const normalizedPages = pages.map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
            const data = p.data ?? p;
            const attrs = data?.attributes ?? data;
            const url =
                attrs?.url ??
                attrs?.formats?.small?.url ??
                attrs?.formats?.medium?.url ??
                p.url ??
                p.image?.url ??
                p.image?.data?.attributes?.url ??
                p.image?.formats?.small?.url ??
                p.image?.formats?.medium?.url;
            if (url) return url;
        }
        return null;
    }).filter(Boolean);
    return { ...raw, pages: normalizedPages };
}

async function getChapter(chapterId) {
    const response = await apiClient.get(`/chapters/${chapterId}`);
    const data = response.data.data || response.data;
    return normalizeChapter(data);
}

/**
 * Обновить главу (например, записать teletypeUrl после создания Instant View).
 * Бэкенд должен поддерживать PATCH /chapters/:id с телом { teletypeUrl } (или instantViewUrl).
 */
async function updateChapter(chapterId, payload) {
    const response = await apiClient.patch(`/chapters/${chapterId}`, payload);
    return response.data.data ?? response.data;
}

/**
 * Получить последние обновления
 * Пробуем разные эндпоинты, т.к. структура API может отличаться
 */
async function getLatestUpdates(limit = 10) {
    console.log(`[API] Запрос последних обновлений: limit=${limit}`);

    // Варианты эндпоинтов для последних обновлений
    const endpoints = [
        `/titles/latest-updates?limit=${limit}`,
        `/chapters/latest?limit=${limit}`,
        `/updates?limit=${limit}`,
        `/chapters?limit=${limit}&sort=createdAt:desc`
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`[API] Пробуем эндпоинт: ${endpoint}`);
            const response = await apiClient.get(endpoint);

            if (response.data && response.data.data) {
                const chaptersData = response.data.data;
                const result = Array.isArray(chaptersData) ? chaptersData : chaptersData.chapters || [];
                if (result.length > 0) {
                    console.log(`[API] Успешно получены обновления через: ${endpoint}, найдено: ${result.length}`);
                    return result;
                }
            } else if (Array.isArray(response.data)) {
                console.log(`[API] Успешно получены обновления через: ${endpoint}, найдено: ${response.data.length}`);
                return response.data;
            }
        } catch (error) {
            console.log(`[API] Ошибка на эндпоинте ${endpoint}: ${error.message}`);
            continue;
        }
    }

    console.log('[API] Не удалось получить обновления ни через один эндпоинт');
    return [];
}

module.exports = {
    getBaseURL,
    searchTitles,
    getCatalog,
    getTitle,
    getChapterCount,
    getAllChapters,
    getChapter,
    updateChapter,
    getLatestUpdates
};

