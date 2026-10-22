<script setup>
import { ref } from "vue";
import Icon from "./Icon.vue";
defineProps({
  disabled: Boolean,
  accept: { type: String, default: ".json,application/json" },
  label: { type: String, default: "选择备份文件" },
});
const emit = defineEmits(["select", "error"]);
const input = ref(null),
  dragging = ref(false),
  filename = ref("");
function receive(files) {
  dragging.value = false;
  if (!files?.length) return;
  if (files.length !== 1) {
    emit("error", "每次请选择一个备份文件");
    return;
  }
  filename.value = files[0].name;
  emit("select", files[0]);
}
function changed(event) {
  receive(event.target.files);
  event.target.value = "";
}
</script>
<template>
  <div
    class="app-upload"
    :class="{ 'is-dragging': dragging }"
    @dragover.prevent="!disabled && (dragging = true)"
    @dragleave.prevent="dragging = false"
    @drop.prevent="!disabled && receive($event.dataTransfer.files)"
  >
    <input
      ref="input"
      type="file"
      :accept="accept"
      tabindex="-1"
      hidden
      :disabled="disabled"
      @change="changed"
    />
    <button
      type="button"
      class="btn"
      :disabled="disabled"
      @click="input.click()"
    >
      <Icon name="Upload" :size="18" />{{ label }}
    </button>
    <span class="app-upload-hint"
      >JSON 文件 · 最大 12 MB<span class="app-upload-drop">
        · 也可拖拽到此处</span
      ></span
    >
    <span v-if="filename" class="app-upload-name" role="status"
      >已选择：{{ filename }}</span
    >
  </div>
</template>
<style>
.app-upload {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px;
  border: 1px dashed #b6cbbf;
  border-radius: 9px;
  background: #f8fbf9;
}
.app-upload.is-dragging {
  border-color: var(--green);
  background: var(--green-light);
}
.app-upload-hint,
.app-upload-name {
  font-size: 12px;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.app-upload-name {
  flex-basis: 100%;
  color: var(--green-dark);
}
@media (pointer: coarse), (max-width: 767px) {
  .app-upload .btn {
    width: 100%;
    min-height: 44px;
  }
  .app-upload-drop {
    display: none;
  }
}
</style>
