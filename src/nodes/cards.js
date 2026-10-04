// Узел «Карточки»: каждая подходящая вакансия -> своё сообщение с сопроводительным письмом.
// @include src/message.js as messageLib

return messageLib.buildCards($input.all().map((it) => it.json)).map((text) => ({ json: { text } }));
