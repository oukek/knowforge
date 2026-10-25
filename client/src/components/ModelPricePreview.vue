<script setup>
import { computed, ref } from "vue";
import AppSelect from "./AppSelect.vue";
import PackUsageBreakdown from "./PackUsageBreakdown.vue";
import { calculatePackPricing } from "../../../shared/pricing-simulation.mjs";
const props = defineProps({
  plan: Object,
  products: Array,
  hasCost: Boolean,
  hasOriginal: Boolean,
});
const version = ref("published");
const image = computed(() => props.plan.kind === "image");
const fields = computed(() =>
  image.value
    ? [["image", "图片"]]
    : [
        ["input", "普通输入"],
        ["cached", "缓存输入"],
        ["output", "输出"],
      ],
);
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
    return calculatePackPricing(props.plan, products);
  } catch (e) {
    return { error: e.message };
  }
});
</script>
<template>
  <section class="model-price-preview" aria-label="模型价格实时预览">
    <div class="section-line">
      <div>
        <h3>资源包能用多少，原价值多少</h3>
        <p class="tiny muted">
          由资源包总额度和模型扣费自动换算，无需填写用量。
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
            : "输入、输出、缓存各自按全部额度单独计算，是独立上限，不能同时获得或相加。"
        }}赠送额度已计入。
      </p>
      <p v-if="!hasCost" class="tiny muted">采购成本未配置，暂不计算毛利。</p>
      <PackUsageBreakdown
        v-for="row in view.rows"
        :key="row.id"
        :row="row"
        :fields="fields"
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
            : "单项可用 Token＝总额度 ÷ 该项每千 Token 扣费额度 × 1000"
        }}，向下取整。按原价费用＝可用数量 × 该项原价；Token
        原价按每百万换算。用户优惠＝（原价费用－资源包售价）÷ 原价费用。
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
