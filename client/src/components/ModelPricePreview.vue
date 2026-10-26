<script setup>
import { computed, ref } from "vue";
import AppSelect from "./AppSelect.vue";
import PackUsageBreakdown from "./PackUsageBreakdown.vue";
import { calculateBlendedPackPricing } from "../../../shared/pricing-simulation.mjs";
const props = defineProps({
  plan: Object,
  products: Array,
  hasCost: Boolean,
  hasOriginal: Boolean,
});
const version = ref("published");
const image = computed(() => props.plan.kind === "image");
const view = computed(() => {
  try {
    const products = (props.products || [])
      .filter(
        (p) =>
          version.value === "draft" ||
          (p.status === "published" && p.published),
      )
      .map((p) => ({
        ...(version.value === "draft" ? p.draft : p.published),
        id: p.id,
      }));
    return calculateBlendedPackPricing(props.plan, products);
  } catch (e) {
    return { error: e.message };
  }
});
</script>
<template>
  <section class="model-price-preview" aria-label="模型价格实时预览">
    <div class="section-line">
      <div>
        <h3>资源包综合价值与优惠</h3>
        <p class="tiny muted">
          按当前用量比例加权估算，实际任务按真实用量结算。
        </p>
      </div>
    </div>
    <div class="preview-controls">
      <AppSelect
        v-model="version"
        label="预览资源包版本"
        :options="[
          { value: 'published', label: '已上架价格' },
          { value: 'draft', label: '资源包草稿' },
        ]"
      />
    </div>
    <p v-if="view.error" class="info-banner" role="status">
      填写有效数值后显示预览：{{ view.error }}
    </p>
    <template v-else>
      <p class="info-banner">
        {{
          image
            ? "按当前规格计算可用整张图片。"
            : `总输入∶输出＝${view.config.usageMix.inputRatio}∶${view.config.usageMix.outputRatio}，其中 ${view.config.usageMix.cacheHitPercent}% 输入命中缓存。每档资源包给出一份综合估算。`
        }}赠送额度已计入。
      </p>
      <p v-if="!hasCost" class="tiny muted">采购成本未配置，暂不计算毛利。</p>
      <PackUsageBreakdown
        v-for="row in view.rows"
        :key="row.id"
        :row="row"
        :image="image"
        :has-original="hasOriginal"
        :has-cost="hasCost"
      />
      <p v-if="!view.rows.length" class="ai-empty">
        当前范围暂无资源包，可切换版本或到“资源包与预算”配置。
      </p>
      <p class="tiny muted">
        {{
          image
            ? "可用张数＝总额度 ÷ 每张扣费额度"
            : "综合可用 Token＝总额度 ÷ 加权每千 Token 扣费额度 × 1000"
        }}。普通输入、缓存、输出按比例共同消耗同一份额度，缓存不重复累加；原价和采购成本按各项预计数量汇总。用户优惠＝（综合原价－资源包售价）÷
        综合原价。
      </p>
      <p class="tiny muted">
        毛利按对应可用数量的采购成本估算，不含运营费用。多次小额调用的额度取整可能减少实际可用
        Token。
      </p>
    </template>
  </section>
</template>
<style scoped>
.model-price-preview {
  min-width: 0;
}
h3 {
  font-size: 18px;
  margin: 0 0 6px;
}
.section-line p {
  margin: 0;
}
.preview-controls {
  margin: 18px 0;
}
</style>
