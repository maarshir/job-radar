// Узел «Источники»: адреса поисков hh.ru, лент RSS и страниц каналов, по одному элементу на источник.
// @include src/sources.js as sourcesLib
// @include src/sources.json as SOURCES

return sourcesLib.buildSources(SOURCES).map((s) => ({ json: s }));
