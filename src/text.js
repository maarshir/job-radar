// Общие функции для текста: разбор сущностей HTML, очистка от тегов, сравнение строк.
// Файл без зависимостей: подходит для вклейки в узел Code n8n.
'use strict';

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '-', ndash: '-', hellip: '…' };

function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

// HTML в обычный текст: <br> и концы абзацев становятся переносами строк.
function htmlToText(html) {
  const s = String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(s)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Нижний регистр, ё -> е, только буквы и цифры через пробел.
function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(s) {
  const t = normalizeText(s);
  return t ? t.split(' ') : [];
}

// Первая непустая строка без эмодзи и значков по краям, не длиннее max знаков.
function firstLine(text, max = 120) {
  const line = String(text || '')
    .split('\n')
    .map((l) => l.replace(/^[^\p{L}\p{N}]+|[\s:,;\-]+$/gu, '').trim())
    .find(Boolean);
  if (!line) return '';
  return line.length > max ? line.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : line;
}

if (typeof module !== 'undefined') {
  module.exports = { decodeEntities, htmlToText, normalizeText, tokens, firstLine };
}
