// Узел «Промпт»: шаблон prompts/score.md с профилем кандидата и текстом вакансии.
// @include src/fill.js as fillLib
// @include prompts/score.md as PROMPT
// @include src/profile.md as PROFILE

return $input.all().map((it) => ({
  json: {
    ...it.json,
    prompt: fillLib.fillPrompt(PROMPT, {
      profile: PROFILE.trim(),
      title: it.json.title,
      text: it.json.text || '(текста нет)',
      source: it.json.source || '',
      link: it.json.link,
    }),
  },
}));
