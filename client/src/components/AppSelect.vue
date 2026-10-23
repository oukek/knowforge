<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import Icon from "./Icon.vue";

defineOptions({ inheritAttrs: false });
const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: "" },
  options: { type: Array, required: true },
  label: { type: String, required: true },
  disabled: Boolean,
  placeholder: { type: String, default: "请选择" },
});
const emit = defineEmits(["update:modelValue", "change"]);
const uid = useId();
const listId = `select-${uid}`;
const open = ref(false),
  sheet = ref(false),
  active = ref(-1);
const trigger = ref(null),
  panel = ref(null),
  list = ref(null);
const position = ref({});
const selected = computed(() =>
  props.options.find((item) => item.value === props.modelValue),
);
let media,
  previousOverflow,
  previousInert,
  locked = false,
  search = "",
  searchTimer;
const enabled = () =>
  props.options
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((i) => i >= 0);

function lockScroll(value) {
  if (value && !locked) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const app = document.getElementById("app");
    previousInert = app?.inert;
    if (app) app.inert = true;
    locked = true;
  } else if (!value && locked) {
    document.body.style.overflow = previousOverflow;
    const app = document.getElementById("app");
    if (app) app.inert = previousInert;
    locked = false;
  }
}
function place() {
  if (!open.value || sheet.value || !trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const left = viewport?.offsetLeft ?? 0,
    top = viewport?.offsetTop ?? 0;
  const below = top + height - rect.bottom - 12;
  const above = rect.top - top - 12;
  const upward = below < 220 && above > below;
  const menuWidth = Math.min(Math.max(rect.width, 240), width - 24);
  position.value = {
    width: `${menuWidth}px`,
    left: `${Math.max(left + 12, Math.min(rect.left, left + width - menuWidth - 12))}px`,
    top: upward ? "auto" : `${rect.bottom + 6}px`,
    bottom: upward ? `${window.innerHeight - rect.top + 6}px` : "auto",
    maxHeight: `${Math.max(44, Math.min(360, upward ? above : below))}px`,
  };
}
function revealActive() {
  nextTick(() =>
    list.value
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" }),
  );
}
async function show(direction = 1) {
  if (props.disabled || open.value) return;
  active.value = props.options.findIndex(
    (item) => item.value === props.modelValue && !item.disabled,
  );
  if (active.value < 0)
    active.value =
      direction < 0 ? (enabled().at(-1) ?? -1) : (enabled()[0] ?? -1);
  open.value = true;
  lockScroll(sheet.value);
  place();
  await nextTick();
  list.value?.focus({ preventScroll: true });
  revealActive();
}
function close(restoreFocus = true) {
  open.value = false;
  lockScroll(false);
  search = "";
  clearTimeout(searchTimer);
  if (restoreFocus) trigger.value?.focus({ preventScroll: true });
}
function choose(index) {
  const item = props.options[index];
  if (!item || item.disabled) return;
  emit("update:modelValue", item.value);
  if (item.value !== props.modelValue) emit("change", item.value);
  close();
}
function move(direction) {
  const indices = enabled();
  if (!indices.length) return;
  const index = indices.indexOf(active.value);
  active.value = indices[(index + direction + indices.length) % indices.length];
  revealActive();
}
function onKey(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
  } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    if (event.key === "Home") active.value = enabled()[0] ?? -1;
    else if (event.key === "End") active.value = enabled().at(-1) ?? -1;
    else move(event.key === "ArrowDown" ? 1 : -1);
    revealActive();
  } else if (event.key === "Enter" || event.key === " ") {
    if (event.target === list.value) {
      event.preventDefault();
      choose(active.value);
    }
  } else if (event.key === "Tab") {
    if (!sheet.value) close();
    else {
      event.preventDefault();
      const closeButton = panel.value?.querySelector(".app-select-close");
      (document.activeElement === list.value
        ? closeButton
        : list.value
      )?.focus();
    }
  } else if (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    search += event.key.toLocaleLowerCase();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      search = "";
    }, 600);
    const match = props.options.findIndex(
      (item) =>
        !item.disabled &&
        String(item.label).toLocaleLowerCase().startsWith(search),
    );
    if (match >= 0) {
      active.value = match;
      revealActive();
    }
  }
}
function modeChanged() {
  sheet.value = media.matches;
  if (open.value) {
    lockScroll(sheet.value);
    place();
    nextTick(() => list.value?.focus({ preventScroll: true }));
  }
}
function scrolled(event) {
  if (open.value && !sheet.value && !panel.value?.contains(event.target))
    place();
}
watch(
  () => props.disabled,
  (value) => {
    if (value) close(false);
  },
);
watch(
  () => props.options,
  () => {
    if (open.value) {
      active.value = props.options.findIndex(
        (item) => item.value === props.modelValue && !item.disabled,
      );
      if (active.value < 0) active.value = enabled()[0] ?? -1;
    }
  },
);
onMounted(() => {
  media = window.matchMedia(
    "(max-width: 767px), (pointer: coarse) and (max-width: 1023px), (pointer: coarse) and (orientation: portrait)",
  );
  modeChanged();
  media.addEventListener("change", modeChanged);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", scrolled, true);
  window.visualViewport?.addEventListener("resize", place);
});
onBeforeUnmount(() => {
  lockScroll(false);
  clearTimeout(searchTimer);
  media?.removeEventListener("change", modeChanged);
  window.removeEventListener("resize", place);
  window.removeEventListener("scroll", scrolled, true);
  window.visualViewport?.removeEventListener("resize", place);
});
</script>

<template>
  <span
    class="app-select"
    :class="{ 'is-open': open, 'is-disabled': disabled }"
  >
    <button
      v-bind="$attrs"
      ref="trigger"
      type="button"
      class="app-select-trigger"
      role="combobox"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      :disabled="disabled"
      @click="open ? close() : show()"
      @keydown.down.prevent="show(1)"
      @keydown.up.prevent="show(-1)"
    >
      <span>{{ selected?.label ?? placeholder }}</span
      ><Icon name="ChevronDown" :size="16" />
    </button>
    <Teleport to="body">
      <div v-if="open" class="app-select-layer" :class="{ 'is-sheet': sheet }">
        <div
          class="app-select-backdrop"
          aria-hidden="true"
          @pointerdown.prevent="close()"
        ></div>
        <section
          ref="panel"
          class="app-select-panel"
          :style="sheet ? {} : position"
          :role="sheet ? 'dialog' : undefined"
          :aria-modal="sheet ? true : undefined"
          :aria-labelledby="sheet ? `${listId}-title` : undefined"
          @keydown="onKey"
        >
          <header v-if="sheet" class="app-select-heading">
            <span class="app-select-handle" aria-hidden="true"></span>
            <h2 :id="`${listId}-title`">{{ label }}</h2>
            <button
              type="button"
              class="app-select-close"
              aria-label="关闭选择"
              @click="close()"
            >
              <Icon name="X" :size="21" />
            </button>
          </header>
          <div
            :id="listId"
            ref="list"
            class="app-select-list"
            role="listbox"
            tabindex="0"
            :aria-label="label"
            :aria-activedescendant="
              active >= 0 ? `${listId}-${active}` : undefined
            "
          >
            <div
              v-for="(item, index) in options"
              :id="`${listId}-${index}`"
              :key="item.value"
              class="app-select-option"
              role="option"
              :aria-selected="item.value === modelValue"
              :aria-disabled="item.disabled || undefined"
              :data-active="active === index"
              @pointermove="!item.disabled && (active = index)"
              @click="choose(index)"
            >
              <span>{{ item.label }}</span
              ><Icon v-if="item.value === modelValue" name="Check" :size="18" />
            </div>
            <p v-if="!options.length" class="app-select-empty">暂无可选项</p>
          </div>
        </section>
      </div>
    </Teleport>
  </span>
</template>

<style>
.app-select {
  display: inline-block;
  min-width: 0;
  max-width: 100%;
  vertical-align: middle;
}
.app-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  padding: 9px 12px;
  border: 1px solid #dce4df;
  border-radius: 7px;
  background: #fff;
  text-align: left;
  font-size: 13px;
}
.app-select-trigger > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-select-trigger > svg {
  flex-shrink: 0;
  color: var(--green);
  transition: transform 0.18s;
}
.app-select.is-open .app-select-trigger {
  border-color: var(--green);
  box-shadow: 0 0 0 3px #28765c12;
}
.app-select.is-open .app-select-trigger > svg {
  transform: rotate(180deg);
}
.app-select-trigger:focus-visible,
.app-select-close:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 3px;
}
.app-select-layer {
  position: fixed;
  inset: 0;
  z-index: 150;
}
.app-select-backdrop {
  position: absolute;
  inset: 0;
}
.app-select-panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  padding: 5px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 11px;
  box-shadow: 0 12px 45px #153c3326;
  overflow: hidden;
}
.app-select-list {
  overflow: auto;
  min-height: 0;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  outline: none;
}
.app-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.app-select-option > svg {
  flex-shrink: 0;
  color: var(--green);
}
.app-select-option[data-active="true"] {
  background: #f0f5f2;
}
.app-select-option[aria-selected="true"] {
  color: var(--green-dark);
  font-weight: 600;
  background: var(--green-light);
}
.app-select-list:focus-visible .app-select-option[data-active="true"] {
  outline: 2px solid var(--green);
  outline-offset: -2px;
}
.app-select-option[aria-disabled="true"] {
  opacity: 0.45;
  cursor: not-allowed;
}
.app-select-empty {
  padding: 12px;
  color: var(--muted);
}
.is-sheet .app-select-backdrop {
  background: #142f3766;
  backdrop-filter: blur(3px);
}
.is-sheet .app-select-panel {
  inset: auto 0 0;
  width: 100%;
  max-height: 78vh;
  max-height: 78dvh;
  padding: 0 12px max(12px, env(safe-area-inset-bottom));
  border-radius: 20px 20px 0 0;
  border-bottom: 0;
  animation: select-sheet-in 0.18s ease-out;
}
.app-select-heading {
  position: relative;
  flex-shrink: 0;
  padding: 28px 48px 15px 10px;
}
.app-select-heading h2 {
  margin: 0;
  font-size: 17px;
  line-height: 1.5;
}
.app-select-handle {
  position: absolute;
  top: 9px;
  left: calc(50% - 18px);
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: #cbd7d1;
}
.app-select-close {
  position: absolute;
  right: 0;
  top: 19px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}
.is-sheet .app-select-option {
  font-size: 16px;
  min-height: 52px;
  margin-bottom: 4px;
}
@keyframes select-sheet-in {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-select-trigger > svg {
    transition: none;
  }
  .is-sheet .app-select-panel {
    animation: none;
  }
}
</style>
