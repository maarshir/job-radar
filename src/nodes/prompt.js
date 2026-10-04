// Узел «Промпт»: шаблон prompts/score.md с профилем кандидата и текстом вакансии.
// @include src/fill.js as fillLib
// @include prompts/score.md as PROMPT
// @include src/profile.md as PROFILE
// @include src/settings.js as settingsLib
// @include src/db.js as dbLib

const { DatabaseSync } = require('node:sqlite');
const settings = $('Настройки').first().json;
const db = dbLib.openDb(DatabaseSync, settings.JR_DB_PATH);
let minScore;
try {
  const store = settingsLib.createSettings(db);
  store.init();
  minScore = settingsLib.minScoreOf(store, settings.MIN_SCORE);
} finally {
  db.close();
}
// Письмо пишется и для вакансий чуть ниже порога: их можно запросить из бота.
const letterMin = Math.min(minScore, 5);

return $input.all().map((it) => ({
  json: {
    ...it.json,
    prompt: fillLib.fillPrompt(PROMPT, {
      profile: PROFILE.trim(),
      title: it.json.title,
      text: it.json.text || '(текста нет)',
      source: it.json.source || '',
      link: it.json.link,
      letter_min: letterMin,
    }),
  },
}));
