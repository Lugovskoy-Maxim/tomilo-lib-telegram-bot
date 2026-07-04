/**
 * Вспомогательные утилиты
 */
const axios = require('axios');
const sharp = require('sharp');

/**
 * Проверить, является ли файл валидным изображением
 */
async function validateAndFixImage(imageBytes) {
    try {
        const buffer = Buffer.from(imageBytes);

        // Проверяем PNG сигнатуру
        if (buffer.length >= 8 && buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
            return { type: 'png', buffer: imageBytes };
        }

        // Проверяем JPEG сигнатуру
        if (buffer.length >= 2 && buffer.slice(0, 2).toString('hex') === 'ffd8') {
            return { type: 'jpeg', buffer: imageBytes };
        }

        // Проверяем WebP сигнатуру
        if (buffer.length >= 12 && buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
            return { type: 'webp', buffer: imageBytes };
        }

        // Если тип не определен, пробуем конвертировать с помощью sharp
        try {
            const pngBuffer = await sharp(imageBytes).png().toBuffer();
            return { type: 'png', buffer: pngBuffer };
        } catch (sharpError) {
            console.error('Sharp conversion failed:', sharpError.message);
            return null;
        }
    } catch (error) {
        console.error('Image validation error:', error.message);
        return null;
    }
}

/**
 * Проверить наличие SOI маркера в JPEG файле
 */
function hasSOIMarker(imageBuffer) {
    return imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8;
}

/**
 * Исправить поврежденный JPEG файл
 */
async function fixJPEG(imageBuffer) {
    try {
        const pngBuffer = await sharp(imageBuffer).png().toBuffer();
        const fixedJpegBuffer = await sharp(pngBuffer).jpeg().toBuffer();
        return fixedJpegBuffer;
    } catch (error) {
        console.error('Failed to fix JPEG:', error);
        return imageBuffer;
    }
}

/**
 * Скачать изображение по URL
 */
async function downloadImage(imageUrl, baseURL) {
    let fullImageUrl;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        fullImageUrl = imageUrl;
    } else if (imageUrl.startsWith('/uploads/')) {
        fullImageUrl = `${baseURL}${imageUrl}`;
    } else if (imageUrl.startsWith('/')) {
        fullImageUrl = `${baseURL}/uploads${imageUrl}`;
    } else {
        fullImageUrl = `${baseURL}/uploads/${imageUrl}`;
    }

    const response = await axios.get(fullImageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    return response.data;
}

/**
 * Форматировать дату для отображения
 */
function formatDate(dateString) {
    if (!dateString) return 'Дата неизвестна';
    
    return new Date(dateString).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/** Максимальная высота одного фрагмента для статей (Telegraph/Instant View), пикселей */
const MAX_IMAGE_HEIGHT = 4096;

/** Максимальный размер файла для загрузки на Telegraph, байт */
const TELEGRAPH_MAX_FILE_SIZE = 5 * 1024 * 1024;

function mimeFromFormat(format) {
    const f = (format || 'jpeg').toLowerCase();
    if (f === 'png') return 'image/png';
    if (f === 'webp') return 'image/webp';
    return 'image/jpeg';
}

/**
 * Уменьшить размер файла до лимита Telegraph (5 МБ): при необходимости пережать в JPEG.
 * @param {Buffer} buffer - буфер изображения
 * @param {string} mimeType - текущий MIME
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
async function ensureUnderTelegraphLimit(buffer, mimeType) {
    if (buffer.length <= TELEGRAPH_MAX_FILE_SIZE) {
        return { buffer, mimeType };
    }
    let out = buffer;
    for (const quality of [82, 75, 60, 50]) {
        out = await sharp(buffer).jpeg({ quality, mozjpeg: true }).toBuffer();
        if (out.length <= TELEGRAPH_MAX_FILE_SIZE) {
            return { buffer: out, mimeType: 'image/jpeg' };
        }
    }
    return { buffer: out, mimeType: 'image/jpeg' };
}

/**
 * Нарезать длинное изображение на части по высоте (без потери контента).
 * Каждая часть не выше maxHeight пикселей; все части идут в статье подряд.
 * @param {Buffer} imageBuffer - буфер изображения
 * @param {number} [maxHeight=4096] - максимальная высота одного фрагмента
 * @returns {Promise<Array<{ buffer: Buffer, mimeType: string }>>}
 */
async function sliceImageToMaxHeight(imageBuffer, maxHeight = MAX_IMAGE_HEIGHT) {
    const meta = await sharp(imageBuffer).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    const format = (meta.format || 'jpeg').toLowerCase();
    const mimeType = mimeFromFormat(format);

    if (height <= 0 || width <= 0) {
        return [{ buffer: imageBuffer, mimeType }];
    }

    if (height <= maxHeight) {
        const one = await ensureUnderTelegraphLimit(imageBuffer, mimeType);
        return [one];
    }

    const slices = [];
    for (let top = 0; top < height; top += maxHeight) {
        const sliceHeight = Math.min(maxHeight, height - top);
        let sliceBuffer = await sharp(imageBuffer)
            .extract({ left: 0, top, width, height: sliceHeight })
            .toFormat(format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpeg', format === 'jpeg' || format === 'jpg' ? { quality: 90 } : {})
            .toBuffer();
        const wrapped = await ensureUnderTelegraphLimit(sliceBuffer, mimeFromFormat(format));
        slices.push(wrapped);
    }
    return slices;
}

/**
 * Форматировать размер файла
 */
function formatFileSize(bytes) {
    if (bytes > 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
    }
    return `${(bytes / 1024).toFixed(2)} КБ`;
}

module.exports = {
    validateAndFixImage,
    hasSOIMarker,
    fixJPEG,
    downloadImage,
    sliceImageToMaxHeight,
    formatDate,
    formatFileSize
};

