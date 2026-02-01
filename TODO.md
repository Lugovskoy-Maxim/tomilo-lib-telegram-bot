# План реструктуризации проекта

## Созданная структура
```
tomilo-lib-telegram-bot/
├── src/
│   ├── app.js              # Точка входа
│   ├── bot/
│   │   ├── bot.js          # Основная конфигурация Telegraf
│   │   ├── commands/       # Команды бота
│   │   │   ├── start.js    # /start
│   │   │   ├── search.js   # /search
│   │   │   ├── catalog.js  # /catalog
│   │   │   └── help.js     # /help
│   │   └── handlers/       # Обработчики callback
│   │       ├── title.js    # Просмотр тайтлов и глав
│   │       └── navigation.js # Навигация по каталогу
│   ├── services/
│   │   └── api.js          # Работа с API
│   ├── utils/
│   │   ├── helpers.js      # Вспомогательные функции
│   │   └── pdf.js          # Генерация PDF
│   └── config/
│       └── index.js        # Конфигурация
├── tests/
│   ├── debug-start.js
│   └── test-bot.js
├── package.json
├── .env
└── README.md
```

## Выполненные задачи

- [x] Создать `src/` директорию
- [x] Создать `src/bot/`, `src/bot/commands/`, `src/bot/handlers/`
- [x] Создать `src/services/`
- [x] Создать `src/utils/`
- [x] Создать `src/config/`
- [x] Создать `tests/`
- [x] Создать `src/config/index.js`
- [x] Создать `src/services/api.js`
- [x] Создать `src/utils/helpers.js`
- [x] Создать `src/utils/pdf.js`
- [x] Создать `src/bot/commands/start.js`
- [x] Создать `src/bot/commands/search.js`
- [x] Создать `src/bot/commands/catalog.js`
- [x] Создать `src/bot/commands/help.js`
- [x] Создать `src/bot/handlers/title.js`
- [x] Создать `src/bot/handlers/navigation.js`
- [x] Создать `src/bot/bot.js`
- [x] Создать `src/app.js`
- [x] Обновить package.json (main на `src/app.js`, scripts)
- [x] Переместить тестовые файлы в `tests/`
- [x] Удалить старые файлы из корня

## Запуск

```bash
# Обычный запуск
npm start

# Режим разработки (с nodemon)
npm run dev
```

