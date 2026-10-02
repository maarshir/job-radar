const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeUrl, findKeywords, similarity, filterVacancies } = require('../src/filter.js');
const CONFIG = require('../src/filter.config.json');

const NOW = '2026-10-02T12:00:00Z';
const v = (o) => ({ date: '2026-10-02T08:00:00Z', text: '', source: 'test', ...o });

test('ссылка: без меток hh.ru, www и косой черты', () => {
  assert.strictEqual(normalizeUrl('https://www.hh.ru/vacancy/1/?query=python&hhtmFrom=rss'), 'hh.ru/vacancy/1');
  assert.strictEqual(normalizeUrl('https://t.me/job_python/5'), 't.me/job_python/5');
  assert.strictEqual(normalizeUrl(''), '');
});

test('ключевые слова: начало слова, короткие только целиком', () => {
  assert.deepStrictEqual(findKeywords('Стажировка в команде ИИ', ['стажировк', 'ии']), ['стажировк', 'ии']);
  assert.deepStrictEqual(findKeywords('Миила', ['ии']), []);
  assert.deepStrictEqual(findKeywords('Пишем чат-ботов', ['ботов']), ['ботов']);
});

test('похожесть: одна вакансия в двух каналах похожа, разные нет', () => {
  const a = 'Стажёр Python разработчик в Пример, задачи: боты, FastAPI, базы данных, удалённо';
  const b = 'Стажер Python-разработчик в Пример. Задачи: боты, FastAPI, базы данных. Удалённо!';
  const c = 'Junior аналитик данных в Другой компании, SQL, отчёты, офис в Москве';
  assert.ok(similarity(a, b) >= 0.8);
  assert.ok(similarity(a, c) < 0.3);
  assert.strictEqual(similarity('коротко', 'коротко'), 0);
});

test('отбор: причины отказа и порядок', () => {
  const items = [
    v({ title: 'Стажёр Python-разработчик', link: 'https://hh.ru/vacancy/1?query=a' }),
    v({ title: 'Стажёр Python-разработчик', link: 'https://hh.ru/vacancy/1?query=b' }),
    v({ title: 'Senior Python Developer', link: 'https://hh.ru/vacancy/2' }),
    v({ title: 'Бухгалтер', link: 'https://hh.ru/vacancy/3' }),
    v({ title: 'Junior Python', link: 'https://hh.ru/vacancy/4', date: '2026-09-01T00:00:00Z' }),
    v({ title: '', link: 'https://hh.ru/vacancy/5' }),
    v({ title: 'Разработчик ботов', link: 'https://t.me/a/1', text: 'Python, aiogram, база данных, удалённо, стажировка' }),
    v({ title: 'Разработчик ботов', link: 'https://t.me/b/9', text: 'Python, aiogram, база данных, удалённо, стажировка' }),
  ];
  const { accepted, rejected } = filterVacancies(items, CONFIG, [], { now: NOW });
  assert.deepStrictEqual(accepted.map((x) => x.link), ['https://hh.ru/vacancy/1?query=a', 'https://t.me/a/1']);
  assert.deepStrictEqual(
    rejected.map((x) => x.reason),
    ['повтор ссылки', 'стоп-слово в заголовке', 'нет ключевых слов', 'старое объявление', 'нет заголовка или ссылки', 'похожая вакансия уже была']
  );
});

test('отбор: журнал прошлых запусков учитывается', () => {
  const seen = [{ link: 'https://hh.ru/vacancy/1', title: 'Стажёр Python-разработчик', text: '' }];
  const { accepted, rejected } = filterVacancies(
    [v({ title: 'Стажёр Python-разработчик', link: 'https://hh.ru/vacancy/1?hhtmFrom=x' })],
    CONFIG,
    seen,
    { now: NOW }
  );
  assert.strictEqual(accepted.length, 0);
  assert.strictEqual(rejected[0].reason, 'повтор ссылки');
});
