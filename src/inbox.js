// Очередь вакансий из писем. Узел «Письма» складывает их сюда сразу, как письмо пришло,
// а «Отбор» забирает при следующем запуске по расписанию и дальше всё идёт обычным путём.
'use strict';

// Тот же путь, что JR_DB_PATH в узле «Настройки»: ветка почты запускается отдельно
// и настроек не видит. Если меняете JR_DB_PATH, поменяйте и здесь, затем npm run build.
const DEFAULT_DB_PATH = '/home/node/.n8n/job-radar.sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  text TEXT,
  source TEXT,
  date TEXT,
  added_at TEXT NOT NULL
);
`;

function createInbox(db, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  function init() {
    db.exec(SCHEMA);
  }
  // Повтор ссылки в очереди пропускается. Возвращает число добавленных.
  function add(items) {
    const st = db.prepare('INSERT OR IGNORE INTO inbox (link, title, text, source, date, added_at) VALUES (?, ?, ?, ?, ?, ?)');
    let n = 0;
    for (const it of items || []) {
      if (!it || !it.link || !it.title) continue;
      n += Number(st.run(it.link, it.title, it.text || '', it.source || null, it.date || null, now()).changes);
    }
    return n;
  }
  // Забрать всё из очереди: записи удаляются, дальше за них отвечает журнал.
  function take(limit = 200) {
    const rows = db.prepare('SELECT * FROM inbox ORDER BY id LIMIT ?').all(limit);
    const del = db.prepare('DELETE FROM inbox WHERE id = ?');
    for (const r of rows) del.run(r.id);
    return rows.map((r) => ({ title: r.title, link: r.link, text: r.text || '', date: r.date, source: r.source, fromMail: true }));
  }
  return { init, add, take };
}

if (typeof module !== 'undefined') {
  module.exports = { DEFAULT_DB_PATH, SCHEMA, createInbox };
}
