const { test } = require('node:test');
const assert = require('node:assert');
const { buildSources, hhUrl, channelName } = require('../src/sources.js');
const SOURCES = require('../src/sources.json');

test('адрес поиска hh.ru: RSS, вся Россия, свежие сначала, кириллица закодирована', () => {
  const u = new URL(hhUrl({ text: 'стажер python', experience: 'noExperience' }));
  assert.strictEqual(u.origin + u.pathname, 'https://hh.ru/search/vacancy/rss');
  assert.strictEqual(u.searchParams.get('text'), 'стажер python');
  assert.strictEqual(u.searchParams.get('area'), '113');
  assert.strictEqual(u.searchParams.get('order_by'), 'publication_time');
  assert.throws(() => hhUrl({}), /text/);
});

test('имя канала: @, ссылка, проверка', () => {
  assert.strictEqual(channelName('@job_python'), 'job_python');
  assert.strictEqual(channelName('https://t.me/s/job_python'), 'job_python');
  assert.throws(() => channelName('плохое имя'));
});

test('список источников из sources.json', () => {
  const list = buildSources(SOURCES);
  assert.ok(list.filter((s) => s.kind === 'rss').length >= 2);
  assert.ok(list.filter((s) => s.kind === 'telegram').length >= 2);
  for (const s of list) assert.match(s.url, /^https:\/\//);
  assert.strictEqual(new Set(list.map((s) => s.url)).size, list.length, 'источники повторяются');
});
