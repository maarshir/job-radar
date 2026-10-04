// Подборка вакансий для Телеграма с разметкой HTML. Длинная подборка делится
// на несколько сообщений по границам вакансий.
'use strict';

const TELEGRAM_TEXT_LIMIT = 4096;

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

function formatVacancy(v) {
  const head = `<b>${escapeHtml(v.title)}</b>` + (v.company ? ` · ${escapeHtml(v.company)}` : '');
  const meta = [v.salary, v.format].filter(Boolean).map(escapeHtml).join(' · ');
  const why = `${v.score}/10` + (v.reason ? `: ${escapeHtml(v.reason)}` : '');
  const link = `<a href="${escapeAttr(v.link)}">${escapeHtml(v.source || 'открыть')}</a>`;
  return [head, meta, why, link].filter(Boolean).join('\n');
}

// vacancies: [{ title, company, salary, format, score, reason, link, source }].
// Возвращает массив текстов сообщений; пустой, если вакансий нет.
// Лимит считается по длине с тегами: это строже, чем считает Телеграм.
function buildDigest(vacancies, options = {}) {
  const limit = options.limit ?? TELEGRAM_TEXT_LIMIT;
  const list = [...(vacancies || [])].sort((a, b) => b.score - a.score);
  if (!list.length) return [];
  const header = `Подходящие вакансии: ${list.length}`;
  const messages = [];
  let cur = header;
  for (const v of list) {
    const block = formatVacancy(v);
    if (block.length + 2 > limit) throw new Error('вакансия не помещается в сообщение');
    if (cur.length + 2 + block.length > limit) {
      messages.push(cur);
      cur = block;
    } else {
      cur += '\n\n' + block;
    }
  }
  messages.push(cur);
  return messages;
}

// Отдельное сообщение на вакансию: карточка и под ней сопроводительное письмо
// блоком кода, его можно скопировать одним нажатием. Длинное письмо укорачивается
// так, чтобы сообщение влезло в лимит Телеграма.
function formatCard(v, options = {}) {
  const limit = options.limit ?? TELEGRAM_TEXT_LIMIT;
  const card = formatVacancy(v);
  const letter = String(v.letter || '').trim();
  if (!letter) return card;
  const head = card + '\n\nСопроводительное письмо:\n<pre>';
  const tail = '</pre>';
  let body = escapeHtml(letter);
  const room = limit - head.length - tail.length;
  if (room < 50) return card;
  if (body.length > room) body = body.slice(0, room - 1).replace(/&[a-z]*$/i, '') + '…';
  return head + body + tail;
}

// Сначала лучшие: если вакансий за раз несколько, сверху придёт самая подходящая.
function buildCards(vacancies, options = {}) {
  return [...(vacancies || [])].sort((a, b) => b.score - a.score).map((v) => formatCard(v, options));
}

if (typeof module !== 'undefined') {
  module.exports = { TELEGRAM_TEXT_LIMIT, escapeHtml, formatVacancy, buildDigest, formatCard, buildCards };
}
