const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('../scripts/build-workflows.js');
const { rssHh, tgPage, trudvsemJson, jobMail } = require('./fixtures.js');

const dir = path.join(__dirname, '..', 'workflows');
const raw = fs.readFileSync(path.join(dir, 'collect.json'), 'utf8');
const wf = JSON.parse(raw);
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {}
const skip = DatabaseSync ? false : 'нет node:sqlite (нужен Node 22.5+)';

const CHAIN = ['Расписание', 'Настройки', 'Источники', 'Загрузка', 'Отбор', 'Промпт', 'Нейросеть', 'Оценка', 'Карточки', 'Отправка'];

test('узлы идут цепочкой, конвейер выключен', () => {
  assert.strictEqual(new Set(wf.nodes.map((n) => n.name)).size, wf.nodes.length);
  for (const name of CHAIN) assert.ok(byName[name], name);
  for (let i = 0; i + 1 < CHAIN.length; i++) {
    assert.strictEqual(wf.connections[CHAIN[i]].main[0][0].node, CHAIN[i + 1], CHAIN[i]);
  }
  assert.strictEqual(wf.active, false);
  assert.match(String(wf.id), /^[A-Za-z0-9]{16}$/, 'нужен id для импорта из командной строки');
  assert.strictEqual(byName['Расписание'].parameters.rule.interval[0].minutesInterval, 10);
  // Ветка почты: выключена, пока не заданы учётные данные IMAP.
  assert.strictEqual(byName['Почта'].type, 'n8n-nodes-base.emailReadImap');
  assert.strictEqual(byName['Почта'].disabled, true);
  assert.strictEqual(wf.connections['Почта'].main[0][0].node, 'Письма');
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

test('узлы Code не используют URL и URLSearchParams (в песочнице n8n их нет)', () => {
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    const code = n.parameters.jsCode.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bnew URL\(|URLSearchParams/, n.name);
  }
});

test('узлам Code нужен только node:sqlite', () => {
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    const code = n.parameters.jsCode;
    const mods = [...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    for (const m of mods) {
      if (m === 'node:sqlite') continue;
      // require('./x.js') внутри модулей запасной: в узле x.js вклеен раньше как xLib.
      const lib = (m.match(/^\.\/(\w+)\.js$/) || [])[1];
      assert.ok(lib, `${n.name}: ${m}`);
      const at = code.indexOf(`const ${lib}Lib =`);
      assert.ok(at >= 0 && at < code.indexOf(`require('${m}')`), `${n.name}: ${lib}Lib не вклеен раньше`);
    }
  }
});

// Запуск кода узла вне n8n: $input, $('Узел') и require как в узле.
// URL и URLSearchParams закрыты, как в песочнице n8n 2.x.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function runNode(name, input, nodes, dbPath) {
  const wrap = (items) => ({ all: () => items, first: () => items[0], itemMatching: (i) => items[i] });
  const $ = (n) => {
    if (!nodes[n]) throw new Error(`нет данных узла ${n}`);
    return wrap(nodes[n]);
  };
  const req = (m) => {
    if (m !== 'node:sqlite') throw new Error(`модуль закрыт: ${m}`);
    if (!dbPath) return require(m);
    // Ветка почты берёт путь к базе из константы: в тесте подменяется на временный файл.
    const { DatabaseSync } = require(m);
    return { DatabaseSync: class extends DatabaseSync { constructor() { super(dbPath); } } };
  };
  const code = byName[name].parameters.jsCode;
  return new AsyncFunction('$input', '$', 'require', 'URL', 'URLSearchParams', code)(wrap(input), $, req, undefined, undefined);
}
const j = (arr) => arr.map((json) => ({ json }));

test('от источников и письма до сообщений на подменённых данных', { skip }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-'));
  const db = path.join(tmp, 'j.sqlite');
  const nodes = { Настройки: j([{ JR_DB_PATH: db, MAX_ITEMS: 10, MIN_SCORE: 7 }]) };

  const sources = await runNode('Источники', [], nodes);
  assert.ok(sources.some((s) => s.json.kind === 'telegram'));

  // У «Работы России» в адресе дата: берутся только изменённые за последние дни.
  assert.ok(sources.some((s) => s.json.kind === 'trudvsem' && /modifiedFrom=/.test(s.json.url)));

  // Письмо подписки пришло раньше запуска: вакансии ждут в очереди.
  const mailed = await runNode('Письма', j([jobMail]), nodes, db);
  assert.deepStrictEqual(mailed[0].json, { letters: 1, found: 2, queued: 2 });

  // Один поиск hh.ru, одна страница канала, «Работа России», один недоступный источник.
  nodes['Источники'] = j([
    { kind: 'rss', name: 'hh.ru: тест', url: 'https://hh.ru/search/vacancy/rss?text=x' },
    { kind: 'telegram', name: 'Python Job', url: 'https://t.me/s/job_python' },
    { kind: 'trudvsem', name: 'Работа России: Python', url: 'https://opendata.trudvsem.ru/api/v1/vacancies?text=python' },
    { kind: 'rss', name: 'Сломанный', url: 'https://example.com/rss' },
  ]);
  const pages = j([{ data: rssHh }, { data: tgPage }, { data: trudvsemJson }, { error: { message: '503' } }]);

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
  // Водитель погрузчика отсеян по ключевым словам, вакансии из письма прошли без них.
  assert.deepStrictEqual(links, [
    'https://hh.ru/vacancy/1001?query=python&hhtmFrom=rss',
    'https://hh.ru/vacancy/1003',
    'https://t.me/job_python/501',
    'https://t.me/job_python/503',
    'https://trudvsem.ru/vacancy/card/1197746306383/5862d8e8-8a82-11f0-8356-efc3bb2eec02',
    'https://hh.ru/vacancy/2001',
    'https://career.habr.com/vacancies/3005',
  ]);
  assert.strictEqual(nodes['Отбор'][5].json.fromMail, true);
  assert.strictEqual(nodes['Отбор'][2].json.source, '@job_python');
  assert.strictEqual(nodes['Отбор'][2].json.title, 'Стажёр Python-разработчик @ Пример');

  nodes['Промпт'] = await runNode('Промпт', nodes['Отбор'], nodes);
  const p = nodes['Промпт'][0].json.prompt;
  assert.match(p, /Заголовок: Стажёр Python-разработчик/);
  assert.match(p, /О кандидате:\n\S/);
  assert.doesNotMatch(p, /\{\{/);
  // Письмо пишется с оценки 5, даже если порог выше: вакансии ниже порога можно запросить из бота.
  assert.match(p, /score не ниже 5/);

  const ans = (o) => ({ choices: [{ message: { content: JSON.stringify(o) } }] });
  const llm = j([
    ans({ vacancy: true, score: 9, title: 'Стажёр Python', company: 'Пример', salary: '', format: 'удалённо', reason: 'Python и боты' }),
    ans({ vacancy: true, score: 4, title: 'Junior', reason: 'мало подходит' }),
    ans({ vacancy: true, score: 8, title: '', company: 'Пример', reason: 'стажировка' }),
    { error: { message: '429' } },
    ans({ vacancy: true, score: 3, reason: 'не то' }),
    { error: { message: '429' } },
    ans({ vacancy: true, score: 9, title: 'Стажёр по языковым моделям', reason: 'языковые модели', letter: 'Здравствуйте!\nДелаю ботов.' }),
  ]);
  nodes['Оценка'] = await runNode('Оценка', llm, nodes);
  assert.deepStrictEqual(nodes['Оценка'].map((x) => [x.json.title, x.json.score]), [
    ['Стажёр Python', 9],
    ['Стажёр Python-разработчик @ Пример', 8],
    ['Стажёр по языковым моделям', 9],
  ]);

  const cards = await runNode('Карточки', nodes['Оценка'], nodes);
  assert.strictEqual(cards.length, 3);
  assert.match(cards[0].json.text, /^<b>Стажёр Python<\/b> · Пример/);
  assert.match(cards[1].json.text, /<pre>Здравствуйте!\nДелаю ботов\.<\/pre>$/);

  const { createJournal } = require('../src/journal.js');
  const { normalizeUrl } = require('../src/filter.js');
  const conn = new DatabaseSync(db);
  const journal = createJournal(conn, { normalizeUrl });
  const s = journal.stats();
  assert.strictEqual(s.matched, 3);
  const reasons = Object.fromEntries(s.reasons.map((r) => [r.reason, r.count]));
  assert.deepStrictEqual(reasons, {
    'стоп-слово в заголовке': 1, 'старое объявление': 1, 'нет ключевых слов': 1, 'ниже порога (4)': 1, 'ниже порога (3)': 1,
  });
  // У вакансии ниже порога сохранены поля ответа нейросети: её можно показать из бота.
  const low = journal.below({ from: 0, to: 7 });
  assert.deepStrictEqual(low.map((r) => [r.score, r.why]), [[4, 'мало подходит'], [3, 'не то']]);
  // Журнал запусков: недоступный источник и ошибки нейросети видны боту.
  const { createRuns } = require('../src/runs.js');
  const run = createRuns(conn).last();
  assert.deepStrictEqual(run.failed, ['Сломанный']);
  assert.deepStrictEqual([run.sources, run.sent, run.scored, run.matched, run.llm_errors], [4, 7, 5, 3, 2]);
  assert.ok(run.finished_at);
  // Пост без ответа нейросети убран из журнала и придёт снова.
  assert.strictEqual(journal.get('https://t.me/job_python/503'), null);
  // Вакансия из письма без ответа нейросети вернулась в очередь.
  assert.strictEqual(journal.get('https://hh.ru/vacancy/2001'), null);
  const { createInbox } = require('../src/inbox.js');
  assert.deepStrictEqual(createInbox(conn).take().map((x) => x.link), ['https://hh.ru/vacancy/2001']);
  conn.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Конвейер бота: те же правила, что у сбора, плюс порядок узлов.
const botRaw = fs.readFileSync(path.join(dir, 'bot.json'), 'utf8');
const bot = JSON.parse(botRaw);
const botNodes = Object.fromEntries(bot.nodes.map((n) => [n.name, n]));

test('конвейер бота: цепочка, без ключей, успешные запуски не сохраняются', () => {
  const chain = ['Каждые 10 секунд', 'Настройки бота', 'Смещение', 'Обновления', 'Команды', 'Ответы'];
  for (let i = 0; i + 1 < chain.length; i++) {
    assert.strictEqual(bot.connections[chain[i]].main[0][0].node, chain[i + 1], chain[i]);
  }
  assert.strictEqual(bot.active, false);
  assert.match(String(bot.id), /^[A-Za-z0-9]{16}$/);
  assert.notStrictEqual(bot.id, wf.id);
  const cfg = Object.fromEntries(botNodes['Настройки бота'].parameters.assignments.assignments.map((a) => [a.name, a.value]));
  assert.deepStrictEqual(Object.keys(cfg), ['BOT_TOKEN', 'CHAT_ID', 'JR_DB_PATH', 'MIN_SCORE']);
  assert.strictEqual(cfg.BOT_TOKEN, '');
  assert.strictEqual(cfg.JR_DB_PATH, byName['Настройки'].parameters.assignments.assignments.find((a) => a.name === 'JR_DB_PATH').value);
  assert.doesNotMatch(botRaw, /\b\d{8,10}:[A-Za-z0-9_-]{30,}/);
  assert.doesNotMatch(botRaw, /\$env\b|process\.env/);
  assert.strictEqual(bot.settings.saveDataSuccessExecution, 'none');
  // Запрос обновлений короче интервала расписания, иначе запуски наложатся.
  assert.match(botNodes['Обновления'].parameters.url, /timeout=5&/);
  assert.strictEqual(botNodes['Каждые 10 секунд'].parameters.rule.interval[0].secondsInterval, 10);
  for (const n of ['Обновления', 'Ответы']) assert.strictEqual(botNodes[n].onError, 'continueRegularOutput', n);
});

function runBotNode(name, input, nodes) {
  const wrap = (items) => ({ all: () => items, first: () => items[0], itemMatching: (i) => items[i] });
  const $ = (n) => wrap(nodes[n]);
  const req = (m) => {
    if (m !== 'node:sqlite') throw new Error(`модуль закрыт: ${m}`);
    return require(m);
  };
  return new AsyncFunction('$input', '$', 'require', 'URL', 'URLSearchParams', botNodes[name].parameters.jsCode)(wrap(input), $, req, undefined, undefined);
}

test('бот: смещение, ответ только хозяину, порог сохраняется в базе', { skip }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jrb-'));
  const db = path.join(tmp, 'b.sqlite');
  const nodes = { 'Настройки бота': j([{ JR_DB_PATH: db, CHAT_ID: '42', MIN_SCORE: 7 }]) };
  assert.deepStrictEqual((await runBotNode('Смещение', [], nodes))[0].json, { offset: 0 });

  const upd = {
    ok: true,
    result: [
      { update_id: 10, message: { chat: { id: 42 }, text: 'Статистика' } },
      { update_id: 11, message: { chat: { id: 99 }, text: 'Статистика' } },
      { update_id: 12, callback_query: { id: 'q', data: 'score:5', message: { chat: { id: 42 } } } },
    ],
  };
  const out = (await runBotNode('Команды', j([upd]), nodes)).map((x) => x.json);
  assert.deepStrictEqual(out.map((a) => a.method), ['sendMessage', 'answerCallbackQuery', 'sendMessage']);
  assert.ok(out.every((a) => a.method !== 'sendMessage' || a.body.chat_id === '42'));
  assert.match(out[0].body.text, /Порог сейчас: 7/);
  assert.match(out[2].body.text, /Порог теперь 5/);
  assert.deepStrictEqual((await runBotNode('Смещение', [], nodes))[0].json, { offset: 13 });
  assert.deepStrictEqual(await runBotNode('Команды', j([{ ok: false }]), nodes), []);

  const { createSettings } = require('../src/settings.js');
  const conn = new DatabaseSync(db);
  assert.strictEqual(createSettings(conn).get('min_score'), '5');
  conn.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
