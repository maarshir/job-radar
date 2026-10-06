'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { requiredExperience, filterVacancies } = require('../src/filter.js');
const cfg = require('../src/filter.config.json');

test('опыт из текста', () => {
  assert.strictEqual(requiredExperience('Требуется опыт работы от 3 лет на Python'), 3);
  assert.strictEqual(requiredExperience('Опыт, лет: 2'), 2);
  assert.strictEqual(requiredExperience('не менее 2 лет коммерческого опыта'), 2);
  assert.strictEqual(requiredExperience('Python 3+ года'), 3);
  assert.strictEqual(requiredExperience('3+ years of experience'), 3);
  assert.strictEqual(requiredExperience('Опыт от 1 года'), 1);
  assert.strictEqual(requiredExperience('Стажировка, опыт не нужен, Python 3.11'), null);
});

test('фильтр уровня', () => {
  const now = '2026-10-06T10:00:00Z';
  const v = (title, text) => ({ title, text, link: 'https://x.ru/' + title, date: now });
  const { accepted, rejected } = filterVacancies(
    [v('Middle Python developer', 'python'), v('Python разработчик', 'Опыт работы от 3 лет'), v('Стажер Python', 'без опыта'), v('Junior бэкенд', 'опыт от 1 года, python')],
    cfg, [], { now }
  );
  assert.deepStrictEqual(accepted.map((a) => a.title), ['Стажер Python', 'Junior бэкенд']);
  assert.strictEqual(rejected.length, 2);
});
