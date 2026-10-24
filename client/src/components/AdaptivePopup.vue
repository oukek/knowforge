<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount, watch, useId } from "vue";
import Icon from "./Icon.vue";
import { lockModal, unlockModal } from "../composables/modal-lock.js";
const modalOwner = Symbol("popup");
const props = defineProps({
  open: Boolean,
  anchor: Object,
  title: String,
  width: { type: Number, default: 336 },
});
const emit = defineEmits(["close"]);
const id = `popup-${useId()}`,
  panel = ref(null),
  sheet = ref(false),
  position = ref({});
let media;
function lock(value) {
  value ? lockModal(modalOwner) : unlockModal(modalOwner);
}
function place() {
  if (!props.open || !props.anchor || sheet.value) return;
  const rect = props.anchor.getBoundingClientRect(),
    width = Math.min(props.width, innerWidth - 24);
  const above = rect.top - 12,
    below = innerHeight - rect.bottom - 12;
  const upward = below < 420 && above > below;
  position.value = {
    width: `${width}px`,
    left: `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`,
    top: upward ? "auto" : `${rect.bottom + 6}px`,
    bottom: upward ? `${innerHeight - rect.top + 6}px` : "auto",
    maxHeight: `${Math.max(80, upward ? above : below)}px`,
  };
}
function mode() {
  sheet.value = media.matches;
  if (props.open) {
    lock(sheet.value);
    place();
  }
}
function close() {
  emit("close");
}
function keydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
  if (event.key === "Tab") {
    const elements = [
      ...panel.value.querySelectorAll('button:not(:disabled),[tabindex="0"]'),
    ].filter((el) => el.getClientRects().length);
    if (!elements.length) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === elements[0]) {
      event.preventDefault();
      elements.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
      event.preventDefault();
      elements[0].focus();
    }
  }
}
watch(
  () => props.open,
  async (value) => {
    lock(value && sheet.value);
    if (value) {
      place();
      await nextTick();
      (
        panel.value?.querySelector("[data-autofocus]") ||
        panel.value?.querySelector("button:not(:disabled)")
      )?.focus({ preventScroll: true });
    } else {
      await nextTick();
      props.anchor?.focus({ preventScroll: true });
    }
  },
);
onMounted(() => {
  media = matchMedia(
    "(max-width: 767px), (pointer: coarse) and (max-width: 1023px), (pointer: coarse) and (orientation: portrait)",
  );
  mode();
  media.addEventListener("change", mode);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
});
onBeforeUnmount(() => {
  lock(false);
  media?.removeEventListener("change", mode);
  window.removeEventListener("resize", place);
  window.removeEventListener("scroll", place, true);
});
</script>
<template>
  <Teleport to="body"
    ><div v-if="open" class="adaptive-layer" :class="{ 'is-sheet': sheet }">
      <div
        class="adaptive-backdrop"
        aria-hidden="true"
        @pointerdown.stop
        @pointerup.stop
        @click.stop.prevent="close"
      ></div>
      <section
        ref="panel"
        class="adaptive-panel"
        role="dialog"
        :aria-modal="sheet ? true : undefined"
        :aria-labelledby="id"
        :style="sheet ? {} : position"
        @keydown="keydown"
      >
        <header class="adaptive-heading">
          <h2 :id="id">{{ title }}</h2>
          <button
            type="button"
            class="icon-btn"
            aria-label="关闭日期选择"
            @click="close"
          >
            <Icon name="X" :size="20" />
          </button>
        </header>
        <div class="adaptive-content"><slot /></div>
      </section></div
  ></Teleport>
</template>
<style>
.adaptive-layer {
  position: fixed;
  inset: 0;
  z-index: 150;
}
.adaptive-backdrop {
  position: absolute;
  inset: 0;
}
.adaptive-panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 45px #153c3326;
  overflow: hidden;
}
.adaptive-heading {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 4px;
}
.adaptive-heading h2 {
  font-size: 15px;
  margin: 0;
}
.adaptive-heading .icon-btn {
  min-height: 40px;
  min-width: 40px;
}
.adaptive-content {
  overflow: auto;
  overscroll-behavior: contain;
  padding: 8px 16px 16px;
  min-height: 0;
}
.is-sheet .adaptive-backdrop {
  background: #142f3766;
  backdrop-filter: blur(3px);
}
.is-sheet .adaptive-panel {
  inset: auto 0 0;
  max-height: 88vh;
  max-height: 88dvh;
  border-radius: 20px 20px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}
.is-sheet .adaptive-content {
  width: 100%;
  max-width: 480px;
  margin: auto;
}
.is-sheet .adaptive-heading {
  padding-top: 18px;
}
</style>
