/**
 * Точка входа в приложение
 */
const { launchBot } = require('./bot/bot');
const { startInstantViewCron } = require('./jobs/instant-view-cron');
const { startChapterNotificationsCron } = require('./jobs/chapter-notifications');

launchBot();
startInstantViewCron();
startChapterNotificationsCron();

