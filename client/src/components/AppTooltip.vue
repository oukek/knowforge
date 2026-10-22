<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref, useId } from "vue";
const id = `tooltip-${useId()}`,
  text = ref(""),
  position = ref({}),
  bubble = ref(null);
let observer,
  target,
  timer,
  lastTouch = 0;
const translations = {
  "Fold line": "折叠代码",
  "Unfold line": "展开代码",
  unfold: "展开代码",
};
function enhance(root) {
  if (!(root instanceof Element)) return;
  const elements = root.hasAttribute("title")
    ? [root, ...root.querySelectorAll("[title]")]
    : root.querySelectorAll("[title]");
  for (const element of elements) {
    const value = element.getAttribute("title");
    if (value) {
      element.dataset.uiTooltip = translations[value] || value;
      element.removeAttribute("title");
    }
  }
}
function hide() {
  clearTimeout(timer);
  if (target) {
    const ids = (target.getAttribute("aria-describedby") || "")
      .split(" ")
      .filter((value) => value && value !== id);
    if (ids.length) target.setAttribute("aria-describedby", ids.join(" "));
    else target.removeAttribute("aria-describedby");
  }
  target = null;
  text.value = "";
}
async function show(element) {
  hide();
  target = element;
  text.value = element.dataset.uiTooltip;
  element.setAttribute(
    "aria-describedby",
    [element.getAttribute("aria-describedby"), id].filter(Boolean).join(" "),
  );
  await nextTick();
  if (target !== element || !bubble.value) return;
  if (!element.isConnected) {
    hide();
    return;
  }
  const rect = element.getBoundingClientRect(),
    tip = bubble.value.getBoundingClientRect();
  position.value = {
    left: `${Math.max(8, Math.min(rect.left + (rect.width - tip.width) / 2, innerWidth - tip.width - 8))}px`,
    top: `${rect.top > tip.height + 12 ? rect.top - tip.height - 8 : Math.min(rect.bottom + 8, innerHeight - tip.height - 8)}px`,
  };
}
function tooltipElement(event) {
  return (
    event.target.closest?.("[data-ui-tooltip]") ||
    event.target
      .closest?.(".cm-gutterElement")
      ?.querySelector("[data-ui-tooltip]")
  );
}
function over(event) {
  const element = tooltipElement(event);
  if (element && event.pointerType !== "touch") void show(element);
}
function out(event) {
  if (event.pointerType !== "touch") hide();
}
function focus(event) {
  if (Date.now() - lastTouch < 700) return;
  const element = tooltipElement(event);
  if (element) void show(element);
}
function touch(event) {
  if (event.pointerType !== "touch") return;
  lastTouch = Date.now();
  const element = tooltipElement(event);
  if (!element) {
    hide();
    return;
  }
  void show(element);
  timer = setTimeout(hide, 2500);
}
function escape(event) {
  if (event.key === "Escape") hide();
}
onMounted(() => {
  enhance(document.body);
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") enhance(record.target);
      else for (const node of record.addedNodes) enhance(node);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title"],
  });
  document.addEventListener("pointerover", over);
  document.addEventListener("pointerout", out);
  document.addEventListener("focusin", focus);
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", touch);
  document.addEventListener("keydown", escape);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
});
onBeforeUnmount(() => {
  hide();
  observer?.disconnect();
  document.removeEventListener("pointerover", over);
  document.removeEventListener("pointerout", out);
  document.removeEventListener("focusin", focus);
  document.removeEventListener("focusout", hide);
  document.removeEventListener("pointerdown", touch);
  document.removeEventListener("keydown", escape);
  window.removeEventListener("scroll", hide, true);
  window.removeEventListener("resize", hide);
});
</script>
<template>
  <Teleport to="body"
    ><div
      v-if="text"
      :id="id"
      ref="bubble"
      role="tooltip"
      class="app-tooltip"
      :style="position"
    >
      {{ text }}
    </div></Teleport
  >
</template>
<style>
.app-tooltip {
  position: fixed;
  z-index: 250;
  max-width: min(280px, calc(100vw - 16px));
  padding: 7px 11px;
  border-radius: 7px;
  background: #203e34;
  color: #fff;
  font-size: 12px;
  line-height: 1.6;
  box-shadow: 0 4px 16px #173a3026;
  pointer-events: none;
  overflow-wrap: anywhere;
}
@media (pointer: coarse) {
  .app-tooltip {
    font-size: 14px;
    padding: 10px 13px;
  }
}
</style>
