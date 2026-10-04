const { test } = require('node:test');
const assert = require('node:assert');
const { trudvsemUrl, parseTrudvsem } = require('../src/trudvsem.js');
const { vacancyLink, parseJobMail } = require('../src/mail.js');
const { createInbox } = require('../src/inbox.js');
const { trudvsemJson, jobMail } = require('./fixtures.js');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {}
const skip = DatabaseSync ? false : 'нет node:sqlite (нужен Node 22.5+)';

test('адрес «Работы России»: регион, свежесть, кириллица закодирована', () => {
  const u = new URL(trudvsemUrl({ text: 'разработчик', region: '7700000000000' }, { now: '2026-10-04T12:00:00Z', days: 4 }));
  assert.strictEqual(u.origin + u.pathname, 'https://opendata.trudvsem.ru/api/v1/vacancies/region/7700000000000');
  assert.strictEqual(u.searchParams.get('text'), 'разработчик');
  assert.strictEqual(u.searchParams.get('limit'), '100');
  assert.strictEqual(u.searchParams.get('modifiedFrom'), '2026-09-30T12:00:00Z');
  assert.match(trudvsemUrl({ text: 'python' }), /\/vacancies\?limit=100&text=python$/);
  assert.throws(() => trudvsemUrl({}), /text/);
  assert.throws(() => trudvsemUrl({ text: 'x', region: '77' }), /региона/);
});

test('ответ «Работы России»: поля, зарплата, ссылка, пустые пропускаются', () => {
  const r = parseTrudvsem(trudvsemJson);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].title, 'Программист Python (стажёр)');
  assert.strictEqual(r[0].link, 'https://trudvsem.ru/vacancy/card/1197746306383/5862d8e8-8a82-11f0-8356-efc3bb2eec02');
  assert.strictEqual(r[0].date, '2026-10-01T00:00:00.000Z');
  assert.match(r[0].text, /Компания: ООО «Пример»/);
  assert.match(r[0].text, /Зарплата: от 60 000 ₽/);
  assert.match(r[0].text, /Писать ботов на Python/);
  assert.match(r[0].text, /Опыт, лет: 0/);
  assert.strictEqual(r[1].link, 'https://trudvsem.ru/vacancy/card/1/x2');
  assert.deepStrictEqual(parseTrudvsem('не json'), []);
  assert.deepStrictEqual(parseTrudvsem('{}'), []);
});

test('ссылки из писем: обёртки рассылок, разные сайты, лишнее мимо', () => {
  assert.deepStrictEqual(vacancyLink('https://r.example.com/?to=https%253A%252F%252Fhh.ru%252Fvacancy%252F77'), { site: 'hh.ru', link: 'https://hh.ru/vacancy/77' });
  assert.strictEqual(vacancyLink('https://www.superjob.ru/vakansii/stazher-python-50123.html?x=1').link, 'https://www.superjob.ru/vakansii/stazher-python-50123.html');
  assert.strictEqual(vacancyLink('https://career.habr.com/vacancies/1000?x=1').site, 'Хабр Карьера');
  assert.strictEqual(vacancyLink('https://hh.ru/applicant/settings'), null);
  assert.strictEqual(vacancyLink('https://nothh.ru.example.com/x'), null);
});

test('письмо подписки -> вакансии с заголовком и текстом рядом', () => {
  const r = parseJobMail({ ...jobMail, html: jobMail.textHtml });
  assert.deepStrictEqual(r.map((x) => [x.link, x.title, x.source]), [
    ['https://hh.ru/vacancy/2001', 'Младший разработчик чат-ботов', 'почта: hh.ru'],
    ['https://career.habr.com/vacancies/3005', 'Стажёр по языковым моделям', 'почта: Хабр Карьера'],
  ]);
  assert.match(r[0].text, /^ООО Ромашка · от 70 000 ₽ · Можно удалённо/);
  assert.strictEqual(r[0].date, '2026-10-02T07:00:00.000Z');

  const plain = parseJobMail({ text: 'Junior Python\nhttps://hh.ru/vacancy/9?from=mail\nКомпания В' });
  assert.deepStrictEqual(plain.map((x) => [x.title, x.link]), [['Junior Python', 'https://hh.ru/vacancy/9']]);
  assert.deepStrictEqual(parseJobMail({}), []);
});

test('очередь писем: без повторов, забранное удаляется', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  const inbox = createInbox(db);
  inbox.init();
  const v = { title: 'A', link: 'https://hh.ru/vacancy/1', text: 't', source: 'почта: hh.ru' };
  assert.strictEqual(inbox.add([v, v, { title: '', link: 'x' }]), 1);
  const got = inbox.take();
  assert.deepStrictEqual(got.map((x) => [x.link, x.fromMail]), [['https://hh.ru/vacancy/1', true]]);
  assert.deepStrictEqual(inbox.take(), []);
  db.close();
});
