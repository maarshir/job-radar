// Логика бота: обновления Телеграма -> ответы { method, body } для API Телеграма.
// Кнопки внизу чата: «Есть ли вакансии», «Статистика», «Порог».
'use strict';

const { formatCard, escapeHtml } = typeof messageLib !== 'undefined' ? messageLib : require('./message.js');

const BTN = { check: 'Есть ли вакансии', stats: 'Статистика', score: 'Порог' };
const LOW_FLOOR = 4; // ниже этой оценки вакансии не предлагаются даже как «возможные»
const STALE_MINUTES = 25; // сбор раз в 10 минут: дольше 25 минут тишины значит, что он стоит
const SHOW_LIMIT = 10;

const MENU = {
  keyboard: [[{ text: BTN.check }], [{ text: BTN.stats }, { text: BTN.score }]],
  resize_keyboard: true,
  is_persistent: true,
};

// Время по Москве: «14:05» сегодня, «03.10 14:05» в другие дни.
function mskParts(iso) {
  const d = new Date(Date.parse(iso) + 3 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return { day: `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}`, time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}
function when(iso, nowIso) {
  const a = mskParts(iso);
  return a.day === mskParts(nowIso).day ? a.time : `${a.day} ${a.time}`;
}
// Начало суток по Москве в UTC.
function mskMidnight(nowIso) {
  const d = new Date(Date.parse(nowIso) + 3 * 3600000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3 * 3600000).toISOString();
}

const send = (chatId, text, extra = {}) => ({
  method: 'sendMessage',
  body: { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra },
});
const buttons = (rows) => ({ reply_markup: { inline_keyboard: rows } });

function cardOf(row) {
  return formatCard({
    title: row.title,
    company: row.company,
    salary: row.salary,
    format: row.format,
    score: row.score,
    reason: row.why,
    link: row.link,
    source: row.source,
    letter: row.letter,
  });
}

function menu(ctx) {
  return [
    send(
      ctx.chatId,
      'Кнопки внизу:\n<b>Есть ли вакансии</b>: проверка, что сбор работает, и что нашлось.\n' +
        '<b>Статистика</b>: сколько вакансий собрано и оценено.\n<b>Порог</b>: с какой оценки присылать вакансии.',
      { reply_markup: MENU }
    ),
  ];
}

function health(ctx) {
  const { journal, runs, now, chatId, minScore } = ctx;
  const lines = [];
  const last = runs.last();
  if (!last) {
    return [send(chatId, 'Сбор ещё ни разу не запускался. Проверь в n8n, что конвейер «job-radar: сбор» опубликован (Published).')];
  }
  const age = Math.round((Date.parse(now) - Date.parse(last.started_at)) / 60000);
  if (age > STALE_MINUTES) {
    lines.push(`⚠️ Последний сбор был в ${when(last.started_at, now)}, ${age} мин назад. Похоже, конвейер сбора выключен: проверь в n8n, что он опубликован.`);
  } else {
    lines.push(`✅ Сбор работает, последний запуск в ${when(last.started_at, now)}.`);
  }
  if (!last.finished_at && age > 5) {
    lines.push('⚠️ Последний запуск оборвался на оценке нейросетью. Ошибка видна в n8n на вкладке Executions.');
  }
  if (last.failed.length) lines.push(`⚠️ Не ответили источники: ${last.failed.map(escapeHtml).join(', ')}.`);
  if (last.llm_errors) {
    lines.push(`⚠️ Нейросеть не ответила на ${last.llm_errors} вак. Они придут в следующий запуск; если повторяется, проверь ключ и лимиты Groq.`);
  }

  const matched = journal.recentMatched(24, 1000);
  if (matched.length) {
    const m = matched[0];
    lines.push(`За сутки подошло вакансий: ${matched.length}. Последняя: <a href="${escapeHtml(m.link)}">${escapeHtml(m.title)}</a> (${m.score}/10).`);
    return [send(chatId, lines.join('\n\n'))];
  }
  const low = journal.below({ from: LOW_FLOOR, to: minScore, days: 7, limit: 1000 });
  if (low.length) {
    lines.push(
      `Подходящих вакансий за сутки нет. За неделю есть ${low.length} ниже порога ${minScore}, лучшая на ${low[0].score}/10. Показать?`
    );
    return [send(chatId, lines.join('\n\n'), buttons([[{ text: 'Да', callback_data: `low:${LOW_FLOOR}:${minScore}` }, { text: 'Нет', callback_data: 'low:no' }]]))];
  }
  lines.push(`Вакансий нет: за неделю не нашлось ни одной с оценкой от ${LOW_FLOOR}.`);
  return [send(chatId, lines.join('\n\n'))];
}

function stats(ctx) {
  const { journal, runs, now, chatId, minScore } = ctx;
  const line = (name, c) =>
    `<b>${name}:</b> собрано ${c.collected}, оценено нейросетью ${c.analyzed}, подошло ${c.matched}, ниже порога ${c.below}, отсеяно фильтром ${c.filtered}.`;
  const week = new Date(Date.parse(now) - 7 * 86400000).toISOString();
  const lines = [
    `Порог сейчас: ${minScore} из 10.`,
    line('Сегодня', journal.counts(mskMidnight(now))),
    line('За 7 дней', journal.counts(week)),
    line('Всего', journal.counts()),
  ];
  const last = runs.last();
  if (last) lines.push(`Последний сбор: ${when(last.started_at, now)}, новых вакансий ${last.found}, в нейросеть ушло ${last.sent}.`);
  return [send(chatId, lines.join('\n\n'))];
}

function scoreMenu(ctx) {
  const b = (n) => ({ text: n === ctx.minScore ? `• ${n} •` : String(n), callback_data: `score:${n}` });
  return [
    send(
      ctx.chatId,
      `Сейчас порог ${ctx.minScore} из 10: вакансии с оценкой ниже не присылаются. Выбери новый:`,
      buttons([[b(3), b(4), b(5)], [b(6), b(7), b(8)], [b(9)]])
    ),
  ];
}

// Показать отклонённые по порогу вакансии с оценкой от from до to (не включая), лучшие первыми.
// to передаётся в кнопке: после снижения порога это прежний порог, а не текущий.
function showLow(ctx, from, to) {
  const all = ctx.journal.below({ from, to, days: 7, limit: 1000 });
  if (!all.length) return [send(ctx.chatId, 'Таких вакансий больше нет.')];
  const part = all.slice(0, SHOW_LIMIT);
  ctx.journal.markShown(part.map((r) => r.id));
  const out = part.map((r) => send(ctx.chatId, cardOf(r)));
  const rest = all.length - part.length;
  if (rest > 0) {
    out.push(send(ctx.chatId, `Осталось ещё ${rest}.`, buttons([[{ text: 'Показать ещё', callback_data: `low:${from}:${to}` }]])));
  }
  return out;
}

function setScore(ctx, n) {
  const old = ctx.minScore;
  ctx.settings.set('min_score', n);
  ctx.minScore = n;
  const out = [send(ctx.chatId, `Порог теперь ${n} из 10. Новые вакансии будут приходить с этой оценки.`)];
  if (n < old) {
    const missed = ctx.journal.below({ from: n, to: old, days: 7, limit: 1000 });
    if (missed.length) {
      out.push(
        send(
          ctx.chatId,
          `За неделю ${missed.length} вак. с оценкой от ${n} не пришли из-за прежнего порога. Показать?`,
          buttons([[{ text: 'Да', callback_data: `low:${n}:${old}` }, { text: 'Нет', callback_data: 'low:no' }]])
        )
      );
    }
  }
  return out;
}

function onText(ctx, text) {
  const t = String(text || '').trim();
  if (t === BTN.check || t === '/check') return health(ctx);
  if (t === BTN.stats || t === '/stats') return stats(ctx);
  if (t === BTN.score || t === '/score') return scoreMenu(ctx);
  return menu(ctx);
}

function onCallback(ctx, data) {
  const s = String(data || '');
  let m = s.match(/^score:(\d+)$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 10) return setScore(ctx, Number(m[1]));
  if (s === 'low:no') return [send(ctx.chatId, 'Хорошо, не показываю.')];
  m = s.match(/^low:(\d+):(\d+)$/);
  if (m) return showLow(ctx, Number(m[1]), Number(m[2]));
  return menu(ctx);
}

// updates: result из getUpdates. ctx: { chatId, journal, settings, runs, now, minScore }.
// Возвращает { actions, offset }: offset сохраняется, чтобы обновления не обрабатывались повторно.
// Сообщения не из чата CHAT_ID пропускаются: бот отвечает только хозяину.
function handleUpdates(updates, ctx) {
  const actions = [];
  let offset = null;
  for (const u of updates || []) {
    if (typeof u.update_id === 'number') offset = Math.max(offset ?? 0, u.update_id + 1);
    if (u.message) {
      if (String(u.message.chat && u.message.chat.id) !== String(ctx.chatId)) continue;
      actions.push(...onText(ctx, u.message.text));
    } else if (u.callback_query) {
      const q = u.callback_query;
      if (String(q.message && q.message.chat && q.message.chat.id) !== String(ctx.chatId)) continue;
      actions.push({ method: 'answerCallbackQuery', body: { callback_query_id: q.id } });
      actions.push(...onCallback(ctx, q.data));
    }
  }
  return { actions, offset };
}

if (typeof module !== 'undefined') {
  module.exports = { BTN, MENU, LOW_FLOOR, STALE_MINUTES, mskMidnight, when, handleUpdates };
}
