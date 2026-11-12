<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ai, refreshAi } from "../ai.js";
import CreditProducts from "../components/CreditProducts.vue";
import MyAiCredits from "../components/MyAiCredits.vue";
import WechatCheckout from "../components/WechatCheckout.vue";
const route = useRoute(),
  router = useRouter(),
  selected = ref(null);
const tab = computed({
  get: () => (route.query.tab === "ledger" ? "ledger" : "shop"),
  set: (value) =>
    router.replace({
      path: "/credits",
      query: value === "ledger" ? { tab: "ledger" } : {},
    }),
});
onMounted(() => refreshAi().catch(() => {}));
</script>
<template>
  <div class="page-enter credits-page">
    <section class="credits-overview" aria-label="我的 AI 额度概览">
      <div>
        <span>有效可用额度</span
        ><strong
          >{{ ai.loaded ? ai.account.available : "—"
          }}<small>额度</small></strong
        >
      </div>
      <div>
        <span>当前预占</span
        ><strong>{{ ai.loaded ? ai.account.reserved : "—" }}</strong>
      </div>
      <p>
        {{
          ai.account.exempt
            ? "免费资格生效中，已有资源包按原有效期保留。"
            : "选择适合自己的资源包，继续 AI 评阅、举一反三与面试练习。"
        }}
      </p>
    </section>
    <div class="type-tabs" role="group" aria-label="资源包与额度">
      <button
        :class="{ active: tab === 'shop' }"
        :aria-pressed="tab === 'shop'"
        @click="tab = 'shop'"
      >
        购买资源包</button
      ><button
        :class="{ active: tab === 'ledger' }"
        :aria-pressed="tab === 'ledger'"
        @click="tab = 'ledger'"
      >
        额度与订单
      </button>
    </div>
    <CreditProducts
      v-if="tab === 'shop'"
      @select="selected = $event"
    /><MyAiCredits v-else />
    <WechatCheckout
      v-if="selected"
      :product="selected"
      @close="selected = null"
      @paid="refreshAi"
    />
  </div>
</template>
<style scoped>
.credits-page {
  max-width: 1180px;
  margin: 0 auto;
}
.credits-overview {
  display: flex;
  align-items: center;
  gap: 36px;
  background: var(--theme-soft);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  padding: 24px 28px;
  margin-bottom: 16px;
}
.credits-overview > div {
  display: grid;
  gap: 7px;
  flex-shrink: 0;
}
.credits-overview span {
  font-size: 11px;
  color: var(--muted);
}
.credits-overview strong {
  font-size: 27px;
  line-height: 1.15;
  color: var(--theme-ink);
  font-variant-numeric: tabular-nums;
}
.credits-overview small {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 400;
}
.credits-overview p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
  margin-left: auto;
  max-width: 340px;
}
@media (max-width: 767px) {
  .credits-overview {
    flex-wrap: wrap;
    gap: 18px 28px;
    padding: 20px;
  }
  .credits-overview p {
    flex-basis: 100%;
    max-width: none;
    margin: 0;
  }
}
</style>
