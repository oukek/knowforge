<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import "highlight.js/styles/github.css";
hljs.registerLanguage("javascript", javascript);
const props = defineProps({ content: { type: String, default: "" } });
const root = ref(null);
const html = computed(() => {
  const fragment = DOMPurify.sanitize(
    marked.parse(props.content, { breaks: true }),
    { RETURN_DOM_FRAGMENT: true },
  );
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
