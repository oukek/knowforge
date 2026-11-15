// Older generated prompts sometimes put fenced code inline with the prose.
// Restore fence boundaries without rewriting code or changing its semantics.
export function normalizeQuestionPrompt(value = "") {
  return String(value).replace(/(`{3,}|~{3,})([^\n]*?)\1/g, (match, fence, body) => {
    const language = body.match(/^(javascript|typescript|python|json|html|css|bash|sql|jsx|tsx|js|ts|py|go)(?=\s)/i);
    const code = language ? body.slice(language[0].length).trim() : body.trim();
    return `\n\n${fence}${language?.[0] || ""}\n${code}\n${fence}\n\n`;
  });
}
