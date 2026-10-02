const { test } = require('node:test');
const assert = require('node:assert');
const { htmlToText, firstLine, decodeEntities } = require('../src/text.js');
const { parseFeed } = require('../src/rss.js');
const { parseChannelPage } = require('../src/telegram.js');
const { rssHh, atom, tgPage } = require('./fixtures.js');

test('текст: сущности, теги, первая строка', () => {
  assert.strictEqual(decodeEntities('&amp;&lt;&#33;&#x41;&nbsp;&unknown;'), '&<!A &unknown;');
  assert.strictEqual(htmlToText('<p>Раз</p><p>Два<br>три</p>'), 'Раз\nДва\nтри');
  assert.strictEqual(firstLine('\n🔥 Стажёр Python:\nдальше'), 'Стажёр Python');
  assert.ok(firstLine('а'.repeat(300), 50).length <= 50);
});

test('RSS 2.0: заголовок из CDATA, ссылка, текст без тегов, дата в ISO', () => {
  const items = parseFeed(rssHh);
  assert.strictEqual(items.length, 4);
  assert.deepStrictEqual(items[0], {
    title: 'Стажёр Python-разработчик',
    link: 'https://hh.ru/vacancy/1001?query=python&hhtmFrom=rss',
    text: 'Компания: Пример. Python, FastAPI, боты.',
    date: '2026-10-01T06:00:00.000Z',
  });
  assert.strictEqual(items[2].title, 'Junior разработчик чат-ботов & автоматизации');
});

test('Atom: ссылка из href', () => {
  const [e] = parseFeed(atom);
  assert.strictEqual(e.link, 'https://example.com/jobs/7');
  assert.strictEqual(e.text, 'LLM и Python');
  assert.strictEqual(e.date, '2026-10-01T12:00:00.000Z');
});

test('мусор вместо ленты: пустой список', () => {
  assert.deepStrictEqual(parseFeed('<html>не лента</html>'), []);
  assert.deepStrictEqual(parseFeed(undefined), []);
});

test('страница канала: посты с текстом, без цитат и пустых', () => {
  const posts = parseChannelPage(tgPage);
  assert.strictEqual(posts.length, 2);
  assert.deepStrictEqual(posts[0], {
    channel: 'job_python',
    id: 501,
    link: 'https://t.me/job_python/501',
    text: '🔥Стажёр Python-разработчик @ Пример\n\nБоты, FastAPI, подробнее "удалённо"',
    date: '2026-10-01T09:00:00.000Z',
  });
  assert.strictEqual(posts[1].id, 503);
  assert.deepStrictEqual(parseChannelPage('<html></html>'), []);
});
