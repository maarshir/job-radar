// Разбор ответа нейросети по промпту prompts/score.md.
'use strict';

const JUNK = [/как (языковая )?модель/i, /\bas an ai\b/i, /не могу (выполнить|помочь|ответить)/i];

// Первый объект JSON в ответе: модели оборачивают его в ```json и пишут пояснения.
function extractJson(raw) {
  const s = String(raw ?? '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(s.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const clip = (v, n) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

// Письмо: абзацы сохраняются, лишние пробелы и пустые строки убираются.
function letterOf(v) {
  const s = String(v ?? '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length > 1500 ? s.slice(0, 1499) + '…' : s;
}

// Ответ: {"vacancy": true, "score": 0..10, "title", "company", "salary", "format", "reason", "letter"}.
// letter: сопроводительное письмо, только у подходящих вакансий; переносы строк сохраняются.
// Возвращает { ok, score, fields, reason }: ok = false с причиной, если ответ не разобран,
// это не вакансия, оценка вне шкалы или ниже порога options.minScore (по умолчанию 7).
function parseScore(raw, options = {}) {
  const minScore = options.minScore ?? 7;
  const fail = (reason, score = null) => ({ ok: false, score, fields: null, reason });

  const d = extractJson(raw);
  if (!d || typeof d !== 'object' || Array.isArray(d)) return fail('ответ не JSON');
  if (d.vacancy === false) return fail('не вакансия', 0);
  const n = typeof d.score === 'string' ? Number(d.score.replace(',', '.')) : d.score;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10) return fail('оценка вне шкалы 0–10');
  const score = Math.round(n * 10) / 10;
  const fields = {
    title: clip(d.title, 150),
    company: clip(d.company, 100),
    salary: clip(d.salary, 80),
    format: clip(d.format, 40),
    reason: clip(d.reason, 300),
    letter: letterOf(d.letter),
  };
  if (JUNK.some((re) => re.test(fields.reason))) return fail('похоже на отказ модели', score);
  if (score < minScore) return { ok: false, score, fields, reason: `ниже порога (${score})` };
  return { ok: true, score, fields, reason: null };
}

if (typeof module !== 'undefined') {
  module.exports = { extractJson, parseScore };
}
