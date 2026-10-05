// Узел «Оценка»: ответ нейросети -> parse.js -> журнал. Дальше идут только подходящие.
// Ошибка запроса не закрывает запись: вакансия придёт ещё раз в следующий запуск.
// @include src/text.js as textLib
// @include src/filter.js as filterLib
// @include src/journal.js as journalLib
// @include src/parse.js as parseLib
// @include src/inbox.js as inboxLib
// @include src/runs.js as runsLib
// @include src/settings.js as settingsLib
// @include src/db.js as dbLib

const { DatabaseSync } = require('node:sqlite');
const settings = $('Настройки').first().json;

const db = dbLib.openDb(DatabaseSync, settings.JR_DB_PATH);
try {
  // Порог из бота важнее, чем MIN_SCORE в узле «Настройки».
  const store = settingsLib.createSettings(db);
  store.init();
  const minScore = settingsLib.minScoreOf(store, settings.MIN_SCORE);
  const runs = runsLib.createRuns(db);
  runs.init();
  let llmErrors = 0;
  const journal = journalLib.createJournal(db, { normalizeUrl: filterLib.normalizeUrl });
  journal.init();
  const inbox = inboxLib.createInbox(db);
  inbox.init();
  const out = [];
  $input.all().forEach((it, i) => {
    const v = $('Промпт').itemMatching(i).json;
    const msg = it.json && it.json.choices && it.json.choices[0] && it.json.choices[0].message;
    if (!msg || typeof msg.content !== 'string') {
      llmErrors++;
      journal.forget(v.link);
      // Вакансия из письма второй раз не придёт сама: обратно в очередь.
      if (v.fromMail) inbox.add([v]);
      return;
    }
    const r = parseLib.parseScore(msg.content, { minScore });
    // Поля сохраняются и у отклонённых: их можно показать из бота как вакансии ниже порога.
    if (!r.ok) {
      journal.rejected(v.link, r.reason, r.score, r.fields);
      return;
    }
    journal.matched(v.link, r.score, r.fields.reason, r.fields);
    // У вакансий из писем заголовок взят прямо из ссылки на вакансию: он точно ей соответствует.
    const title = v.fromMail ? v.title : r.fields.title || v.title;
    out.push({ json: { ...r.fields, title, score: r.score, link: v.link, source: v.source } });
  });
  runs.finish({ scored: $input.all().length - llmErrors, matched: out.length, llmErrors });
  return out;
} finally {
  db.close();
}
