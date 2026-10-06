// Отбор вакансий перед нейросетью: свежесть, ключевые слова, стоп-слова в заголовке,
// отсев повторов по ссылке и по похожему тексту (одна вакансия в разных каналах).
'use strict';

const { normalizeText, tokens } = typeof textLib !== 'undefined' ? textLib : require('./text.js');

const TRACKING = /^(utm_\w+|fbclid|gclid|yclid|ref|from|hhtmFrom\w*|query)$/i;

// Одна вакансия по разным ссылкам: без схемы, www, якоря, меток и конечной косой черты.
// Разбор вручную: в песочнице узла Code n8n нет URL и URLSearchParams.
function normalizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const m = raw.match(/^[a-z][a-z0-9+.-]*:\/\/([^\/?#]+)([^?#]*)(?:\?([^#]*))?/i);
  if (!m) return raw.toLowerCase();
  const host = m[1].toLowerCase().replace(/^www\./, '').replace(/:(80|443)$/, '');
  const params = (m[3] || '')
    .split('&')
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=');
      return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
    })
    .filter(([k]) => !TRACKING.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
  return host + m[2].replace(/\/+$/, '') + query;
}

// Слово ищется как начало слова в тексте («стажировк» найдёт «стажировка»),
// фраза как подряд идущие слова. Слова до трёх букв только целиком («ии», «ml»).
function keywordMatches(textTokens, keyword) {
  const kw = tokens(keyword);
  if (!kw.length) return false;
  for (let i = 0; i + kw.length <= textTokens.length; i++) {
    let ok = true;
    for (let j = 0; j < kw.length; j++) {
      const t = textTokens[i + j];
      const k = kw[j];
      if (k.length <= 3 ? t !== k : !t.startsWith(k)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function findKeywords(text, keywords) {
  const tt = tokens(text);
  return (keywords || []).filter((k) => keywordMatches(tt, k));
}

// Сколько лет опыта требует вакансия: наибольшее число из фраз вроде «опыт от 3 лет»,
// «опыт работы не менее 2 лет», «3+ года», «Опыт, лет: 2». null, если не указано.
const EXPERIENCE = [
  /опыт[а-я]*,?\s*(?:работы\s*)?(?:коммерческой\s*)?(?:разработки\s*)?(?:лет:?\s*)?(?:от|не\s*менее|более|свыше|больше|>=?)?\s*(\d+(?:[.,]\d+)?)\s*\+?\s*(?:лет|года?|г\.|-?х)?/gi,
  /(?:от|не\s*менее|более|свыше)\s*(\d+(?:[.,]\d+)?)\s*(?:лет|года?)\s*(?:коммерческого\s*|подтвержд[а-я]*\s*|практического\s*)?опыт/gi,
  /(\d+(?:[.,]\d+)?)\s*\+\s*(?:лет|года?|years?)/gi,
  /(\d+(?:[.,]\d+)?)\s*\+?\s*years?\s*(?:of\s*)?(?:commercial\s*|professional\s*)?experience/gi,
];

function requiredExperience(text) {
  const s = String(text || '').replace(/ё/gi, 'е');
  let max = null;
  for (const re of EXPERIENCE) {
    for (const m of s.matchAll(re)) {
      const n = Number(m[1].replace(',', '.'));
      if (Number.isFinite(n) && n <= 15 && (max === null || n > max)) max = n;
    }
  }
  return max;
}

// Отпечаток для сравнения: заголовок и начало текста.
function fingerprint(item) {
  return `${(item && item.title) || ''} ${String((item && item.text) || '').slice(0, 300)}`;
}

// Коэффициент Жаккара по основам слов (первые 5 букв), короткие слова не считаются.
function similarity(a, b) {
  const stems = (s) => new Set(tokens(s).filter((t) => t.length > 2).map((t) => t.slice(0, 5)));
  const A = stems(a);
  const B = stems(b);
  if (A.size < 3 || B.size < 3) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// items: [{ title, link, text, date, source }]. seen: недавние записи журнала { link, title, text }.
// Возвращает принятые и отклонённые с причиной. options.now для проверки свежести.
function filterVacancies(items, config = {}, seen = [], options = {}) {
  const keywords = config.keywords || [];
  const exclude = config.excludeTitle || [];
  const threshold = config.similarityThreshold ?? 0.8;
  const maxAge = (config.maxAgeDays ?? 4) * 86400000;
  const now = Date.parse(options.now || new Date().toISOString());

  const accepted = [];
  const rejected = [];
  const seenUrls = new Set(seen.map((s) => normalizeUrl(s.link)).filter(Boolean));
  const seenPrints = seen.map(fingerprint);

  for (const item of items || []) {
    const reject = (reason, extra = {}) => rejected.push({ ...item, reason, ...extra });
    const title = String((item && item.title) || '').trim();
    if (!title || !item.link) {
      reject('нет заголовка или ссылки');
      continue;
    }
    const url = normalizeUrl(item.link);
    if (seenUrls.has(url)) {
      reject('повтор ссылки');
      continue;
    }
    seenUrls.add(url);
    const t = Date.parse(item.date);
    if (Number.isFinite(t) && now - t > maxAge) {
      reject('старое объявление');
      continue;
    }
    const bad = findKeywords(title, exclude);
    if (bad.length) {
      reject('стоп-слово в заголовке', { matched: bad });
      continue;
    }
    const years = config.maxExperienceYears != null ? requiredExperience(`${title}\n${item.text || ''}`) : null;
    if (years !== null && years > config.maxExperienceYears) {
      reject('требуется большой опыт', { years });
      continue;
    }
    const matched = findKeywords(`${title} ${item.text || ''}`, keywords);
    // Вакансии из писем уже отобраны сохранённым поиском на сайте, а в письме
    // от них только заголовок и пара строк: ключевые слова там часто не видны.
    if (keywords.length && !matched.length && !item.fromMail) {
      reject('нет ключевых слов');
      continue;
    }
    const print = fingerprint(item);
    let dup = null;
    for (const p of seenPrints) {
      const sim = similarity(print, p);
      if (sim >= threshold) {
        dup = Math.round(sim * 100) / 100;
        break;
      }
    }
    if (dup !== null) {
      reject('похожая вакансия уже была', { similarity: dup });
      continue;
    }
    seenPrints.push(print);
    accepted.push({ ...item, matched });
  }
  return { accepted, rejected };
}

if (typeof module !== 'undefined') {
  module.exports = { normalizeUrl, findKeywords, similarity, filterVacancies, requiredExperience };
}
