const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('../scripts/build-workflows.js');
const { rssHh, tgPage } = require('./fixtures.js');

const dir = path.join(__dirname, '..', 'workflows');
const raw = fs.readFileSync(path.join(dir, 'collect.json'), 'utf8');
const wf = JSON.parse(raw);
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {}
const skip = DatabaseSync ? false : 'нет node:sqlite (нужен Node 22.5+)';

const CHAIN = ['Расписание', 'Настройки', 'Источники', 'Загрузка', 'Отбор', 'Промпт', 'Нейросеть', 'Оценка', 'Подборка', 'Отправка'];

test('узлы идут цепочкой, конвейер выключен', () => {
  assert.strictEqual(new Set(wf.nodes.map((n) => n.name)).size, wf.nodes.length);
  for (const name of CHAIN) assert.ok(byName[name], name);
  for (let i = 0; i + 1 < CHAIN.length; i++) {
    assert.strictEqual(wf.connections[CHAIN[i]].main[0][0].node, CHAIN[i + 1], CHAIN[i]);
  }
  assert.strictEqual(wf.active, false);
  const settings = byName['Настройки'].parameters.assignments.assignments.map((a) => a.name);
  for (const k of ['LLM_BASE_URL', 'LLM_MODEL', 'CHAT_ID', 'JR_DB_PATH', 'MAX_ITEMS', 'MIN_SCORE', 'USER_AGENT']) assert.ok(settings.includes(k), k);
});

test('ключей нет, нейросеть через учётные данные, ошибки источников не роняют сбор', () => {
  for (const re of [/\bsk-[A-Za-z0-9_-]{16,}/, /\bgsk_[A-Za-z0-9]{16,}/, /\b\d{8,10}:[A-Za-z0-9_-]{30,}/, /Bearer\s+\w{10,}/i]) {
    assert.doesNotMatch(raw, re);
  }
  assert.doesNotMatch(raw, /\$env\b|process\.env/);
  const llm = byName['Нейросеть'].parameters;
  assert.strictEqual(llm.authentication, 'predefinedCredentialType');
  assert.strictEqual(llm.nodeCredentialType, 'openAiApi');
  assert.match(llm.url, /\/chat\/completions$/);
  const load = byName['Загрузка'];
  assert.strictEqual(load.onError, 'continueRegularOutput');
  assert.strictEqual(load.parameters.options.response.response.responseFormat, 'text');
  assert.deepStrictEqual(load.parameters.headerParameters.parameters.map((p) => p.name), ['User-Agent']);
  const tg = byName['Отправка'].parameters;
  assert.strictEqual(tg.additionalFields.parse_mode, 'HTML');
  assert.match(tg.chatId, /CHAT_ID/);
});

test('код узлов совпадает с src/ (npm run build)', () => {
  assert.deepStrictEqual(build({ write: false }), []);
});

test('узлам Code нужен только node:sqlite', () => {
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    const code = n.parameters.jsCode;
    const mods = [...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    for (const m of mods) {
      if (m === 'node:sqlite') continue;
      // ./text.js внутри модулей запасной: в узле text.js вклеен раньше как textLib.
      assert.strictEqual(m, './text.js', `${n.name}: ${m}`);
      assert.ok(code.indexOf('const textLib') < code.indexOf("require('./text.js')"), `${n.name}: textLib вклеен позже`);
    }
  }
});

// Запуск кода узла вне n8n: $input, $('Узел') и require как в узле.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function runNode(name, input, nodes) {
  const wrap = (items) => ({ all: () => items, first: () => items[0], itemMatching: (i) => items[i] });
  const $ = (n) => {
    if (!nodes[n]) throw new Error(`нет данных узла ${n}`);
    return wrap(nodes[n]);
  };
  const req = (m) => {
    if (m !== 'node:sqlite') throw new Error(`модуль закрыт: ${m}`);
    return require(m);
  };
  return new AsyncFunction('$input', '$', 'require', byName[name].parameters.jsCode)(wrap(input), $, req);
}
const j = (arr) => arr.map((json) => ({ json }));

test('от источников до подборки на подменённых данных', { skip }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-'));
  const db = path.join(tmp, 'j.sqlite');
  const nodes = { Настройки: j([{ JR_DB_PATH: db, MAX_ITEMS: 10, MIN_SCORE: 7 }]) };

  const sources = await runNode('Источники', [], nodes);
  assert.ok(sources.some((s) => s.json.kind === 'telegram'));

  // Один поиск hh.ru, одна страница канала, один недоступный источник.
  nodes['Источники'] = j([
    { kind: 'rss', name: 'hh.ru: тест', url: 'https://hh.ru/search/vacancy/rss?text=x' },
    { kind: 'telegram', name: 'Python Job', url: 'https://t.me/s/job_python' },
    { kind: 'rss', name: 'Сломанный', url: 'https://example.com/rss' },
  ]);
  const pages = j([{ data: rssHh }, { data: tgPage }, { error: { message: '503' } }]);

  // Даты в примерах от 1–2 октября 2026, свежесть считается от текущего времени.
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-10-02T12:00:00Z');
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [RealDate.now()]));
    }
    static now() {
      return RealDate.parse('2026-10-02T12:00:00Z');
    }
  };
  try {
    nodes['Отбор'] = await runNode('Отбор', pages, nodes);
  } finally {
    global.Date = RealDate;
    Date.now = realNow;
  }
  const links = nodes['Отбор'].map((x) => x.json.link);
  assert.deepStrictEqual(links, [
    'https://hh.ru/vacancy/1001?query=python&hhtmFrom=rss',
    'https://hh.ru/vacancy/1003',
    'https://t.me/job_python/501',
    'https://t.me/job_python/503',
  ]);
  assert.strictEqual(nodes['Отбор'][2].json.source, '@job_python');
  assert.strictEqual(nodes['Отбор'][2].json.title, 'Стажёр Python-разработчик @ Пример');

  nodes['Промпт'] = await runNode('Промпт', nodes['Отбор'], nodes);
  const p = nodes['Промпт'][0].json.prompt;
  assert.match(p, /Заголовок: Стажёр Python-разработчик/);
  assert.match(p, /О кандидате:\n\S/);
  assert.doesNotMatch(p, /\{\{/);

  const ans = (o) => ({ choices: [{ message: { content: JSON.stringify(o) } }] });
  const llm = j([
    ans({ vacancy: true, score: 9, title: 'Стажёр Python', company: 'Пример', salary: '', format: 'удалённо', reason: 'Python и боты' }),
    ans({ vacancy: true, score: 4, title: 'Junior', reason: 'мало подходит' }),
    ans({ vacancy: true, score: 8, title: '', company: 'Пример', reason: 'стажировка' }),
    { error: { message: '429' } },
  ]);
  nodes['Оценка'] = await runNode('Оценка', llm, nodes);
  assert.deepStrictEqual(nodes['Оценка'].map((x) => [x.json.title, x.json.score]), [
    ['Стажёр Python', 9],
    ['Стажёр Python-разработчик @ Пример', 8],
  ]);

  const digest = await runNode('Подборка', nodes['Оценка'], nodes);
  assert.strictEqual(digest.length, 1);
  assert.match(digest[0].json.text, /^Подходящие вакансии: 2\n\n<b>Стажёр Python<\/b> · Пример/);

  const { createJournal } = require('../src/journal.js');
  const { normalizeUrl } = require('../src/filter.js');
  const conn = new DatabaseSync(db);
  const journal = createJournal(conn, { normalizeUrl });
  const s = journal.stats();
  assert.strictEqual(s.matched, 2);
  const reasons = Object.fromEntries(s.reasons.map((r) => [r.reason, r.count]));
  assert.deepStrictEqual(reasons, { 'стоп-слово в заголовке': 1, 'старое объявление': 1, 'ниже порога (4)': 1 });
  // Пост без ответа нейросети убран из журнала и придёт снова.
  assert.strictEqual(journal.get('https://t.me/job_python/503'), null);
  conn.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
