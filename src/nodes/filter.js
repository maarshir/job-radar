// Узел «Отбор»: страницы источников -> вакансии -> отбор и отсев повторов с учётом журнала.
// Отсеянное пишется в журнал с причиной, дальше идёт не больше MAX_ITEMS вакансий.
// @include src/text.js as textLib
// @include src/rss.js as rssLib
// @include src/telegram.js as tgLib
// @include src/filter.js as filterLib
// @include src/journal.js as journalLib
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
$input.all().forEach((it, i) => {
  const src = sourceOf(i);
  const body = it.json && typeof it.json.data === 'string' ? it.json.data : '';
  // Недоступный источник приходит элементом с ошибкой, без data.
  if (!src || !body) return;
  if (src.kind === 'telegram') {
    for (const p of tgLib.parseChannelPage(body)) {
      items.push({ title: textLib.firstLine(p.text), link: p.link, text: p.text.slice(0, 3000), date: p.date, source: '@' + p.channel });
    }
  } else {
    for (const r of rssLib.parseFeed(body)) {
      items.push({ title: r.title, link: r.link, text: r.text.slice(0, 3000), date: r.date, source: src.name });
    }
  }
});

const db = new DatabaseSync(settings.JR_DB_PATH);
try {
  const journal = journalLib.createJournal(db, { normalizeUrl: filterLib.normalizeUrl });
  journal.init();
  const { accepted, rejected } = filterLib.filterVacancies(items, FILTER_CONFIG, journal.seen(30));

  for (const r of rejected) {
    if (r.reason === 'повтор ссылки' || r.reason === 'нет заголовка или ссылки') continue;
    const c = journal.collected(r);
    if (c.added) journal.rejected(r.link, r.reason);
  }

  // Сверх MAX_ITEMS в журнал не пишется: эти вакансии придут в следующий запуск.
  const out = [];
  for (const a of accepted) {
    if (out.length >= maxItems) break;
    const c = journal.collected(a);
    if (!c.added) continue;
    out.push({ json: { id: c.item.id, title: a.title, link: a.link, text: a.text, source: a.source } });
  }
  return out;
} finally {
  db.close();
}
