// Узел «Письма»: письмо с подпиской на вакансии -> ссылки на вакансии -> очередь в журнале.
// Ветка почты запускается сама, как только письмо пришло; вакансии из очереди забирает
// «Отбор» при ближайшем запуске по расписанию.
// @include src/text.js as textLib
// @include src/mail.js as mailLib
// @include src/inbox.js as inboxLib
// @include src/db.js as dbLib

const { DatabaseSync } = require('node:sqlite');

const found = [];
for (const it of $input.all()) {
  const m = it.json || {};
  found.push(...mailLib.parseJobMail({ subject: m.subject, from: m.from, date: m.date, html: m.textHtml || m.html, text: m.textPlain || m.text }));
}

const db = dbLib.openDb(DatabaseSync, inboxLib.DEFAULT_DB_PATH);
try {
  const inbox = inboxLib.createInbox(db);
  inbox.init();
  return [{ json: { letters: $input.all().length, found: found.length, queued: inbox.add(found) } }];
} finally {
  db.close();
}
