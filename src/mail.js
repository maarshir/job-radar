// Письма с подписками на вакансии: hh.ru, SuperJob, Хабр Карьера, «Работа России».
// Сайты сами присылают новые вакансии по сохранённому поиску, а мы достаём из письма
// ссылки на вакансии, заголовки и кусок текста рядом. Так hh.ru остаётся в сборе
// без API и без обхода защиты: письма приходят к вам на почту официально.
'use strict';

const { htmlToText, decodeEntities } = typeof textLib !== 'undefined' ? textLib : require('./text.js');

// Ссылка на вакансию -> { site, link } в каноническом виде.
const SITES = [
  { site: 'hh.ru', re: /(?:^|[\/.])hh\.ru\/vacancy\/(\d+)/i, link: (m) => `https://hh.ru/vacancy/${m[1]}` },
  {
    site: 'SuperJob',
    re: /(?:^|[\/.])superjob\.ru\/vakansii\/([a-z0-9-]+-\d+)\.html/i,
    link: (m) => `https://www.superjob.ru/vakansii/${m[1].toLowerCase()}.html`,
  },
  { site: 'Хабр Карьера', re: /career\.habr\.com\/vacancies\/(\d+)/i, link: (m) => `https://career.habr.com/vacancies/${m[1]}` },
  {
    site: 'Работа России',
    re: /trudvsem\.ru\/vacancy\/card\/(\d+)\/([0-9a-f-]{36})/i,
    link: (m) => `https://trudvsem.ru/vacancy/card/${m[1]}/${m[2].toLowerCase()}`,
  },
];

// В письмах ссылки часто обёрнуты в переход через сервис рассылки: адрес вакансии
// лежит в параметре, закодированный один или несколько раз.
function unwrapHref(href) {
  let s = decodeEntities(String(href || ''));
  for (let i = 0; i < 3; i++) {
    let d;
    try {
      d = decodeURIComponent(s);
    } catch {
      break;
    }
    if (d === s) break;
    s = d;
  }
  return s;
}

function vacancyLink(href) {
  const s = unwrapHref(href);
  for (const x of SITES) {
    const m = s.match(x.re);
    if (m) return { site: x.site, link: x.link(m) };
  }
  return null;
}

const clean = (s) => htmlToText(s).replace(/\s+/g, ' ').trim();

// mail: { subject, from, date, html, text }. Возвращает записи { title, link, text, date, source }.
// Одна вакансия в письме обычно встречается несколько раз (заголовок, кнопка, картинка):
// берётся ссылка с самым длинным текстом.
function parseJobMail(mail = {}) {
  const html = String(mail.html || '');
  const date = Number.isFinite(Date.parse(mail.date)) ? new Date(Date.parse(mail.date)).toISOString() : null;
  const found = new Map();
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const v = vacancyLink(m[1]);
    if (!v) continue;
    const title = clean(m[2]);
    const end = m.index + m[0].length;
    const after = clean(html.slice(end, end + 3000)).slice(0, 500);
    const old = found.get(v.link);
    if (!old || title.length > old.title.length) {
      found.set(v.link, { title, link: v.link, text: after, date, source: `почта: ${v.site}` });
    }
  }
  // Письмо только текстом: ссылки без тегов, заголовок берётся из строки перед ссылкой.
  if (!found.size && mail.text) {
    const lines = String(mail.text).split('\n').map((l) => l.trim());
    lines.forEach((line, i) => {
      for (const u of line.match(/https?:\/\/\S+/g) || []) {
        const v = vacancyLink(u);
        if (!v || found.has(v.link)) continue;
        const title = line.replace(/https?:\/\/\S+/g, '').trim() || (lines[i - 1] || '');
        found.set(v.link, { title, link: v.link, text: lines.slice(i + 1, i + 6).join(' ').slice(0, 500), date, source: `почта: ${v.site}` });
      }
    });
  }
  return [...found.values()].filter((x) => x.title.length >= 3 && !/^(откликнуться|подробнее|смотреть|открыть)/i.test(x.title));
}

if (typeof module !== 'undefined') {
  module.exports = { SITES, unwrapHref, vacancyLink, parseJobMail };
}
