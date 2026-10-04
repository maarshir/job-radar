// Узел «Оценка»: ответ нейросети -> parse.js -> журнал. Дальше идут только подходящие.
// Ошибка запроса не закрывает запись: вакансия придёт ещё раз в следующий запуск.
// @include src/text.js as textLib
// @include src/filter.js as filterLib
// @include src/journal.js as journalLib
// @include src/parse.js as parseLib
// @include src/inbox.js as inboxLib

const { DatabaseSync } = require('node:sqlite');
const settings = $('Настройки').first().json;
const minScore = Number(settings.MIN_SCORE ?? 7);

const db = new DatabaseSync(settings.JR_DB_PATH);
try {
  const journal = journalLib.createJournal(db, { normalizeUrl: filterLib.normalizeUrl });
  journal.init();
  const inbox = inboxLib.createInbox(db);
  inbox.init();
  const out = [];
  $input.all().forEach((it, i) => {
    const v = $('Промпт').itemMatching(i).json;
    const msg = it.json && it.json.choices && it.json.choices[0] && it.json.choices[0].message;
    if (!msg || typeof msg.content !== 'string') {
      journal.forget(v.link);
      // Вакансия из письма второй раз не придёт сама: обратно в очередь.
      if (v.fromMail) inbox.add([v]);
      return;
    }
    const r = parseLib.parseScore(msg.content, { minScore });
    if (!r.ok) {
      journal.rejected(v.link, r.reason, r.score);
      return;
    }
    journal.matched(v.link, r.score, r.fields.reason);
    out.push({ json: { ...r.fields, title: r.fields.title || v.title, score: r.score, link: v.link, source: v.source } });
  });
  return out;
} finally {
  db.close();
}
