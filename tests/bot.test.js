const { test } = require('node:test');
const assert = require('node:assert');
const { createJournal } = require('../src/journal.js');
const { createSettings, minScoreOf } = require('../src/settings.js');
const { createRuns } = require('../src/runs.js');
const { normalizeUrl } = require('../src/filter.js');
const { handleUpdates, mskMidnight, when, BTN } = require('../src/bot.js');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {}
const skip = DatabaseSync ? false : 'нет node:sqlite (нужен Node 22.5+)';

const NOW = '2026-10-04T17:00:00.000Z'; // 20:00 по Москве
const ago = (min) => new Date(Date.parse(NOW) - min * 60000).toISOString();

function setup(t = NOW) {
  const db = new DatabaseSync(':memory:');
  const clock = { t };
  const journal = createJournal(db, { normalizeUrl, now: () => clock.t });
  const settings = createSettings(db);
  const runs = createRuns(db, { now: () => clock.t });
  journal.init();
  settings.init();
  runs.init();
  const ctx = () => ({ chatId: '42', journal, settings, runs, now: NOW, minScore: minScoreOf(settings, 7) });
  const say = (text) => handleUpdates([{ update_id: 1, message: { chat: { id: 42 }, text } }], ctx()).actions;
  const press = (data) =>
    handleUpdates([{ update_id: 2, callback_query: { id: 'q', data, message: { chat: { id: 42 } } } }], ctx()).actions.slice(1);
  const vacancy = (n, score, status = 'rejected') => {
    const link = `https://hh.ru/vacancy/${n}`;
    journal.collected({ title: `Вакансия ${n}`, link, source: 'почта: hh.ru' });
    const f = { reason: `причина ${n}`, company: 'Пример', letter: score >= 5 ? 'Здравствуйте!' : '' };
    if (status === 'matched') journal.matched(link, score, f.reason, f);
    else journal.rejected(link, `ниже порога (${score})`, score, f);
  };
  return { journal, settings, runs, clock, say, press, vacancy };
}

test('время по Москве и начало суток', () => {
  assert.strictEqual(when('2026-10-04T16:40:36Z', NOW), '19:40');
  assert.strictEqual(when('2026-10-03T16:40:36Z', NOW), '03.10 19:40');
  assert.strictEqual(mskMidnight(NOW), '2026-10-03T21:00:00.000Z');
});

test('проверка: сбор не запускался, стоит, ошибки источников и нейросети', { skip }, () => {
  const b = setup();
  assert.match(b.say(BTN.check)[0].body.text, /ни разу не запускался/);

  b.clock.t = ago(40);
  b.runs.start({ sources: 3, failed: [], found: 0, sent: 0 });
  assert.match(b.say(BTN.check)[0].body.text, /Последний сбор был в 19:20, 40 мин назад/);

  b.clock.t = ago(3);
  b.runs.start({ sources: 3, failed: ['Работа России: Python'], found: 2, sent: 2 });
  b.runs.finish({ scored: 1, matched: 0, llmErrors: 1 });
  const text = b.say(BTN.check)[0].body.text;
  assert.match(text, /Сбор работает, последний запуск в 19:57/);
  assert.match(text, /Не ответили источники: Работа России: Python/);
  assert.match(text, /Нейросеть не ответила на 1/);
  assert.match(text, /Вакансий нет/);
});

test('проверка: подходящие за сутки, иначе предложение показать ниже порога', { skip }, () => {
  const b = setup();
  b.runs.start({ sources: 3, found: 0, sent: 0 });
  b.vacancy(1, 6);
  b.vacancy(2, 3);
  const offer = b.say(BTN.check)[0];
  assert.match(offer.body.text, /есть 1 ниже порога 7, лучшая на 6\/10/);
  assert.deepStrictEqual(offer.body.reply_markup.inline_keyboard[0].map((x) => x.callback_data), ['low:4:7', 'low:no']);

  const shown = b.press('low:4:7');
  assert.strictEqual(shown.length, 1);
  assert.match(shown[0].body.text, /<b>Вакансия 1<\/b> · Пример/);
  assert.match(shown[0].body.text, /<pre>Здравствуйте!<\/pre>/);
  // Показанное второй раз не предлагается.
  assert.match(b.say(BTN.check)[0].body.text, /Вакансий нет/);
  assert.match(b.press('low:4:7')[0].body.text, /больше нет/);
  assert.match(b.press('low:no')[0].body.text, /не показываю/);

  b.vacancy(3, 9, 'matched');
  assert.match(b.say(BTN.check)[0].body.text, /За сутки подошло вакансий: 1\. Последняя: <a href="https:\/\/hh\.ru\/vacancy\/3">Вакансия 3<\/a> \(9\/10\)/);
});

test('порог: кнопки, сохранение, предложение показать пропущенные', { skip }, () => {
  const b = setup();
  const menu = b.say(BTN.score)[0].body;
  assert.match(menu.text, /Сейчас порог 7/);
  assert.ok(menu.reply_markup.inline_keyboard.flat().some((x) => x.text === '• 7 •'));
  b.vacancy(1, 6);
  b.vacancy(2, 5);
  b.vacancy(3, 4);
  const res = b.press('score:5');
  assert.match(res[0].body.text, /Порог теперь 5/);
  assert.strictEqual(b.settings.get('min_score'), '5');
  assert.match(res[1].body.text, /2 вак\. с оценкой от 5 не пришли/);
  // Кнопка помнит прежний порог: показываются оценки от 5 до 7, оценка 4 нет.
  assert.strictEqual(res[1].body.reply_markup.inline_keyboard[0][0].callback_data, 'low:5:7');
  assert.deepStrictEqual(b.press('low:5:7').map((a) => a.body.text.match(/<b>(.+?)<\/b>/)[1]), ['Вакансия 1', 'Вакансия 2']);
  // Повышение порога ничего не предлагает.
  assert.strictEqual(b.press('score:9').length, 1);
  assert.strictEqual(b.press('score:abc')[0].body.reply_markup.keyboard.length, 2);
});

test('статистика и меню', { skip }, () => {
  const b = setup();
  b.vacancy(1, 8, 'matched');
  b.vacancy(2, 4);
  b.journal.collected({ title: 'Водитель', link: 'https://hh.ru/vacancy/9' });
  b.journal.rejected('https://hh.ru/vacancy/9', 'нет ключевых слов');
  b.runs.start({ sources: 3, found: 2, sent: 2 });
  const text = b.say(BTN.stats)[0].body.text;
  assert.match(text, /Порог сейчас: 7 из 10/);
  assert.match(text, /<b>Сегодня:<\/b> собрано 3, оценено нейросетью 2, подошло 1, ниже порога 1, отсеяно фильтром 1/);
  assert.match(text, /Последний сбор: 20:00, новых вакансий 2, в нейросеть ушло 2/);
  const menu = b.say('/start')[0].body;
  assert.deepStrictEqual(menu.reply_markup.keyboard.flat().map((x) => x.text), [BTN.check, BTN.stats, BTN.score]);
});

test('чужие чаты молчат, смещение всегда двигается', { skip }, () => {
  const b = setup();
  const r = handleUpdates(
    [
      { update_id: 5, message: { chat: { id: 7 }, text: BTN.stats } },
      { update_id: 6, callback_query: { id: 'q', data: 'score:3', message: { chat: { id: 7 } } } },
    ],
    { chatId: '42', journal: b.journal, settings: b.settings, runs: b.runs, now: NOW, minScore: 7 }
  );
  assert.deepStrictEqual(r, { actions: [], offset: 7 });
  assert.strictEqual(b.settings.get('min_score'), null);
});
