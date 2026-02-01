const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const axios = require('axios');

// Функция для создания PDF из массива URL изображений
async function createPDFWithImages(imageUrls, outputPath) {
  // Создаем новый PDF документ
  const pdfDoc = await PDFDocument.create();
  
  // Обрабатываем каждое изображение
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      console.log(`Processing image ${i + 1} of ${imageUrls.length}`);
      
      // Загружаем изображение
      const imageResponse = await axios.get(imageUrls[i], {
        responseType: 'arraybuffer'
      });
      
      const imageBytes = imageResponse.data;
      
      // Определяем тип изображения и встраиваем его в PDF
      let imageEmbed;
      if (imageUrls[i].toLowerCase().endsWith('.png')) {
        imageEmbed = await pdfDoc.embedPng(imageBytes);
      } else if (imageUrls[i].toLowerCase().endsWith('.jpg') || imageUrls[i].toLowerCase().endsWith('.jpeg')) {
        imageEmbed = await pdfDoc.embedJpg(imageBytes);
      } else if (imageUrls[i].toLowerCase().endsWith('.webp')) {
        // Для WebP конвертируем в PNG
        const { default: sharp } = await import('sharp');
        const pngBuffer = await sharp(imageBytes).png().toBuffer();
        imageEmbed = await pdfDoc.embedPng(pngBuffer);
      } else {
        // Пытаемся определить тип автоматически
        try {
          imageEmbed = await pdfDoc.embedPng(imageBytes);
        } catch (e) {
          try {
            imageEmbed = await pdfDoc.embedJpg(imageBytes);
          } catch (e2) {
            // Пытаемся конвертировать в PNG
            try {
              const { default: sharp } = await import('sharp');
              const pngBuffer = await sharp(imageBytes).png().toBuffer();
              imageEmbed = await pdfDoc.embedPng(pngBuffer);
            } catch (e3) {
              console.error(`Failed to embed image ${i + 1}`);
              continue;
            }
          }
        }
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
    } catch (error) {
      console.error(`Error processing image ${i + 1}:`, error);
    }
  }
  
  // Сохраняем PDF
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  
  console.log(`PDF created successfully: ${outputPath}`);
}

// Тестовая функция
async function test() {
  // Пример URL изображений (замените на реальные URL)
  const imageUrls = [
    'https://tomilo-lib.ru/uploads/697cecd50d4ff9c207426fb9/1.jpg',
    'https://tomilo-lib.ru/uploads/697cecd50d4ff9c207426fb9/2.jpg',
    'https://tomilo-lib.ru/uploads/697cecd50d4ff9c207426fb9/3.jpg'
  ];
  
  try {
    await createPDFWithImages(imageUrls, 'test-output.pdf');
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Запускаем тест, если файл запущен напрямую
if (require.main === module) {
  test();
}

module.exports = { createPDFWithImages };