<script setup>
import { ref, watch, onBeforeUnmount } from "vue";
import AppDialog from "./AppDialog.vue";
import {
  themes,
  themeId,
  applyTheme,
  saveTheme,
  storedTheme,
} from "../theme.js";
import { toast } from "../store.js";
const props = defineProps({ open: Boolean });
const emit = defineEmits(["close"]);
const draft = ref(themeId.value),
  error = ref("");
watch(
  () => props.open,
  (open) => {
    if (open) {
      draft.value = themeId.value;
      error.value = "";
    }
  },
);
function preview(id) {
  draft.value = id;
  applyTheme(id);
}
function close() {
  applyTheme(storedTheme());
  emit("close");
}
function save() {
  try {
    saveTheme(draft.value);
    emit("close");
    toast("界面主题已更新");
  } catch {
    error.value = "浏览器暂时无法保存偏好，请检查存储设置后重试。";
  }
}
onBeforeUnmount(() => {
  if (props.open) applyTheme(storedTheme());
});
</script>
<template>
  <AppDialog
    :open="open"
    title="选择界面主题"
    description="点击预览配色，保存后在当前浏览器生效。"
    :width="640"
    @close="close"
  >
    <div class="theme-options" role="group" aria-label="内置色系">
      <button
        v-for="theme in themes"
        :key="theme.id"
        class="theme-option"
        :class="{ selected: draft === theme.id }"
        :aria-pressed="draft === theme.id"
        :style="{
          '--sample-primary': theme.primary,
          '--sample-soft': theme.soft,
          '--sample-ink': theme.ink,
          '--sample-border': theme.border,
        }"
        @click="preview(theme.id)"
      >
        <span class="theme-sample" aria-hidden="true"
          ><span class="sample-sidebar"><i></i><i></i><i></i></span
          ><span class="sample-content"><i></i><i></i><i></i><b></b></span
        ></span>
        <span class="theme-option-heading"
          ><strong>{{ theme.name }}</strong
          ><span v-if="draft === theme.id" class="theme-selected">已选择</span
          ><span v-else-if="theme.id === 'graphite'" class="tiny muted"
            >默认</span
          ></span
        >
        <span class="tiny muted">{{ theme.description }}</span>
      </button>
    </div>
    <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    <template #footer
      ><button class="btn" @click="close">取消</button
      ><button class="btn primary" @click="save">保存主题</button></template
    >
  </AppDialog>
</template>
<style scoped>
.theme-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.theme-option {
  text-align: left;
  border: 2px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  background: var(--surface);
  min-width: 0;
}
.theme-option.selected {
  border-color: var(--green);
}
.theme-sample {
  display: flex;
  height: 100px;
  border: 1px solid var(--sample-border);
  border-radius: 7px;
  background: white;
  overflow: hidden;
  margin-bottom: 12px;
  gap: 15px;
}
.sample-sidebar {
  width: 28%;
  background: var(--sample-soft);
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.sample-sidebar i {
  height: 4px;
  width: 100%;
  background: var(--sample-border);
  border-radius: 2px;
}
.sample-sidebar i:first-child {
  background: var(--sample-primary);
}
.sample-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  padding: 17px 14px 12px 0;
}
.sample-content i {
  height: 4px;
  background: var(--sample-border);
  width: 100%;
  border-radius: 2px;
}
.sample-content i:first-child {
  background: var(--sample-ink);
  width: 55%;
  height: 6px;
}
.sample-content b {
  height: 16px;
  width: 45%;
  background: var(--sample-primary);
  border-radius: 4px;
  margin-top: 3px;
}
.theme-option-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.theme-selected {
  font-size: 11px;
  color: var(--green);
}
@media (max-width: 380px) {
  .theme-option {
    padding: 9px;
  }
  .theme-option-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
  .theme-sample {
    height: 85px;
  }
}
</style>
