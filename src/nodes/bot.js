// Узел «Команды»: обновления Телеграма -> ответы бота. Каждый ответ уходит узлом «Ответы».
// @include src/text.js as textLib
// @include src/message.js as messageLib
// @include src/filter.js as filterLib
// @include src/journal.js as journalLib
// @include src/settings.js as settingsLib
// @include src/runs.js as runsLib
// @include src/bot.js as botLib
// @include src/db.js as dbLib

const { DatabaseSync } = require('node:sqlite');
const cfg = $('Настройки бота').first().json;
const res = $input.first().json || {};
// Ошибка запроса или пустой ответ: просто ждём следующего запуска.
if (!res.ok || !Array.isArray(res.result) || !res.result.length) return [];

const db = dbLib.openDb(DatabaseSync, cfg.JR_DB_PATH);
try {
  const journal = journalLib.createJournal(db, { normalizeUrl: filterLib.normalizeUrl });
  journal.init();
  const settings = settingsLib.createSettings(db);
  settings.init();
  const runs = runsLib.createRuns(db);
  runs.init();
  const ctx = {
    chatId: String(cfg.CHAT_ID),
    journal,
    settings,
    runs,
    now: new Date().toISOString(),
    minScore: settingsLib.minScoreOf(settings, cfg.MIN_SCORE),
  };
  const { actions, offset } = botLib.handleUpdates(res.result, ctx);
  if (offset !== null) settings.set('tg_offset', offset);
  return actions.map((a) => ({ json: a }));
} finally {
  db.close();
}
