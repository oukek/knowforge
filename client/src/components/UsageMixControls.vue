<script setup>
import AppField from "./AppField.vue";
import {
  DEFAULT_USAGE_MIX,
  USAGE_MIX_SOURCE,
} from "../../../shared/pricing-usage.mjs";
defineProps({
  modelValue: Object,
  cacheEnabled: { type: Boolean, default: true },
  busy: Boolean,
});
const emit = defineEmits(["update:modelValue"]);
const update = (current, key, value) =>
  emit("update:modelValue", { ...DEFAULT_USAGE_MIX, ...current, [key]: value });
</script>
<template>
  <fieldset class="usage-mix" :disabled="busy">
    <legend>综合用量比例 · 仅用于估算</legend>
    <div class="mix-fields">
      <label
        >总输入比例<AppField
          :model-value="modelValue?.inputRatio ?? DEFAULT_USAGE_MIX.inputRatio"
          inputmode="decimal"
          maxlength="14"
          @update:model-value="update(modelValue, 'inputRatio', $event)"
      /></label>
      <span aria-hidden="true">∶</span>
      <label
        >输出比例<AppField
          :model-value="
            modelValue?.outputRatio ?? DEFAULT_USAGE_MIX.outputRatio
          "
          inputmode="decimal"
          maxlength="14"
          @update:model-value="update(modelValue, 'outputRatio', $event)"
      /></label>
      <label class="cache-field"
        >缓存命中率 · 占总输入 %<AppField
          :model-value="
            cacheEnabled ? (modelValue?.cacheHitPercent ?? '0') : '0'
          "
          inputmode="decimal"
          maxlength="10"
          :disabled="!cacheEnabled"
          @update:model-value="update(modelValue, 'cacheHitPercent', $event)"
      /></label>
    </div>
    <p class="tiny muted">
      缓存属于总输入，普通输入＝总输入－命中缓存。例如总输入∶输出填 1∶3、缓存填
      30%，就是 1∶0.3∶3。
    </p>
    <p v-if="!cacheEnabled" class="tiny muted">
      未单独测算缓存，全部输入按普通输入计算。
    </p>
    <p class="tiny muted">
      初始参考输入∶输出≈15∶1，来自
      <a :href="USAGE_MIX_SOURCE" target="_blank" rel="noopener noreferrer"
        >OpenRouter 2025 研究</a
      >（约 6,000 输入／400 输出）。它不是本平台实际平均值；缓存默认 0%
      为保守假设，可按真实用量调整。
    </p>
    <button
      class="text-btn"
      type="button"
      @click="emit('update:modelValue', { ...DEFAULT_USAGE_MIX })"
    >
      恢复参考比例
    </button>
  </fieldset>
</template>
<style scoped>
.usage-mix {
  min-width: 0;
}
.mix-fields {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: 10px;
  margin: 16px 0 8px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: #536b5c;
  font-size: 12px;
  min-width: 0;
}
.mix-fields > span {
  align-self: end;
  padding: 0 0 12px;
}
.cache-field {
  grid-column: 1 / -1;
}
.usage-mix p {
  line-height: 1.8;
}
a {
  color: #176b58;
  text-decoration: underline;
}
</style>
