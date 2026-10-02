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

module.exports = { rssHh, atom, tgPage };
