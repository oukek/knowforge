<script setup>
import { formatPricingNumber as fmt } from "../../../shared/pricing-simulation.mjs";
import PackPriceComparison from "./PackPriceComparison.vue";
defineProps({
  row: Object,
  image: Boolean,
  hasOriginal: Boolean,
  hasCost: { type: Boolean, default: true },
  costLabel: { type: String, default: "采购成本" },
});
const money = (value, digits = 6) => {
  const text = fmt(value, digits);
  if (text.startsWith("<")) return "<¥" + text.slice(1);
  if (text.startsWith(">−")) return ">−¥" + text.slice(2);
  return text.startsWith("−") ? "−¥" + text.slice(1) : "¥" + text;
};
</script>
<template>
  <article class="pack-breakdown" :aria-label="row.name + '额度换算'">
    <header>
      <div>
        <h4>{{ row.name }}</h4>
        <p v-if="!row.error">
          {{ money(row.price, 2) }}／{{ fmt(row.totalCredits, 6) }} 额度<span
            v-if="Number(row.bonus)"
            >，含赠送 {{ fmt(row.bonus, 6) }}</span
          >
        </p>
      </div>
      <slot name="actions" />
    </header>
    <p v-if="row.error" class="pack-error">{{ row.error }}</p>
    <div
      v-else
      class="pack-table-scroll"
      tabindex="0"
      role="region"
      :aria-label="row.name + '综合价格估算'"
    >
      <table>
        <thead>
          <tr>
            <th scope="col">{{ image ? "可用图片" : "综合预计用量" }}</th>
            <th scope="col">原价、实收与优惠</th>
            <th scope="col">{{ costLabel }}与毛利</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-if="row.blended"
            :class="{ loss: hasCost && row.blended.state === 'loss' }"
          >
            <td :data-label="image ? '可用图片' : '综合预计用量'">
              <strong>{{
                image
                  ? fmt(row.blended.imageCount, 0) + " 张"
                  : "约 " + fmt(row.blended.totalTokens, 0) + " Token"
              }}</strong>
              <template v-if="!image"
                ><small>总输入 {{ fmt(row.blended.inputTokens, 0) }}</small
                ><small
                  >其中缓存
                  {{ fmt(row.blended.cachedTokens, 0) }}，已含在输入内</small
                ><small>输出 {{ fmt(row.blended.outputTokens, 0) }}</small
                ><small
                  >综合单价 {{ money(row.blended.userPricePerMillion) }}／百万
                  Token</small
                ></template
              >
            </td>
            <td data-label="原价、实收与优惠">
              <PackPriceComparison
                :pack="row.blended"
                :price="row.price"
                :has-original="hasOriginal"
              />
            </td>
            <td :data-label="costLabel + '与毛利'">
              <template v-if="hasCost"
                ><span>{{ costLabel }} {{ money(row.blended.cost) }}</span
                ><strong :class="{ negative: row.blended.state === 'loss' }"
                  >毛利 {{ money(row.blended.profit) }}</strong
                ><small>{{
                  row.blended.marginPercent === null
                    ? "无收入，不计算毛利率"
                    : "毛利率 " + fmt(row.blended.marginPercent, 2) + "%"
                }}</small></template
              >
              <small v-else>采购成本未配置</small>
            </td>
          </tr>
          <tr v-else>
            <td colspan="3">
              {{
                row.estimateState === "zero_rate"
                  ? "加权扣费为 0，无法推算额度对应的综合用量"
                  : "额度不足完整单位，无法估算可用数量和价值"
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
<style scoped>
.pack-breakdown {
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  margin: 14px 0;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  background: #eaf2ec;
}
h4 {
  font-size: 14px;
  margin: 0 0 5px;
}
header p {
  margin: 0;
  font-size: 12px;
  color: #536b5c;
}
.pack-error {
  color: #aa443a;
  padding: 12px 16px;
}
.pack-table-scroll {
  overflow: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
  font-size: 11px;
  line-height: 1.8;
}
thead th {
  text-align: left;
  font-size: 10px;
  background: #f4f8f5;
}
td,
th {
  padding: 12px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--line);
  border-left: 0;
}
td:last-child,
th:last-child {
  border-right: 0;
}
tbody tr:last-child td,
tbody tr:last-child th {
  border-bottom: 0;
}
tbody tr:nth-child(even) {
  background: #f8fbf9;
}
td > span,
td > strong,
small {
  display: block;
}
small {
  font-size: 10px;
  font-weight: 400;
  color: #65786d;
  margin-top: 4px;
}
strong {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.negative {
  color: #aa443a;
}
@media (max-width: 600px) {
  .pack-table-scroll {
    overflow: visible;
  }
  table,
  tbody {
    display: block;
  }
  thead {
    position: absolute;
    clip-path: inset(50%);
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  tbody tr {
    display: block;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
  }
  td,
  tbody th {
    display: block;
    border: 0;
    padding: 8px 0;
  }
  tbody th {
    border-bottom: 1px solid var(--line);
    margin-bottom: 4px;
  }
  tbody th > strong {
    font-size: 14px;
  }
  td[data-label]::before {
    content: attr(data-label);
    display: block;
    font-size: 10px;
    color: #65786d;
    margin-bottom: 4px;
  }
  header {
    flex-wrap: wrap;
  }
}
</style>
