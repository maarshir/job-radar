// «Работа России» (trudvsem.ru): открытый API Роструда, без ключа и входа.
// Описание: https://trudvsem.ru/opendata/api
// trudvsemUrl собирает адрес поиска, parseTrudvsem разбирает ответ JSON в записи
// { title, link, text, date }.
'use strict';

const { htmlToText } = typeof textLib !== 'undefined' ? textLib : require('./text.js');

const API = 'https://opendata.trudvsem.ru/api/v1/vacancies';

// params: { text, region } и любые другие параметры API (experienceFrom, industry...).
// region: код региона из 13 цифр, например 7700000000000 для Москвы; без него вся Россия.
// options.now и options.days: брать только изменённые за последние дни.
function trudvsemUrl(params = {}, options = {}) {
  const { region, ...rest } = params;
  if (!String(rest.text || '').trim()) throw new Error('у поиска «Работы России» нет text');
  if (region !== undefined && !/^\d{13}$/.test(String(region))) throw new Error(`неверный код региона: ${region}`);
  const all = { limit: '100', ...rest };
  if (options.now && options.days) {
    const since = new Date(Date.parse(options.now) - options.days * 86400000);
    all.modifiedFrom = since.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  const query = Object.entries(all)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return (region ? `${API}/region/${region}` : API) + '?' + query;
}

const str = (v) => (v === null || v === undefined ? '' : htmlToText(String(v)));

function salaryOf(v) {
  const min = Number(v.salary_min);
  const max = Number(v.salary_max);
  const fmt = (n) => n.toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
  if (min > 0 && max > min) return `${fmt(min)}–${fmt(max)} ₽`;
  if (min > 0) return `от ${fmt(min)} ₽`;
  if (max > 0) return `до ${fmt(max)} ₽`;
  return str(v.salary);
}

function toIso(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// body: строка ответа API или уже разобранный объект.
function parseTrudvsem(body) {
  let data = body;
  if (typeof body === 'string') {
    try {
      data = JSON.parse(body);
    } catch {
      return [];
    }
  }
  const list = (data && data.results && data.results.vacancies) || [];
  const out = [];
  for (const row of list) {
    const v = (row && row.vacancy) || row;
    if (!v || typeof v !== 'object') continue;
    const title = str(v['job-name']);
    const company = (v.company && v.company.companycode) || '';
    const link = String(v.vac_url || '').trim() || (company && v.id ? `https://trudvsem.ru/vacancy/card/${company}/${v.id}` : '');
    if (!title || !link) continue;
    const req = v.requirement || {};
    const lines = [
      v.company && v.company.name ? `Компания: ${str(v.company.name)}` : '',
      v.region && v.region.name ? `Регион: ${str(v.region.name)}` : '',
      salaryOf(v) ? `Зарплата: ${salaryOf(v)}` : '',
      [str(v.employment), str(v.schedule)].filter(Boolean).join(', '),
      req.experience !== undefined && req.experience !== null && req.experience !== '' ? `Опыт, лет: ${str(req.experience)}` : '',
      str(v.duty),
      str(req.qualification),
    ];
    out.push({
      title,
      link,
      text: lines.filter(Boolean).join('\n'),
      date: toIso(v['creation-date'] || v.modifiedDate),
    });
  }
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { API, trudvsemUrl, parseTrudvsem };
}
