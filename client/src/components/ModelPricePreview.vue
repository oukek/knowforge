<script setup>
import { computed, ref } from "vue";
import AppSelect from "./AppSelect.vue";
import {
  calculatePricingSimulation,
  formatPricingNumber as fmt,
} from "../../../shared/pricing-simulation.mjs";
const props = defineProps({
  plan: Object,
  products: Array,
  hasCost: Boolean,
  hasListPrice: Boolean,
});
const version = ref("published"),
  basis = ref("sample");
const image = computed(() => props.plan.kind === "image");
const fields = computed(() =>
  image.value
    ? [["image", "图片"]]
    : [
        ["input", "输入"],
        ["cached", "缓存"],
        ["output", "输出"],
      ],
);
const money = (v, digits = 4) => {
  if (v == null) return "—";
  const text = fmt(v, digits);
  if (text.startsWith("<")) return "<¥" + text.slice(1);
  if (text.startsWith(">−")) return ">−¥" + text.slice(2);
  return text.startsWith("−") ? "−¥" + text.slice(1) : "¥" + text;
};
const view = computed(() => {
  try {
    const plan = { ...props.plan };
    if (!image.value && basis.value !== "sample") {
      plan.inputTokens = basis.value === "output" ? "0" : "1000000";
      plan.outputTokens = basis.value === "output" ? "1000000" : "0";
      plan.cachedTokens = basis.value === "cached" ? "1000000" : "0";
    }
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
    return calculatePricingSimulation(plan, products);
  } catch (e) {
    return { error: e.message };
  }
});
</script>
<template>
  <section class="model-price-preview" aria-label="模型价格实时预览">
    <div class="section-line">
      <div>
        <h3>实时价格预览</h3>
        <p class="tiny muted">
          修改配置参数后自动更新，保存前不会改变正式价格。
        </p>
      </div>
      <span class="badge subtle">{{
        image ? "元／张" : "元／百万 Token"
      }}</span>
    </div>
    <div class="preview-controls">
      <AppSelect
        v-model="version"
        label="预览资源包版本"
        :options="[
          { value: 'published', label: '已上架价格' },
          { value: 'draft', label: '资源包草稿' },
        ]"
      /><AppSelect
        v-if="!image"
        v-model="basis"
        label="预览用量比例"
        :options="[
          { value: 'sample', label: '按样例比例' },
          { value: 'input', label: '仅普通输入' },
          { value: 'cached', label: '仅缓存输入' },
          { value: 'output', label: '仅输出' },
        ]"
      />
    </div>
    <p v-if="view.error" class="info-banner" role="status">
      填写有效数值后显示预览：{{ view.error }}
    </p>
    <template v-else>
      <div class="preview-sample">
        <span
          >本组扣费 <strong>{{ fmt(view.sample.points, 6) }} 额度</strong></span
        ><span
          >模型成本
          <strong>{{
            hasCost ? money(view.sample.cost, 6) : "未配置"
          }}</strong></span
        ><span
          >标价费用
          <strong>{{
            hasListPrice ? money(view.sample.original, 6) : "未配置"
          }}</strong></span
        >
      </div>
      <p v-if="!hasCost" class="tiny muted">
        采购成本未配置，毛利不作零成本估算。
      </p>
      <p v-if="!hasListPrice" class="tiny muted">
        模型标价未配置，暂不反推应得额度。
      </p>
      <p class="tiny muted">
        用户单价随资源包售价与总额度变化，赠送额度已计入。整包毛利假设同等用量比例、全部用完，不含运营费用。
      </p>
      <div
        v-if="view.rows.length"
        class="preview-table-scroll"
        tabindex="0"
        role="region"
        aria-label="各资源包实时价格比较表"
      >
        <table class="preview-table">
          <thead>
            <tr>
              <th>资源包</th>
              <th>用户实际单价</th>
              <th>按模型标价应得额度</th>
              <th>整包成本与毛利</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in view.rows" :key="row.id">
              <td data-label="资源包">
                <strong>{{ row.name }}</strong
                ><small
                  >{{ money(row.price, 2) }} /
                  {{ fmt(row.totalCredits, 6) }} 额度</small
                >
              </td>
              <td v-if="row.error" colspan="3">{{ row.error }}</td>
              <template v-else
                ><td data-label="用户实际单价">
                  <div v-for="[key, label] in fields" :key="key">
                    <span
                      >{{ label }}
                      <strong>{{
                        money(row.channels[key].revenue)
                      }}</strong></span
                    ><small
                      v-if="
                        hasListPrice &&
                        row.channels[key].originalPercent !== null
                      "
                      >标价的
                      {{ fmt(row.channels[key].originalPercent, 2) }}%</small
                    >
                  </div>
                </td>
                <td data-label="按模型标价应得额度">
                  <strong>{{
                    hasListPrice && row.atModelPrice
                      ? fmt(row.atModelPrice.credits, 6) + " 额度"
                      : "—"
                  }}</strong
                  ><small>按所选用量比例换算</small>
                </td>
                <td data-label="整包成本与毛利">
                  <template v-if="hasCost && row.fullPack"
                    ><span>成本 {{ money(row.fullPack.cost, 2) }}</span
                    ><strong
                      :class="{ 'preview-loss': row.fullPack.state === 'loss' }"
                      >毛利 {{ money(row.fullPack.profit, 2) }}</strong
                    ><small>{{
                      row.fullPack.marginPercent === null
                        ? "无收入，不计算毛利率"
                        : "毛利率 " + fmt(row.fullPack.marginPercent, 2) + "%"
                    }}</small></template
                  ><small v-else>{{
                    hasCost ? "扣费为 0，无法换算" : "采购成本未配置"
                  }}</small>
                </td></template
              >
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="ai-empty">
        当前范围暂无资源包，可切换版本或到“资源包与预算”配置。
      </p>
      <p class="tiny muted">
        应得额度＝充值金额 ÷ 本组标价费用 ×
        本组扣费额度。只作定价比较，不自动发放资源包。
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
.section-line {
  align-items: flex-start;
  gap: 12px;
}
.section-line p {
  margin: 0;
}
.preview-controls {
  display: flex;
  gap: 10px;
  margin: 18px 0;
}
.preview-controls > * {
  flex: 1;
  min-width: 0;
}
.preview-sample {
  display: grid;
  gap: 10px;
  padding: 14px;
  background: #eaf2ec;
  border: 1px solid #d8e3dc;
  border-radius: 8px;
  font-size: 12px;
}
.preview-sample span {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.preview-table-scroll {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.preview-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 11px;
  line-height: 1.8;
}
.preview-table th {
  background: #eaf0ec;
  text-align: left;
  font-size: 10px;
}
.preview-table td,
.preview-table th {
  padding: 12px 10px;
  vertical-align: top;
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
}
.preview-table td:last-child,
.preview-table th:last-child {
  border-right: 0;
}
.preview-table tr:nth-child(even) {
  background: #f8fbf9;
}
.preview-table td > span,
.preview-table td > strong,
.preview-table small {
  display: block;
}
.preview-table small {
  color: var(--muted);
  font-size: 10px;
}
.preview-table td > div + div {
  margin-top: 7px;
}
.preview-loss {
  color: #aa432c;
}
.preview-table-scroll:focus-visible {
  outline: 2px solid #176b58;
  outline-offset: 2px;
}
@media (max-width: 600px) {
  .preview-controls {
    flex-direction: column;
  }
  .preview-table-scroll {
    overflow: visible;
    border: 0;
  }
  .preview-table,
  .preview-table tbody,
  .preview-table tr,
  .preview-table td {
    display: block;
  }
  .preview-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
    overflow: hidden;
  }
  .preview-table tr {
    border: 1px solid var(--line);
    border-radius: 8px;
    margin-bottom: 14px;
    padding: 4px 12px;
    background: white;
  }
  .preview-table td {
    border-right: 0;
    padding: 10px 0;
  }
  .preview-table td:last-child {
    border-bottom: 0;
  }
  .preview-table td:not(:first-child)::before {
    content: attr(data-label);
    display: block;
    font-size: 10px;
    color: var(--muted);
    margin-bottom: 5px;
  }
}
</style>
