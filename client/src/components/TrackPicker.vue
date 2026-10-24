<script setup>
import AppChoice from "./AppChoice.vue";
defineProps({
  modelValue: { type: Array, required: true },
  tracks: { type: Array, required: true },
});
defineEmits(["update:modelValue"]);
</script>
<template>
  <fieldset class="track-picker">
    <legend>
      学习主线 <span class="muted tiny">可多选 · 重合知识点只安排一次</span>
    </legend>
    <div class="track-options">
      <AppChoice
        v-for="track in tracks"
        :key="track.id"
        :value="track.id"
        :model-value="modelValue"
        @update:model-value="$emit('update:modelValue', $event)"
      >
        <span
          ><strong>{{ track.title }}</strong
          ><small>{{ track.description }}</small></span
        >
      </AppChoice>
    </div>
  </fieldset>
</template>
<style>
.track-picker {
  border: 0;
  padding: 0;
  margin: 0 0 22px;
  min-width: 0;
}
.track-picker legend {
  font-weight: 600;
  margin-bottom: 12px;
}
.track-picker legend span {
  display: inline-block;
  font-weight: 400;
  margin-left: 8px;
}
.track-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.track-options .app-choice {
  border: 1px solid var(--border, #dce5de);
  border-radius: 8px;
  padding: 12px;
  align-items: flex-start;
}
.track-options .is-checked {
  background: #edf5ee;
  border-color: #86a58d;
}
.track-options strong {
  display: block;
  font-size: 13px;
}
.track-options small {
  display: block;
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted, #657565);
  margin-top: 5px;
}
@media (max-width: 1100px) {
  .track-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .track-options {
    grid-template-columns: 1fr;
  }
}
</style>
