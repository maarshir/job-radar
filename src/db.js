// Открытие общей базы SQLite. В неё пишут оба конвейера (сбор и бот), иногда одновременно,
// поэтому база ждёт освобождения до 5 секунд вместо ошибки «database is locked».
'use strict';

function openDb(DatabaseSync, path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000');
  try {
    db.exec('PRAGMA journal_mode = WAL');
  } catch {}
  return db;
}

if (typeof module !== 'undefined') {
  module.exports = { openDb };
}
