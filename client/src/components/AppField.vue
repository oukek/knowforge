<script setup>
import { ref } from "vue";
defineOptions({ inheritAttrs: false });
defineProps({
  modelValue: { type: [String, Number], default: "" },
  multiline: Boolean,
});
const emit = defineEmits(["update:modelValue"]);
const control = ref(null);
let composing = false;
function input(event) {
  if (!composing && !event.isComposing)
    emit("update:modelValue", event.target.value);
}
function compositionEnd(event) {
  composing = false;
  emit("update:modelValue", event.target.value);
}
defineExpose({
  focus: (options) => control.value?.focus(options),
  select: () => control.value?.select(),
});
</script>
<template>
  <component
    :is="multiline ? 'textarea' : 'input'"
    ref="control"
    v-bind="$attrs"
    class="app-field"
    :value="modelValue"
    @input="input"
    @compositionstart="composing = true"
    @compositionend="compositionEnd"
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
