const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

// Функция для проверки наличия SOI маркера в JPEG файле
function hasSOIMarker(imageBuffer) {
  // SOI маркер - 0xFFD8
  return imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8;
}

// Функция для исправления поврежденных JPEG файлов
async function fixJPEG(imageBuffer) {
  try {
    // Конвертируем в PNG и обратно в JPEG
    const pngBuffer = await sharp(imageBuffer).png().toBuffer();
    const fixedJpegBuffer = await sharp(pngBuffer).jpeg().toBuffer();
    return fixedJpegBuffer;
  } catch (error) {
    console.error('Failed to fix JPEG:', error);
    return imageBuffer;
  }
}

// Функция для создания директории, если она не существует
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Директория не существует, создаем ее
    await fs.mkdir(dirPath, { recursive: true });
  }
}

// Функция для создания PDF из изображений
async function createPDF() {
  // Создаем простое тестовое изображение PNG
  const testPngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG сигнатура
    0x00, 0x00, 0x00, 0x0D, // Длина чанка IHDR
    0x49, 0x48, 0x44, 0x52, // Тип чанка IHDR
    0x00, 0x00, 0x00, 0x01, // Ширина 1 пиксель
    0x00, 0x00, 0x00, 0x01, // Высота 1 пиксель
    0x08, 0x02, 0x00, 0x00, // Параметры изображения
    0x00, 0x00, 0x00, 0x00, // CRC
    0x00, 0x00, 0x00, 0x00, // Данные пикселя
    0x00, 0x00, 0x00, 0x00, // Данные пикселя
    0x00, 0x00, 0x00, 0x00, // Данные пикселя
    0x49, 0x44, 0x41, 0x54, // Тип чанка IDAT
    0x08, 0xD7, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // Данные IDAT
    0x00, 0x00, 0x00, 0x00, 0x00, // CRC
    0x00, 0x00, 0x00, 0x00, // Длина чанка IEND
    0x49, 0x45, 0x4E, 0x44, // Тип чанка IEND
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);
  
  // Создаем массив из трех одинаковых тестовых изображений
  const imagePaths = [
    { buffer: testPngBuffer, type: 'png' },
    { buffer: testPngBuffer, type: 'png' },
    { buffer: testPngBuffer, type: 'png' }
  ];

  // Создаем временную директорию для изображений
  const tempDir = path.join(__dirname, 'temp_images');
  await ensureDir(tempDir);

  try {
    // Создаем новый PDF документ
    const pdfDoc = await PDFDocument.create();
    
    // Проверяем, есть ли успешно загруженные изображения
    if (imagePaths.length === 0) {
      throw new Error('Не удалось загрузить ни одно изображение');
    }
    
    // Добавляем изображения в PDF
    let embeddedImages = 0;
    for (let i = 0; i < imagePaths.length; i++) {
      const imageData = imagePaths[i];
      console.log(`Embedding image ${i + 1}/${imagePaths.length}`);
      
      try {
        let imageEmbed;
        if (imageData.type === 'jpeg') {
          imageEmbed = await pdfDoc.embedJpg(imageData.buffer);
        } else if (imageData.type === 'png') {
          imageEmbed = await pdfDoc.embedPng(imageData.buffer);
        } else {
          // Пробуем встроить как PNG
          try {
            imageEmbed = await pdfDoc.embedPng(imageData.buffer);
          } catch (e) {
            // Если не удалось, пробуем как JPEG
            try {
              imageEmbed = await pdfDoc.embedJpg(imageData.buffer);
            } catch (e2) {
              console.error(`Failed to embed image ${i + 1}`);
              continue;
            }
          }
        }
        
        // Проверяем, что изображение успешно встроено
        if (!imageEmbed) {
          console.error(`Failed to embed image ${i + 1}: imageEmbed is null or undefined`);
          continue;
        }
        
        // Создаем новую страницу с размерами изображения
        const page = pdfDoc.addPage([imageEmbed.width, imageEmbed.height]);
        
        // Рисуем изображение на странице
        page.drawImage(imageEmbed, {
          x: 0,
          y: 0,
          width: imageEmbed.width,
          height: imageEmbed.height,
        });
        
        embeddedImages++;
      } catch (error) {
        console.error(`Error embedding image ${i + 1}:`, error.message);
      }
    }
    
    // Проверяем, есть ли успешно встроенные изображения
    if (embeddedImages === 0) {
      throw new Error('Не удалось встроить ни одно изображение в PDF');
    }
    
    // Сохраняем PDF в файл
    const pdfBytes = await pdfDoc.save();
    const outputPath = path.join(__dirname, 'test-output.pdf');
    await fs.writeFile(outputPath, pdfBytes);
    
    console.log(`PDF successfully created: ${outputPath}`);
  } catch (error) {
    console.error('Error creating PDF:', error);
  } finally {
    // Удаляем временную директорию
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file));
      }
      await fs.rmdir(tempDir);
    } catch (error) {
      console.error('Error cleaning up temp directory:', error);
    }
  }
}

// Вызываем функцию создания PDF
createPDF().catch(console.error);