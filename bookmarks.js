const { Markup } = require('telegraf');
const { getLinkedUser, getBookmarks } = require('./api');

async function showMyTitles(ctx) {
  try {
    const info = await getLinkedUser(ctx.from.id);
    if (!info.linked) {
      await ctx.reply(
        'Привяжите аккаунт сайта, чтобы видеть закладки.\n\nСгенерируйте код в профиле и отправьте: /link КОД',
        Markup.inlineKeyboard([
          Markup.button.url('Профиль на сайте', 'https://tomilo-lib.ru/profile?tab=settings&section=telegram'),
        ]),
      );
      return;
    }

    const bookmarks = await getBookmarks(ctx.from.id);
    const reading = (bookmarks || []).filter(
      (b) => b.category === 'reading' || b.category === 'favorites',
    );

    if (reading.length === 0) {
      await ctx.reply('В закладках «Читаю» и «Избранное» пока нет тайтлов.');
      return;
    }

    const buttons = reading.slice(0, 10).map((b) => {
      const name = b.title?.name || 'Тайтл';
      return [Markup.button.callback(name.slice(0, 40), `view_title_${b.titleId}`)];
    });

    await ctx.reply(`📖 *Мои тайтлы* (${info.username})\n\nВыберите тайтл:`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (error) {
    console.error('showMyTitles error:', error);
    await ctx.reply('Не удалось загрузить закладки. Попробуйте позже.');
  }
}

module.exports = { showMyTitles };
