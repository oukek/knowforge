<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import bash from "highlight.js/lib/languages/bash";
import "highlight.js/styles/github.css";
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("go", go);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("bash", bash);
const props = defineProps({ content: { type: String, default: "" } });
const root = ref(null);
const html = computed(() => {
  const fragment = DOMPurify.sanitize(
    marked.parse(props.content, { breaks: true }),
    { RETURN_DOM_FRAGMENT: true },
  );
  for (const code of fragment.querySelectorAll("pre code")) {
    const language = [...code.classList]
      .find((name) => name.startsWith("language-"))
      ?.slice("language-".length);
    if (language === "flow") {
      const [title, ...steps] = code.textContent
        .trim()
        .split("\n")
        .filter(Boolean);
      const figure = document.createElement("figure");
      figure.className = "lesson-flow";
      const caption = document.createElement("figcaption");
      caption.textContent = title;
      const list = document.createElement("ol");
      for (const step of steps) {
        const [label, ...detail] = step.split("｜");
        const item = document.createElement("li");
        const strong = document.createElement("strong");
        strong.textContent = label;
        item.append(strong);
        if (detail.length) {
          const text = document.createElement("span");
          text.textContent = detail.join("｜");
          item.append(text);
        }
        list.append(item);
      }
      figure.append(caption, list);
      code.parentElement.replaceWith(figure);
      continue;
    }
    if (!language || !hljs.getLanguage(language)) continue;
    const highlighted = hljs.highlight(code.textContent, { language }).value;
    code.replaceChildren(
      DOMPurify.sanitize(highlighted, { RETURN_DOM_FRAGMENT: true }),
    );
    code.classList.add("hljs");
  }
  for (const table of fragment.querySelectorAll("table")) {
    const frame = document.createElement("div");
    frame.className = "prose-table";
    const viewport = document.createElement("div");
    viewport.className = "prose-table-scroll";
    viewport.setAttribute("role", "region");
    viewport.setAttribute(
      "aria-label",
      table.caption?.textContent || "资料表格",
    );
    const columns = table.rows[0]?.cells.length || 1;
    table.style.setProperty("--table-columns", columns);
    for (const header of table.querySelectorAll("thead th"))
      header.setAttribute("scope", "col");
    const hint = document.createElement("div");
    hint.className = "prose-table-hint";
    hint.textContent = "左右滑动查看完整表格";
    hint.setAttribute("aria-hidden", "true");
    table.replaceWith(frame);
    viewport.append(table);
    frame.append(viewport, hint);
  }
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
});
let observer;
function updateOverflow(viewport) {
  const overflow = viewport.scrollWidth > viewport.clientWidth + 1;
  viewport.parentElement.classList.toggle("is-overflowing", overflow);
  if (overflow) viewport.setAttribute("tabindex", "0");
  else viewport.removeAttribute("tabindex");
}
function refreshTables() {
  observer?.disconnect();
  for (const viewport of root.value?.querySelectorAll(".prose-table-scroll") ||
    []) {
    updateOverflow(viewport);
    observer?.observe(viewport);
  }
}
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      updateOverflow(target);
    }
  });
  refreshTables();
});
watch(html, refreshTables, { flush: "post" });
onBeforeUnmount(() => observer?.disconnect());
</script>
<template><div ref="root" class="prose" v-html="html"></div></template>
<style scoped>
.prose :deep(pre code.hljs) {
  padding: 0;
  background: transparent;
}
.prose :deep(.lesson-flow) {
  margin: 24px 0;
  padding: 20px;
  border: 1px solid #c5d5cb;
  border-radius: 10px;
  background: #edf4ef;
}
.prose :deep(.lesson-flow figcaption) {
  font-weight: 700;
  color: #294e3e;
  margin-bottom: 16px;
}
.prose :deep(.lesson-flow ol) {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  counter-reset: diagram-step;
}
.prose :deep(.lesson-flow li) {
  position: relative;
  margin: 0;
  padding: 12px 12px 12px 46px;
  border: 1px solid #b4c9bb;
  border-radius: 6px;
  background: #fff;
  counter-increment: diagram-step;
}
.prose :deep(.lesson-flow li::before) {
  content: counter(diagram-step, decimal-leading-zero);
  position: absolute;
  left: 12px;
  top: 12px;
  color: #69917a;
  font-size: 12px;
}
.prose :deep(.lesson-flow li:not(:last-child)::after) {
  content: "↓";
  position: absolute;
  left: 20px;
  bottom: -25px;
  color: #4b785e;
}
.prose :deep(.lesson-flow strong),
.prose :deep(.lesson-flow span) {
  display: block;
}
.prose :deep(.lesson-flow span) {
  font-size: 12px;
  margin-top: 4px;
}
</style>
