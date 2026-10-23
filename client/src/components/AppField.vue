<script setup>
import { computed, ref } from "vue";
defineOptions({ inheritAttrs: false });
const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  multiline: Boolean,
});
const emit = defineEmits(["update:modelValue"]);
const control = ref(null);
// Native v-model handles IME, change-event fallbacks and updates during composition.
const model = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
function commit(event) {
  event.target.composing = false;
  if (event.target.value !== String(props.modelValue))
    emit("update:modelValue", event.target.value);
}
defineExpose({
  focus: (options) => control.value?.focus(options),
  select: () => control.value?.select(),
});
</script>
<template>
  <textarea
    v-if="multiline"
    ref="control"
    v-bind="$attrs"
    class="app-field"
    v-model="model"
    @change="commit"
    @blur="commit"
  ></textarea>
  <input
    v-else
    ref="control"
    v-bind="$attrs"
    class="app-field"
    v-model="model"
    @change="commit"
    @blur="commit"
  />
</template>
<style>
.app-field {
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid #dce4df;
  border-radius: 7px;
  background: #fff;
  color: var(--ink);
}
.app-field:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.app-field[aria-invalid="true"] {
  border-color: #b84d43;
}
@media (pointer: coarse) {
  input.app-field {
    min-height: 44px;
  }
}
</style>
