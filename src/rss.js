// Разбор ленты RSS 2.0 или Atom без сторонних библиотек.
// Возвращает записи { title, link, text, date }. Текст без тегов.
'use strict';

// В узле Code n8n text.js вклеен раньше под именем textLib, require там закрыт.
const { htmlToText, decodeEntities } = typeof textLib !== 'undefined' ? textLib : require('./text.js');

function unwrap(s) {
  const m = String(s ?? '').match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : decodeEntities(s);
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  return m ? unwrap(m[1]).trim() : '';
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) || links.find((a) => !/rel=/i.test(a)) || links[0];
  const href = pick && pick.match(/href=["']([^"']+)["']/i);
  return href ? decodeEntities(href[1]) : '';
}

function toIso(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function parseFeed(xml) {
  const s = String(xml ?? '');
  const items = [...s.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  if (items.length) {
    return items.map((b) => ({
      title: htmlToText(tag(b, 'title')),
      link: tag(b, 'link') || tag(b, 'guid'),
      text: htmlToText(tag(b, 'description') || tag(b, 'content:encoded')),
      date: toIso(tag(b, 'pubDate') || tag(b, 'dc:date')),
    }));
  }
  return [...s.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => {
    const b = m[1];
    return {
      title: htmlToText(tag(b, 'title')),
      link: atomLink(b),
      text: htmlToText(tag(b, 'summary') || tag(b, 'content')),
      date: toIso(tag(b, 'updated') || tag(b, 'published')),
    };
  });
}

if (typeof module !== 'undefined') {
  module.exports = { parseFeed };
}
