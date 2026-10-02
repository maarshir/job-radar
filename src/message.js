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

if (typeof module !== 'undefined') {
  module.exports = { TELEGRAM_TEXT_LIMIT, escapeHtml, formatVacancy, buildDigest };
}
