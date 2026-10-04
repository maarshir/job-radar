// Узел «Отбор»: страницы источников и очередь из писем -> вакансии -> отбор и отсев повторов
// с учётом журнала.
// Отсеянное пишется в журнал с причиной, дальше идёт не больше MAX_ITEMS вакансий.
// @include src/text.js as textLib
// @include src/rss.js as rssLib
// @include src/trudvsem.js as trudvsemLib
// @include src/telegram.js as tgLib
// @include src/filter.js as filterLib
// @include src/journal.js as journalLib
// @include src/inbox.js as inboxLib
// @include src/runs.js as runsLib
// @include src/db.js as dbLib
// @include src/filter.config.json as FILTER_CONFIG

const { DatabaseSync } = require('node:sqlite');
const settings = $('Настройки').first().json;
const maxItems = Number(settings.MAX_ITEMS) || 25;

// Источник берётся из узла «Источники» по связи элементов.
function sourceOf(i) {
  try {
    return $('Источники').itemMatching(i).json;
  } catch {
    return null;
  }
}

const items = [];
const failed = [];
let sources = 0;
$input.all().forEach((it, i) => {
  const src = sourceOf(i);
  const body = it.json && typeof it.json.data === 'string' ? it.json.data : '';
  if (src) sources++;
  // Недоступный источник приходит элементом с ошибкой, без data: записывается в журнал запусков.
  if (src && !body) failed.push(src.name);
  if (!src || !body) return;
  if (src.kind === 'telegram') {
    for (const p of tgLib.parseChannelPage(body)) {
      items.push({ title: textLib.firstLine(p.text), link: p.link, text: p.text.slice(0, 3000), date: p.date, source: '@' + p.channel });
    }
  } else if (src.kind === 'trudvsem') {
    for (const r of trudvsemLib.parseTrudvsem(body)) {
      items.push({ ...r, text: r.text.slice(0, 3000), source: src.name });
    }
  } else {
    for (const r of rssLib.parseFeed(body)) {
      items.push({ title: r.title, link: r.link, text: r.text.slice(0, 3000), date: r.date, source: src.name });
    }
  }
});

const db = dbLib.openDb(DatabaseSync, settings.JR_DB_PATH);
try {
  const journal = journalLib.createJournal(db, { normalizeUrl: filterLib.normalizeUrl });
  journal.init();
  const inbox = inboxLib.createInbox(db);
  inbox.init();
  items.push(...inbox.take());
  const { accepted, rejected } = filterLib.filterVacancies(items, FILTER_CONFIG, journal.seen(30));

  for (const r of rejected) {
    if (r.reason === 'повтор ссылки' || r.reason === 'нет заголовка или ссылки') continue;
    const c = journal.collected(r);
    if (c.added) journal.rejected(r.link, r.reason);
  }

  // Сверх MAX_ITEMS в журнал не пишется: эти вакансии придут в следующий запуск.
  // Вакансии из писем после очереди нигде больше не лежат, поэтому лишние возвращаются в очередь.
  const out = [];
  const later = [];
  for (const a of accepted) {
    if (out.length >= maxItems) {
      if (a.fromMail) later.push(a);
      continue;
    }
    const c = journal.collected(a);
    if (!c.added) continue;
    out.push({ json: { id: c.item.id, title: a.title, link: a.link, text: a.text, source: a.source, fromMail: !!a.fromMail } });
  }
  inbox.add(later);
  const runs = runsLib.createRuns(db);
  runs.init();
  runs.start({ sources, failed, found: accepted.length, sent: out.length });
  return out;
} finally {
  db.close();
}
