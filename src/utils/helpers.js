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
    formatDate,
    formatFileSize
};

