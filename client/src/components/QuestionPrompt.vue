<script setup>
import { ref, watch } from "vue";
import Markdown from "./Markdown.vue";
import { normalizeQuestionPrompt } from "../../../shared/question-prompt.mjs";
const props = defineProps({ content: { type: String, default: "" } });
const content = ref("");
watch(() => props.content, async (value, _, onCleanup) => {
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  const source = normalizeQuestionPrompt(value);
  content.value = source;
  const blocks = [...source.matchAll(/```(js|javascript|jsx|json)\n([\s\S]*?)\n```/g)];
  if (!blocks.length) return;
  try {
    const [prettier, babel, estree] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/babel"),
      import("prettier/plugins/estree"),
    ]);
    let formatted = source;
    for (const block of blocks) {
      try {
        const code = await prettier.format(block[2], {
          parser: block[1] === "json" ? "json" : "babel",
          plugins: [babel.default, estree.default],
          printWidth: 80,
          tabWidth: 2,
        });
        formatted = formatted.replace(block[0], "```" + block[1] + "\n" + code.trimEnd() + "\n```");
      } catch { /* Keep the original code if it is incomplete or invalid. */ }
    }
    if (!cancelled) content.value = formatted;
  } catch { /* The original Markdown remains readable if loading fails. */ }
}, { immediate: true });
</script>
<template>
  <Markdown class="question-prompt" :content="content" />
</template>
<style scoped>
.question-prompt {
  min-width: 0;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.85;
  margin: 18px 0 22px;
}
.question-prompt :deep(p) { line-height: 1.85; }
.question-prompt :deep(> :last-child) { margin-bottom: 0; }
.question-prompt :deep(pre) {
  max-width: 100%;
  border: 1px solid var(--theme-border);
  padding: 18px;
  font-size: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 2;
}
.question-prompt :deep(h1),
.question-prompt :deep(h2),
.question-prompt :deep(h3) { font-size: 1.15em; line-height: 1.6; }
@media (max-width: 600px) {
  .question-prompt { font-size: 14px; }
  .question-prompt :deep(pre) { padding: 12px; font-size: 12px; }
}
</style>
