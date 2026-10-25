<script setup>
import { formatPricingNumber as fmt } from "../../../shared/pricing-simulation.mjs";
defineProps({ pack: Object, price: String, hasOriginal: Boolean });
const money = (value) => {
  const text = fmt(value, 6);
  return text.startsWith("<") ? "<¥" + text.slice(1) : "¥" + text;
};
</script>
<template>
  <div class="pack-price-comparison">
    <span
      >原价
      <strong>{{
        hasOriginal && pack ? money(pack.original) : "—"
      }}</strong></span
    >
    <span
      >实收 <strong>{{ money(price) }}</strong></span
    >
    <template v-if="hasOriginal && pack">
      <strong v-if="Number(pack.discountPercent) > 0" class="offer"
        >优惠 {{ fmt(pack.discountPercent, 2) }}%</strong
      >
      <strong v-else-if="Number(pack.discountPercent) < 0" class="premium"
        >高于原价 {{ fmt(pack.discountPercent.replace(/^-/, ""), 2) }}%</strong
      >
      <small v-else-if="pack.discountPercent !== null">与原价相同</small>
      <small v-else>原价为 0，不计算优惠率</small>
      <small v-if="Number(pack.savings) > 0"
        >节省 {{ money(pack.savings) }}</small
      >
      <small v-else-if="Number(pack.savings) < 0"
        >多付 {{ money(pack.savings.replace(/^-/, "")) }}</small
      >
    </template>
    <small v-else>{{
      hasOriginal ? "扣费为 0，无法换算整包原价" : "原价未配置，暂不比较优惠"
    }}</small>
  </div>
</template>
<style scoped>
.pack-price-comparison {
  display: grid;
  gap: 4px;
}
.pack-price-comparison span,
.pack-price-comparison small {
  display: block;
}
.pack-price-comparison small {
  color: var(--muted);
  font-size: 10px;
}
.offer {
  color: #176b58;
}
.premium {
  color: #aa443a;
}
</style>
