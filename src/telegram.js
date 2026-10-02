// Разбор веб-страницы канала Телеграма t.me/s/<канал>: последние ~20 постов.
// Страница открыта без входа, если у канала включён предпросмотр.
// Возвращает посты { channel, id, link, text, date }, пустые посты пропускаются.
'use strict';

// В узле Code n8n text.js вклеен раньше под именем textLib, require там закрыт.
const { htmlToText } = typeof textLib !== 'undefined' ? textLib : require('./text.js');

function parseChannelPage(html) {
  const parts = String(html ?? '').split(/data-post="/).slice(1);
  const posts = [];
  for (const part of parts) {
    const head = part.match(/^([A-Za-z0-9_]+)\/(\d+)"/);
    if (!head) continue;
    // Текст поста; цитата из ответа на другой пост (js-message_reply_text) не берётся.
    const body = part.match(/<div class="tgme_widget_message_text[^"]*js-message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const text = body ? htmlToText(body[1]) : '';
    if (!text) continue;
    const time = part.match(/<time[^>]*datetime="([^"]+)"/);
    const t = time ? Date.parse(time[1]) : NaN;
    posts.push({
      channel: head[1],
      id: Number(head[2]),
      link: `https://t.me/${head[1]}/${head[2]}`,
      text,
      date: Number.isFinite(t) ? new Date(t).toISOString() : null,
    });
  }
  return posts;
}

if (typeof module !== 'undefined') {
  module.exports = { parseChannelPage };
}
