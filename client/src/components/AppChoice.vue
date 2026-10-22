<script setup>
import { computed } from "vue";
import Icon from "./Icon.vue";
defineOptions({ inheritAttrs: false });
const props = defineProps({
  modelValue: { type: [Array, Boolean, String, Number], default: false },
  value: { type: [String, Number], default: undefined },
  type: { type: String, default: "checkbox" },
  name: String,
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue", "change"]);
const checked = computed(() =>
  props.type === "radio"
    ? props.modelValue === props.value
    : Array.isArray(props.modelValue)
      ? props.modelValue.includes(props.value)
      : Boolean(props.modelValue),
);
function change(event) {
  const value =
    props.type === "radio"
      ? props.value
      : Array.isArray(props.modelValue)
        ? event.target.checked
          ? [...props.modelValue, props.value]
          : props.modelValue.filter((item) => item !== props.value)
        : event.target.checked;
  emit("update:modelValue", value);
  emit("change", value);
}
</script>
<template>
  <label
    v-bind="$attrs"
    class="app-choice"
    :class="{ 'is-checked': checked, 'is-disabled': disabled }"
  >
    <input
      class="app-choice-input"
      :type="type"
      :name="name"
      :value="value"
      :checked="checked"
      :disabled="disabled"
      @change="change"
    />
    <span
      class="app-choice-mark"
      :class="{ 'is-radio': type === 'radio' }"
      aria-hidden="true"
      ><span v-if="type === 'radio' && checked" class="app-choice-dot"></span
      ><Icon v-else-if="checked" name="Check" :size="13"
    /></span>
    <slot />
  </label>
</template>
<style>
.app-choice {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  min-height: 32px;
}
.app-choice > .app-choice-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.app-choice-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border: 1.5px solid #a4b6ac;
  border-radius: 5px;
  color: #fff;
  background: #fff;
}
.app-choice-mark.is-radio {
  border-radius: 50%;
}
.is-checked > .app-choice-mark {
  border-color: var(--green);
  background: var(--green);
}
.app-choice-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fff;
}
.app-choice-input:focus-visible + .app-choice-mark {
  outline: 3px solid #74ac98;
  outline-offset: 3px;
}
.app-choice.is-disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
@media (pointer: coarse), (max-width: 767px) {
  .app-choice {
    min-height: 44px;
  }
  .app-choice-mark {
    width: 21px;
    height: 21px;
    flex-basis: 21px;
  }
}
</style>
