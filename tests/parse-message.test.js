const { test } = require('node:test');
const assert = require('node:assert');
const { parseScore } = require('../src/parse.js');
const { buildDigest, formatVacancy, formatCard, buildCards } = require('../src/message.js');
const { fillPrompt } = require('../src/fill.js');

const answer = (o) => '```json\n' + JSON.stringify(o) + '\n```';

test('оценка: годный ответ, порог, не вакансия, мусор', () => {
  const ok = parseScore(answer({ vacancy: true, score: '8,5', title: 'Стажёр', company: 'Пример', salary: '', format: 'удалённо', reason: 'Python и боты' }));
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.score, 8.5);
  assert.strictEqual(ok.fields.company, 'Пример');

  const low = parseScore(answer({ score: 5, reason: 'нужен опыт' }), { minScore: 7 });
  assert.deepStrictEqual([low.ok, low.reason, low.fields.reason], [false, 'ниже порога (5)', 'нужен опыт']);
  assert.strictEqual(parseScore(answer({ vacancy: false, score: 0 })).reason, 'не вакансия');
  assert.strictEqual(parseScore('нет json').reason, 'ответ не JSON');
  assert.strictEqual(parseScore(answer({ score: 11 })).reason, 'оценка вне шкалы 0–10');
});

test('подборка: экранирование, сортировка, деление на сообщения', () => {
  const v = (n, score) => ({ title: `Вакансия ${n} <b>`, company: 'A&B', salary: 'от 50 000', format: 'удалённо', score, reason: 'подходит', link: `https://t.me/a/${n}?x="1"`, source: '@a' });
  const one = formatVacancy(v(1, 8));
  assert.match(one, /^<b>Вакансия 1 &lt;b&gt;<\/b> · A&amp;B\nот 50 000 · удалённо\n8\/10: подходит\n<a href="https:\/\/t\.me\/a\/1\?x=&quot;1&quot;">@a<\/a>$/);

  const msgs = buildDigest([v(1, 7), v(2, 9)]);
  assert.strictEqual(msgs.length, 1);
  assert.match(msgs[0], /^Подходящие вакансии: 2\n\n<b>Вакансия 2/);

  const many = buildDigest(Array.from({ length: 40 }, (_, i) => v(i, 8)), { limit: 1000 });
  assert.ok(many.length > 1);
  assert.ok(many.every((m) => m.length <= 1000));
  assert.deepStrictEqual(buildDigest([]), []);
});

test('письмо в ответе: абзацы сохраняются, у неподходящих пусто', () => {
  const r = parseScore(answer({ vacancy: true, score: 9, reason: 'да', letter: 'Здравствуйте!\n\n\n\nДелал   ботов.' }));
  assert.strictEqual(r.fields.letter, 'Здравствуйте!\n\nДелал ботов.');
  assert.strictEqual(parseScore(answer({ score: 9 })).fields.letter, '');
});

test('карточка: вакансия, письмо блоком кода, лимит, сначала лучшие', () => {
  const v = { title: 'Стажёр', company: 'A', score: 8, reason: 'подходит', link: 'https://hh.ru/vacancy/1', source: 'почта: hh.ru', letter: 'Здравствуйте!\nПишу <ботов> & скрипты.' };
  assert.match(formatCard(v), /\n\nСопроводительное письмо:\n<pre>Здравствуйте!\nПишу &lt;ботов&gt; &amp; скрипты\.<\/pre>$/);
  assert.doesNotMatch(formatCard({ ...v, letter: '' }), /Сопроводительное/);
  const long = formatCard({ ...v, letter: 'а'.repeat(5000) });
  assert.ok(long.length <= 4096);
  assert.match(long, /…<\/pre>$/);
  const cards = buildCards([{ ...v, score: 7, title: 'B' }, { ...v, score: 9, title: 'C' }]);
  assert.deepStrictEqual(cards.map((c) => c.match(/<b>(\w)<\/b>/)[1]), ['C', 'B']);
});

test('шаблон промпта заполняется, неизвестное поле видно', () => {
  assert.strictEqual(fillPrompt('{{a}} {{ b }} {{c}}', { a: 1, b: 'x' }), '1 x {{c}}');
});
