const { test } = require('node:test');
const assert = require('node:assert');
const { createJournal } = require('../src/journal.js');
const { normalizeUrl } = require('../src/filter.js');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {}
const skip = DatabaseSync ? false : 'нет node:sqlite (нужен Node 22.5+)';

function open(now = () => '2026-10-02T12:00:00.000Z') {
  const j = createJournal(new DatabaseSync(':memory:'), { normalizeUrl, now });
  j.init();
  return j;
}

test('запись, повтор, отказ с причиной, подходящая', { skip }, () => {
  const j = open();
  const a = j.collected({ title: 'Стажёр', link: 'https://hh.ru/vacancy/1?query=x', text: 'текст', source: 'hh' });
  assert.strictEqual(a.added, true);
  assert.strictEqual(j.collected({ title: 'Стажёр', link: 'https://hh.ru/vacancy/1' }).added, false);
  assert.throws(() => j.rejected('https://hh.ru/vacancy/1', ''), /причина/);
  j.collected({ title: 'Джун', link: 'https://hh.ru/vacancy/2' });
  j.rejected('https://hh.ru/vacancy/2', 'ниже порога (4)', 4);
  j.matched('https://hh.ru/vacancy/1', 8, 'подходит');
  assert.throws(() => j.rejected('https://hh.ru/vacancy/1', 'поздно'), /закрыта/);
  const s = j.stats();
  assert.strictEqual(s.matched, 1);
  assert.deepStrictEqual(s.reasons, [{ reason: 'ниже порога (4)', count: 1 }]);
  assert.deepStrictEqual(j.seen(30).map((x) => x.text), ['текст', '']);
});

test('forget убирает незакрытую запись', { skip }, () => {
  const j = open();
  j.collected({ title: 'Стажёр', link: 'https://t.me/a/1' });
  assert.strictEqual(j.forget('https://t.me/a/1'), true);
  assert.strictEqual(j.get('https://t.me/a/1'), null);
  assert.strictEqual(j.forget('https://t.me/a/1'), false);
});

test('seen берёт только свежие записи', { skip }, () => {
  let t = '2026-08-01T00:00:00.000Z';
  const j = open(() => t);
  j.collected({ title: 'Старая', link: 'https://t.me/a/1' });
  t = '2026-10-02T00:00:00.000Z';
  j.collected({ title: 'Новая', link: 'https://t.me/a/2' });
  assert.deepStrictEqual(j.seen(30).map((x) => x.title), ['Новая']);
});
