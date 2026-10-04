// Узел «Источники»: адреса поисков, лент RSS и страниц каналов, по одному элементу на источник.
// @include src/text.js as textLib
// @include src/trudvsem.js as trudvsemLib
// @include src/sources.js as sourcesLib
// @include src/sources.json as SOURCES

return sourcesLib.buildSources(SOURCES, { now: new Date().toISOString() }).map((s) => ({ json: s }));
