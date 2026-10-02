// Подстановка полей в шаблон промпта: {{имя}}. Неизвестное поле остаётся видимым.
'use strict';

function fillPrompt(template, vars = {}) {
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? '') : m
  );
}

if (typeof module !== 'undefined') {
  module.exports = { fillPrompt };
}
