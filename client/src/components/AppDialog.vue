<script setup>
import { nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import Icon from "./Icon.vue";
import { lockModal, unlockModal } from "../composables/modal-lock.js";
const props = defineProps({
  open: Boolean,
  title: { type: String, required: true },
  description: String,
  busy: Boolean,
  width: { type: Number, default: 760 },
});
const emit = defineEmits(["close"]);
const panel = ref(null),
  id = useId(),
  owner = Symbol("dialog");
let previous;
function close() {
  if (!props.busy) emit("close");
}
function keydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
  if (event.key !== "Tab") return;
  const elements = [
    ...panel.value.querySelectorAll(
      'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
    ),
  ].filter((el) => el.getClientRects().length && !el.closest("[inert]"));
  if (!elements.length) {
    event.preventDefault();
    panel.value.focus();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === elements[0] ||
      document.activeElement === panel.value)
  ) {
    event.preventDefault();
    elements.at(-1).focus();
  } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
    event.preventDefault();
    elements[0].focus();
  }
}
watch(
  () => props.open,
  async (value) => {
    if (value) {
      previous = document.activeElement;
      lockModal(owner);
      await nextTick();
      panel.value?.focus({ preventScroll: true });
    } else {
      unlockModal(owner);
      await nextTick();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => unlockModal(owner));
</script>
<template>
  <Teleport to="body"
    ><div v-if="open" class="app-dialog-layer" @keydown="keydown">
      <div
        class="app-dialog-backdrop"
        @pointerdown.stop
        @pointerup.stop
        @click.stop.prevent="close"
      ></div>
      <section
        ref="panel"
        class="app-dialog-panel"
        :style="{ '--dialog-width': width + 'px' }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="id + '-title'"
        :aria-describedby="description ? id + '-description' : undefined"
        tabindex="-1"
        :aria-busy="busy"
      >
        <header class="app-dialog-heading">
          <div>
            <h2 :id="id + '-title'">{{ title }}</h2>
            <p v-if="description" :id="id + '-description'">
              {{ description }}
            </p>
          </div>
          <button
            type="button"
            class="icon-btn"
            :disabled="busy"
            aria-label="关闭弹窗"
            @click="close"
          >
            <Icon name="X" :size="21" />
          </button>
        </header>
        <div class="app-dialog-content"><slot /></div>
        <footer v-if="$slots.footer" class="app-dialog-footer">
          <slot name="footer" />
        </footer>
      </section></div
  ></Teleport>
</template>
<style>
.app-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.app-dialog-backdrop {
  position: absolute;
  inset: 0;
  background: #142f3766;
  backdrop-filter: blur(3px);
}
.app-dialog-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(var(--dialog-width), 100%);
  max-height: 90dvh;
  background: var(--surface, #fff);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 24px 80px #153c3330;
  outline: none;
  min-width: 0;
}
.app-dialog-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 22px 24px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.app-dialog-heading h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.5;
}
.app-dialog-heading p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
  margin: 6px 0 0;
}
.app-dialog-heading .icon-btn {
  flex-shrink: 0;
}
.app-dialog-content {
  padding: 22px 24px;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.app-dialog-content .ai-detail {
  margin: 0 0 18px;
}
.app-dialog-footer {
  padding: 14px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}
.app-dialog-content form {
  margin: 0;
}
.app-dialog-content .ai-admin-grid {
  margin-bottom: 20px;
}
@media (max-width: 767px),
  (pointer: coarse) and (max-width: 1023px),
  (pointer: coarse) and (orientation: portrait) {
  .app-dialog-layer {
    padding: 0;
    align-items: flex-end;
  }
  .app-dialog-panel {
    width: min(var(--dialog-width), 100%);
    max-height: 92dvh;
    border-radius: 20px 20px 0 0;
    border-bottom: 0;
  }
  .app-dialog-heading {
    padding: 22px 18px 16px;
  }
  .app-dialog-content {
    padding: 18px 18px max(20px, env(safe-area-inset-bottom));
  }
  .app-dialog-footer {
    padding: 14px 18px max(14px, env(safe-area-inset-bottom));
  }
}
</style>
