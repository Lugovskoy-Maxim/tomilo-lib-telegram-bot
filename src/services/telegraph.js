/**
 * Сервис Telegraph (telegra.ph) для автоматического создания статей.
 * Страницы открываются в Telegram как Instant View (как Teletype).
 *
 * Токен: один раз создайте аккаунт (createAccount), сохраните TELEGRAPH_ACCESS_TOKEN в .env.
 */
const axios = require('axios');

const TELEGRAPH_API = 'https://api.telegra.ph';

/**
 * Нормализует URL картинки: пути /chapters/... превращает в /uploads/chapters/...
 * @param {string} url - URL или путь (например /chapters/xxx/001.jpeg)
 * @param {string} baseURL - базовый URL сайта
 * @returns {string} полный URL
 */
function normalizeImageUrl(url, baseURL) {
    if (typeof url !== 'string' || !url) return url;
    if (url.startsWith('http')) return url;
    let path = url.startsWith('/') ? url : `/${url}`;
    if (path.startsWith('/chapters/') && !path.startsWith('/uploads/')) {
        path = '/uploads' + path;
    }
    return baseURL + path;
}

/**
 * Создать аккаунт Telegraph (выполнить один раз, токен сохранить в .env).
 * @param {string} shortName - короткое имя (до 32 символов)
 * @param {string} [authorName] - имя автора
 * @param {string} [authorUrl] - ссылка на автора
 * @returns {Promise<{ access_token: string, auth_url: string }>}
 */
async function createAccount(shortName, authorName = 'TOMILO LIB', authorUrl = 'https://tomilo-lib.ru') {
    const { data } = await axios.post(`${TELEGRAPH_API}/createAccount`, {
        short_name: shortName.substring(0, 32),
        author_name: authorName,
        author_url: authorUrl
    });
    if (!data.ok) {
        throw new Error(data.error || 'Telegraph createAccount failed');
    }
    return { access_token: data.result.access_token, auth_url: data.result.auth_url };
}

/**
 * Создать страницу на Telegraph из данных главы (заголовок + картинки).
 * @param {string} accessToken - TELEGRAPH_ACCESS_TOKEN
 * @param {object} options - { title, authorName, authorUrl, imageUrls }
 * @param {string} options.title - заголовок страницы
 * @param {string[]} options.imageUrls - массив полных URL картинок
 * @param {string} [options.authorName] - автор
 * @param {string} [options.authorUrl] - ссылка на автора
 * @returns {Promise<string>} URL созданной страницы (https://telegra.ph/...)
 */
async function createPage(accessToken, options) {
    const { title, imageUrls = [], authorName = 'TOMILO LIB', authorUrl = 'https://tomilo-lib.ru' } = options;
    const getBaseURL = () => require('./api').getBaseURL();
    const baseURL = getBaseURL();

    const content = [];
    for (const src of imageUrls) {
        const url = normalizeImageUrl(src, baseURL);
        content.push({ tag: 'img', attrs: { src: url } });
    }
    if (content.length === 0) {
        content.push({ tag: 'p', children: ['Нет изображений.'] });
    }

    const { data } = await axios.post(`${TELEGRAPH_API}/createPage`, {
        access_token: accessToken,
        title: title.substring(0, 256),
        author_name: authorName,
        author_url: authorUrl,
        content: content,
        return_content: false
    });

    if (!data.ok) {
        throw new Error(data.error || 'Telegraph createPage failed');
    }
    return data.result.url;
}

/**
 * Создать Instant View (Telegraph) для главы по данным из API.
 * Используется скриптом и эндпоинтом POST /api/create-instant-view.
 * @param {string} accessToken - TELEGRAPH_ACCESS_TOKEN
 * @param {{ chapterId?: string, titleId?: string, chapterIndex?: number, titleIdHint?: string }} input - chapterId ИЛИ titleId + chapterIndex; titleIdHint — подсказка из ленты (если в ответе главы нет titleId)
 * @returns {Promise<string>} URL страницы Telegraph
 */
async function createInstantViewForChapter(accessToken, input) {
    const { getChapter, getTitle, getChapterCount, getAllChapters, getBaseURL } = require('./api');
    const { chapterId: inputChapterId, titleId: inputTitleId, chapterIndex, titleIdHint } = input;

    let chapter;
    let title;
    let titleId;

    function looksLikeId(v) {
        if (v == null || typeof v !== 'string') return false;
        if (/^[a-f0-9]{24}$/i.test(v)) return true;
        if (/^\d+$/.test(v)) return true;
        return false;
    }

    function toTitleIdString(v) {
        if (v == null) return null;
        if (typeof v === 'string' && looksLikeId(v)) return v;
        if (typeof v === 'number') return String(v);
        if (typeof v === 'object') {
            const id = v._id ?? v.id ?? v.documentId;
            return id != null ? String(id) : null;
        }
        return null;
    }

    if (inputChapterId) {
        chapter = await getChapter(inputChapterId);
        const raw = chapter?.attributes ? { ...chapter.attributes, ...chapter } : chapter;
        const fromChapter =
            raw.titleId ??
            raw.title_id ??
            raw.title?._id ??
            raw.title?.id ??
            raw.title?.documentId ??
            (typeof raw.title === 'number' ? String(raw.title) : null) ??
            (typeof raw.title === 'object' && raw.title != null ? (raw.title._id ?? raw.title.id ?? raw.title.documentId) : null);
        titleId = toTitleIdString(fromChapter) ?? (looksLikeId(titleIdHint) ? titleIdHint : null);
        if (!titleId) throw new Error('У главы не найден titleId (title или titleId в ответе API)');
        title = await getTitle(titleId);
    } else if (inputTitleId != null && Number.isInteger(chapterIndex)) {
        const tid = toTitleIdString(inputTitleId) || inputTitleId;
        const total = await getChapterCount(tid);
        const allChapters = await getAllChapters(tid, total, 'asc');
        const summary = allChapters[chapterIndex];
        if (!summary) throw new Error('Глава не найдена');
        const cid = summary._id ?? summary.id;
        chapter = await getChapter(cid);
        title = await getTitle(tid);
        titleId = tid;
    } else {
        throw new Error('Укажите chapterId либо titleId и chapterIndex');
    }

    if (!title) throw new Error('Тайтл не найден');

    const rawChapter = chapter?.attributes ? { ...chapter.attributes, ...chapter } : chapter;
    const titleName = title.name || title.title || 'Без названия';
    const chapterNum = rawChapter.number ?? rawChapter.chapterNumber ?? chapter.number ?? chapter.chapterNumber ?? 'N/A';
    const pageTitle = `${titleName} — Глава ${chapterNum}`;

    const pagesRaw = rawChapter.pages ?? chapter.pages ?? chapter.attributes?.pages ?? [];
    const baseURL = getBaseURL();
    const imageUrls = pagesRaw.map((p) => {
        if (typeof p === 'string') return normalizeImageUrl(p, baseURL);
        if (!p || typeof p !== 'object') return null;
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
        if (!url) return null;
        return normalizeImageUrl(url, baseURL);
    }).filter(Boolean);

    if (imageUrls.length === 0) {
        throw new Error('В этой главе нет изображений для просмотра');
    }

    return createPage(accessToken, {
        title: pageTitle,
        imageUrls,
        authorName: 'TOMILO LIB',
        authorUrl: 'https://tomilo-lib.ru'
    });
}

module.exports = {
    createAccount,
    createPage,
    createInstantViewForChapter
};
