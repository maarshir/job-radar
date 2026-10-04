// Журнал запусков сбора: когда был запуск, какие источники не ответили, сколько вакансий
// ушло в нейросеть и сколько ответов не пришло. По нему бот отвечает, работает ли сбор.
'use strict';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  sources INTEGER NOT NULL DEFAULT 0,
  failed TEXT,
  found INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  scored INTEGER,
  matched INTEGER,
  llm_errors INTEGER
);
`;

function createRuns(db, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  function init() {
    db.exec(SCHEMA);
  }
  // Запуск после отбора. sent = 0 значит, что нейросеть не нужна и запуск уже закончен.
  function start({ sources = 0, failed = [], found = 0, sent = 0 } = {}) {
    const t = now();
    const r = db
      .prepare('INSERT INTO runs (started_at, finished_at, sources, failed, found, sent) VALUES (?, ?, ?, ?, ?, ?)')
      .run(t, sent ? null : t, sources, failed.length ? JSON.stringify(failed) : null, found, sent);
    // Старые запуски не нужны: хватает последней недели.
    db.prepare('DELETE FROM runs WHERE started_at < ?').run(new Date(Date.parse(t) - 7 * 86400000).toISOString());
    return Number(r.lastInsertRowid);
  }
  // Итог оценки: дописывается в последний незаконченный запуск.
  function finish({ scored = 0, matched = 0, llmErrors = 0 } = {}) {
    const r = db.prepare('SELECT id FROM runs WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1').get();
    if (!r) return null;
    db.prepare('UPDATE runs SET finished_at = ?, scored = ?, matched = ?, llm_errors = ? WHERE id = ?').run(
      now(),
      scored,
      matched,
      llmErrors,
      r.id
    );
    return r.id;
  }
  function last() {
    const r = db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get();
    if (!r) return null;
    return { ...r, failed: r.failed ? JSON.parse(r.failed) : [] };
  }
  return { init, start, finish, last };
}

if (typeof module !== 'undefined') {
  module.exports = { SCHEMA, createRuns };
}
