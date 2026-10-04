// Синтетические страницы источников для тестов: устроены как настоящие, данные выдуманы.
'use strict';

const rssHh = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Вакансии</title>
<item><title><![CDATA[Стажёр Python-разработчик]]></title>
<link>https://hh.ru/vacancy/1001?query=python&amp;hhtmFrom=rss</link>
<description><![CDATA[<p>Компания: Пример. Python, FastAPI, боты.</p>]]></description>
<pubDate>Thu, 01 Oct 2026 09:00:00 +0300</pubDate></item>
<item><title>Senior Python Developer</title>
<link>https://hh.ru/vacancy/1002</link>
<description>Опыт от 5 лет</description>
<pubDate>Thu, 01 Oct 2026 10:00:00 +0300</pubDate></item>
<item><title>Junior разработчик чат-ботов &amp; автоматизации</title>
<link>https://hh.ru/vacancy/1003</link>
<description>n8n, Python, нейросети</description>
<pubDate>Fri, 02 Oct 2026 08:00:00 +0300</pubDate></item>
<item><title>Стажёр аналитик</title>
<link>https://hh.ru/vacancy/1004</link>
<description>Excel</description>
<pubDate>Mon, 01 Jun 2026 08:00:00 +0300</pubDate></item>
</channel></rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Junior ML Engineer</title><link rel="alternate" href="https://example.com/jobs/7"/>
<summary type="html">&lt;b&gt;LLM&lt;/b&gt; и Python</summary><updated>2026-10-01T12:00:00Z</updated></entry>
</feed>`;

const post = (ch, id, html, date) => `
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="${ch}/${id}" data-view="x">
<div class="tgme_widget_message_bubble">${html}
<div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="https://t.me/${ch}/${id}"><time datetime="${date}" class="time">12:00</time></a></div>
</div></div></div>`;

const tgPage = `<!DOCTYPE html><html><body><section class="tgme_channel_history js-message_history">
${post('job_python', 501, '<div class="tgme_widget_message_text js-message_text" dir="auto"><i class="emoji"><b>🔥</b></i><b>Стажёр Python-разработчик @ Пример</b><br/><br/>Боты, FastAPI, <a href="https://example.com/x">подробнее</a> &quot;удалённо&quot;</div>', '2026-10-01T09:00:00+00:00')}
${post('job_python', 502, '<div class="tgme_widget_message_reply"><div class="tgme_widget_message_metatext js-message_reply_text">цитата другого поста</div></div><div class="tgme_widget_message_photo_wrap"></div>', '2026-10-01T10:00:00+00:00')}
${post('job_python', 503, '<div class="tgme_widget_message_text js-message_text" dir="auto">Курс по Python со скидкой 50%</div>', '2026-10-01T11:00:00+00:00')}
</section></body></html>`;

// Ответ API «Работы России»: устроен как настоящий, данные выдуманы.
const trudvsemJson = JSON.stringify({
  status: '200',
  meta: { total: 3, limit: 100 },
  results: {
    vacancies: [
      { vacancy: {
        id: '5862d8e8-8a82-11f0-8356-efc3bb2eec02', 'job-name': 'Программист Python (стажёр)', salary_min: 60000, salary_max: 0,
        'creation-date': '2026-10-01', employment: 'Полная занятость', schedule: 'Удалённая работа',
        company: { companycode: '1197746306383', name: 'ООО «Пример»' }, region: { name: 'г. Москва' },
        duty: '<p>Писать ботов на Python</p>', requirement: { experience: 0, qualification: 'Знание Python' },
        vac_url: 'https://trudvsem.ru/vacancy/card/1197746306383/5862d8e8-8a82-11f0-8356-efc3bb2eec02',
      } },
      { vacancy: { id: 'x2', 'job-name': 'Водитель погрузчика', 'creation-date': '2026-10-01', company: { companycode: '1' } } },
      { vacancy: { id: 'x3', 'job-name': '' } },
    ],
  },
});

// Письмо подписки: ссылки обёрнуты в переход через сервис рассылки, у вакансии
// ссылка-заголовок и кнопка «Откликнуться».
const jobMail = {
  subject: 'Новые вакансии по вашему поиску',
  from: 'noreply@hh.ru',
  date: 'Fri, 02 Oct 2026 10:00:00 +0300',
  textHtml: `<table><tr><td>
<a href="https://click.example.com/r?u=https%3A%2F%2Fhh.ru%2Fvacancy%2F2001%3Fquery%3Dpython%26utm_source%3Dmail">Младший разработчик <b>чат-ботов</b></a>
<p>ООО Ромашка · от 70&nbsp;000 ₽ · Можно удалённо</p>
<a href="https://hh.ru/vacancy/2001?utm_source=mail">Откликнуться</a>
</td></tr><tr><td>
<a href="https://career.habr.com/vacancies/3005?utm_campaign=x">Стажёр по языковым моделям</a><p>Компания Б, гибрид</p>
<a href="https://hh.ru/applicant/settings">Настройки рассылки</a>
</td></tr></table>`,
};

module.exports = { rssHh, atom, tgPage, trudvsemJson, jobMail };
