const axios = require('axios');
const { API_BASE_URL, BOT_API_SECRET } = require('./config');

const botApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    ...(BOT_API_SECRET ? { 'X-Bot-Api-Secret': BOT_API_SECRET } : {}),
  },
});

function unwrap(response) {
  return response.data?.data ?? response.data;
}

async function getLinkedUser(telegramUserId) {
  const response = await botApi.get(`/telegram/bot/user/${telegramUserId}`);
  return unwrap(response);
}

async function linkAccount(code, telegramUserId, chatId, username) {
  const response = await botApi.post('/telegram/bot/link', {
    code: code.trim().toUpperCase(),
    telegramUserId,
    chatId,
    username,
  });
  return unwrap(response);
}

async function getBookmarks(telegramUserId) {
  const response = await botApi.get(`/telegram/bot/bookmarks/${telegramUserId}`);
  return unwrap(response);
}

async function getChapterForUser(telegramUserId, chapterId) {
  const response = await botApi.get(`/telegram/bot/chapters/${chapterId}`, {
    params: { telegramUserId },
  });
  return unwrap(response);
}

module.exports = {
  getLinkedUser,
  linkAccount,
  getBookmarks,
  getChapterForUser,
};
