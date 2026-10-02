// Узел «Подборка»: подходящие вакансии -> одно или несколько сообщений для Телеграма.
// @include src/message.js as messageLib

return messageLib.buildDigest($input.all().map((it) => it.json)).map((text) => ({ json: { text } }));
