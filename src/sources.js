// Список источников для узла «Источники»: поиски hh.ru, ленты RSS, каналы Телеграма.
// На выходе по одному адресу на источник: { kind, name, url }.
'use strict';

// В песочнице узла Code n8n нет URL и URLSearchParams, поэтому адреса
// собираются и проверяются вручную.

// Общие параметры поиска hh.ru: вся Россия, сначала свежие. Параметры источника важнее.
const HH_DEFAULTS = { area: '113', order_by: 'publication_time', items_on_page: '50' };

function hhUrl(params = {}) {
  const all = { ...HH_DEFAULTS, ...params };
  if (!String(all.text || '').trim()) throw new Error('у поиска hh.ru нет text');
  const query = Object.entries(all)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return 'https://hh.ru/search/vacancy/rss?' + query;
}

function channelName(channel) {
  const name = String(channel || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\/(s\/)?/i, '');
  if (!/^[A-Za-z0-9_]{4,64}$/.test(name)) throw new Error(`неверное имя канала: ${channel}`);
  return name;
}

function buildSources(config = {}) {
  const out = [];
  for (const s of config.hh || []) out.push({ kind: 'rss', name: s.name, url: hhUrl(s.params) });
  for (const s of config.rss || []) {
    const url = String(s.url || '').trim();
    const m = url.match(/^https?:\/\/([^\/?#\s]+)[^\s]*$/i);
    if (!m) throw new Error(`лента не http(s): ${s.url}`);
    out.push({ kind: 'rss', name: s.name || m[1].toLowerCase(), url });
  }
  for (const s of config.telegram || []) {
    const ch = channelName(s.channel);
    out.push({ kind: 'telegram', name: s.name || '@' + ch, url: `https://t.me/s/${ch}` });
  }
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { HH_DEFAULTS, hhUrl, channelName, buildSources };
}
