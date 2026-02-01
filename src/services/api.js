/**
 * API сервис для работы с внешним API
 */
const axios = require('axios');
const { API_BASE_URL } = require('../config');

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
});

/**
 * Получить базовый URL без /api для статических файлов
 */
function getBaseURL() {
    return API_BASE_URL.replace('/api', '');
}

/**
 * Поиск тайтлов
 */
async function searchTitles(query, page = 1, limit = 10) {
    const response = await apiClient.get(`/titles?search=${encodeURIComponent(query)}&limit=${limit}&page=${page}`);
    return response.data.data || response.data;
}

/**
 * Получить каталог тайтлов
 */
async function getCatalog(page = 1, limit = 10) {
    const response = await apiClient.get(`/titles?limit=${limit}&page=${page}&sort=createdAt:desc`);
    
    let titles = [];
    let total = 0;
    let totalPages = 0;
    
    if (response.data.data && response.data.data.titles) {
        titles = response.data.data.titles;
        total = response.data.data.pagination.total;
        totalPages = response.data.data.pagination.pages;
    } else if (response.data.data) {
        titles = response.data.data;
        total = response.data.total || titles.length;
        totalPages = Math.ceil(total / limit);
    } else {
        titles = response.data;
        total = titles.length;
        totalPages = Math.ceil(total / limit);
    }
    
    return { titles, total, totalPages };
}

/**
 * Получить информацию о тайтле
 */
async function getTitle(titleId) {
    const response = await apiClient.get(`/titles/${titleId}`);
    return response.data.data || response.data;
}

/**
 * Получить количество глав тайтла
 */
async function getChapterCount(titleId) {
    const response = await apiClient.get(`/titles/${titleId}/chapters/count`);
    return response.data.data?.count || response.data.count || 0;
}

/**
 * Получить все главы тайтла
 */
async function getAllChapters(titleId, limit = 1000) {
    const response = await apiClient.get(`/chapters/title/${titleId}?sort=number:desc&limit=${limit}`);
    const chaptersData = response.data.data || response.data;
    return Array.isArray(chaptersData) ? chaptersData : chaptersData.chapters || [];
}

/**
 * Получить информацию о главе
 */
async function getChapter(chapterId) {
    const response = await apiClient.get(`/chapters/${chapterId}`);
    return response.data.data || response.data;
}

/**
 * Получить последние обновления
 */
async function getLatestUpdates(limit = 10) {
    const response = await apiClient.get(`/titles/latest-updates?limit=${limit}`);
    const chaptersData = response.data.data || response.data;
    return Array.isArray(chaptersData) ? chaptersData : chaptersData.chapters || [];
}

module.exports = {
    getBaseURL,
    searchTitles,
    getCatalog,
    getTitle,
    getChapterCount,
    getAllChapters,
    getChapter,
    getLatestUpdates
};

