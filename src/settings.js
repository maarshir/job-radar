// Настройки, которые меняются из бота без правки конвейера: порог оценки, смещение обновлений Телеграма.
'use strict';

const SCHEMA = `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`;

function createSettings(db) {
  function init() {
    db.exec(SCHEMA);
  }
  function get(key, fallback = null) {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? r.value : fallback;
  }
  function getNumber(key, fallback) {
    const n = Number(get(key, null));
    return get(key, null) !== null && Number.isFinite(n) ? n : fallback;
  }
  function set(key, value) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      key,
      String(value)
    );
  }
  return { init, get, getNumber, set };
}

// Порог: из бота, если там задан, иначе из узла «Настройки».
function minScoreOf(settings, fallback) {
  const n = settings.getNumber('min_score', Number(fallback ?? 7));
  return Number.isFinite(n) ? n : 7;
}

if (typeof module !== 'undefined') {
  module.exports = { SCHEMA, createSettings, minScoreOf };
}
