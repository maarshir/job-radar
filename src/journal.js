// Журнал в SQLite: что собрано, что отсеяно и почему, что ушло в подборку.
// Принимает любую базу с exec(sql) и prepare(sql) (node:sqlite или better-sqlite3).
'use strict';

const STATUSES = ['collected', 'rejected', 'matched'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vacancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_key TEXT NOT NULL UNIQUE,
  link TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT,
  source TEXT,
  status TEXT NOT NULL CHECK (status IN ('collected', 'rejected', 'matched')),
  reason TEXT,
  score REAL,
  collected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vacancies_status ON vacancies (status);
CREATE INDEX IF NOT EXISTS vacancies_collected_at ON vacancies (collected_at);
`;

function createJournal(db, options = {}) {
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') {
    throw new TypeError('нужен объект базы с exec и prepare');
  }
  const now = options.now || (() => new Date().toISOString());
  const normalizeUrl = options.normalizeUrl || ((u) => String(u || '').trim().toLowerCase());
  const keyOf = (link) => {
    const key = normalizeUrl(link);
    if (!key) throw new Error('нет ссылки');
    return key;
  };
  const get = (key) => db.prepare('SELECT * FROM vacancies WHERE url_key = ?').get(key) || null;

  function init() {
    db.exec(SCHEMA);
  }

  // Новая запись или уже известная ссылка: тогда { added: false } и прежняя запись.
  function collected(item) {
    const title = String((item && item.title) || '').trim();
    if (!title) throw new Error('нет заголовка');
    const key = keyOf(item.link);
    const old = get(key);
    if (old) return { added: false, item: old };
    const t = now();
    db.prepare(
      `INSERT INTO vacancies (url_key, link, title, snippet, source, status, collected_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'collected', ?, ?)`
    ).run(key, String(item.link).trim(), title, String(item.text || '').slice(0, 300), item.source || null, t, t);
    return { added: true, item: get(key) };
  }

  function finish(link, status, reason, score) {
    const key = keyOf(link);
    const old = get(key);
    if (!old) throw new Error(`нет в журнале: ${link}`);
    if (old.status !== 'collected') throw new Error(`запись уже закрыта: ${old.status}`);
    db.prepare('UPDATE vacancies SET status = ?, reason = ?, score = ?, updated_at = ? WHERE url_key = ?').run(
      status,
      reason ?? null,
      score ?? null,
      now(),
      key
    );
    return get(key);
  }

  // У отказа всегда есть причина: по журналу видно, почему вакансия не пришла.
  function rejected(link, reason, score) {
    const r = String(reason || '').trim();
    if (!r) throw new Error('у отказа должна быть причина');
    return finish(link, 'rejected', r, score);
  }

  function matched(link, score, reason) {
    if (typeof score !== 'number' || !Number.isFinite(score)) throw new Error('нет оценки');
    return finish(link, 'matched', reason, score);
  }

  // Убрать ещё не закрытую запись: вакансия снова придёт в следующий запуск.
  // Нужно, когда нейросеть не ответила, чтобы вакансия не пропала.
  function forget(link) {
    const key = keyOf(link);
    const old = get(key);
    if (!old) return false;
    if (old.status !== 'collected') throw new Error(`запись уже закрыта: ${old.status}`);
    db.prepare('DELETE FROM vacancies WHERE url_key = ?').run(key);
    return true;
  }

  // Записи за days дней в виде { link, title, text } для filterVacancies.
  function seen(days = 30) {
    const since = new Date(Date.parse(now()) - days * 86400000).toISOString();
    return db
      .prepare('SELECT link, title, snippet FROM vacancies WHERE collected_at >= ? ORDER BY id')
      .all(since)
      .map((r) => ({ link: r.link, title: r.title, text: r.snippet || '' }));
  }

  function stats() {
    const counts = { collected: 0, rejected: 0, matched: 0 };
    for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM vacancies GROUP BY status').all()) {
      counts[r.status] = Number(r.n);
    }
    const reasons = db
      .prepare(
        `SELECT reason, COUNT(*) AS n FROM vacancies WHERE status = 'rejected'
         GROUP BY reason ORDER BY n DESC, reason`
      )
      .all()
      .map((r) => ({ reason: r.reason, count: Number(r.n) }));
    return { ...counts, reasons };
  }

  return { init, collected, rejected, matched, forget, seen, stats, get: (link) => get(keyOf(link)) };
}

if (typeof module !== 'undefined') {
  module.exports = { SCHEMA, STATUSES, createJournal };
}
