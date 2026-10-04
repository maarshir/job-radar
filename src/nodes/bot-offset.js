// Узел «Смещение»: с какого обновления Телеграма читать, чтобы не ответить дважды.
// @include src/settings.js as settingsLib
// @include src/db.js as dbLib

const { DatabaseSync } = require('node:sqlite');
const db = dbLib.openDb(DatabaseSync, $('Настройки бота').first().json.JR_DB_PATH);
try {
  const store = settingsLib.createSettings(db);
  store.init();
  return [{ json: { offset: Number(store.get('tg_offset', '0')) || 0 } }];
} finally {
  db.close();
}
