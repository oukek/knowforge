<script setup>
import { ref, useId } from "vue";
import Icon from "./Icon.vue";
const props = defineProps({ title: String, defaultOpen: Boolean });
const open = ref(props.defaultOpen);
const id = `disclosure-${useId()}`;
</script>
<template>
  <div class="app-disclosure" :data-open="open">
    <button
      type="button"
      class="app-disclosure-trigger"
      :aria-expanded="open"
      :aria-controls="id"
      @click="open = !open"
    >
      <slot name="title">{{ title }}</slot
      ><Icon class="app-disclosure-arrow" name="ChevronDown" :size="17" />
    </button>
    <div :id="id" v-show="open" class="app-disclosure-content"><slot /></div>
  </div>
</template>
<style>
.app-disclosure-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  min-height: 36px;
  padding: 0;
  color: inherit;
}
.app-disclosure-arrow {
  margin-left: auto;
  flex-shrink: 0;
  transition: transform 0.18s;
}
.app-disclosure[data-open="true"]
  > .app-disclosure-trigger
  > .app-disclosure-arrow {
  transform: rotate(180deg);
}
.app-disclosure-content {
  min-width: 0;
}
@media (pointer: coarse), (max-width: 767px) {
  .app-disclosure-trigger {
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-disclosure-arrow {
    transition: none;
  }
}
</style>
