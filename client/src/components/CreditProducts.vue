<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { request, store } from "../store.js";
import Icon from "./Icon.vue";
const emit = defineEmits(["select"]);
const products = ref([]),
  enabled = ref(false),
  loading = ref(true),
  error = ref("");
const userId = store.user?.id;
let disposed = false;
const number = (value) =>
  Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 6 });
async function load() {
  if (!userId) return;
  loading.value = true;
  error.value = "";
  enabled.value = false;
  const [catalog, capabilities] = await Promise.allSettled([
    request("/ai/products"),
    request("/payments/capabilities"),
  ]);
  if (disposed || userId !== store.user?.id) return;
  if (catalog.status === "fulfilled")
    products.value = catalog.value.rows.filter((p) => p.published);
  else {
    products.value = [];
    error.value = catalog.reason.message;
  }
  if (capabilities.status === "fulfilled")
    enabled.value = capabilities.value.enabled;
  else
    error.value = [error.value, capabilities.reason.message]
      .filter(Boolean)
      .join("；");
  loading.value = false;
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
});
</script>
<template>
  <section
    class="credit-products"
    aria-label="可购买的资源包"
    :aria-busy="loading"
  >
    <div class="section-line">
      <p class="tiny muted">
        用于 AI 评阅、举一反三和模拟面试。按需选择额度与有效期。
      </p>
      <button class="text-btn" :disabled="loading" @click="load">刷新</button>
    </div>
    <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="ai-empty" role="status">正在加载资源包…</p>
    <template v-else>
      <p v-if="!enabled && !error" class="info-banner">
        微信支付暂未开放，请联系管理员获取额度。
      </p>
      <p v-if="!products.length && !error" class="ai-empty">
        暂无可购买的资源包，发布后会显示在这里。
      </p>
      <div v-if="products.length" class="credit-product-grid">
        <article v-for="p in products" :key="p.id" class="credit-product-card">
          <div class="credit-product-title">
            <h3>{{ p.published.name }}</h3>
            <span v-if="p.published.tag" class="credit-product-tag">{{
              p.published.tag
            }}</span>
          </div>
          <p class="credit-product-amount">
            <strong>{{ number(p.published.credits) }}</strong
            ><span>AI 额度</span>
          </p>
          <p class="credit-product-bonus">
            {{
              Number(p.published.bonus) > 0
                ? "另赠 " + number(p.published.bonus) + " 额度"
                : "按实际用量扣费"
            }}
          </p>
          <p class="credit-product-validity">
            <Icon name="Clock3" :size="14" />{{
              p.published.validDays === null
                ? "永久有效"
                : p.published.validDays + " 天有效"
            }}
          </p>
          <p class="credit-product-description">
            {{ p.published.description }}
          </p>
          <div class="credit-product-purchase">
            <strong><small>¥</small>{{ p.published.price }}</strong
            ><button
              class="btn primary"
              :disabled="!enabled || Number(p.published.price) <= 0"
              :aria-label="'微信购买' + p.published.name"
              @click="emit('select', p)"
            >
              微信购买<Icon name="ArrowRight" :size="16" />
            </button>
          </div>
        </article>
      </div>
      <p v-if="products.length" class="credit-store-note">
        <Icon
          name="BadgeCheck"
          :size="16"
        />微信支付确认后自动到账；已有订单可在“额度与订单”中继续核对。
      </p>
    </template>
  </section>
</template>
<style scoped>
.credit-products > .section-line {
  gap: 16px;
  margin-bottom: 18px;
}
.credit-products > .section-line p {
  margin: 0;
}
.credit-product-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.credit-product-card {
  display: flex;
  flex-direction: column;
  padding: 23px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: white;
  min-width: 0;
}
.credit-product-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.credit-product-title h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}
.credit-product-tag {
  color: var(--green);
  background: #eaf3ed;
  padding: 3px 7px;
  font-size: 10px;
  border-radius: 4px;
  flex-shrink: 0;
}
.credit-product-amount {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 24px 0 3px;
}
.credit-product-amount strong {
  font-size: 30px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  color: #24483c;
}
.credit-product-amount span {
  font-size: 11px;
  color: var(--muted);
}
.credit-product-bonus {
  min-height: 20px;
  color: var(--green);
  font-size: 12px;
  margin: 6px 0 16px;
}
.credit-product-validity {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}
.credit-product-description {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.8;
  margin: 10px 0 22px;
  flex: 1;
}
.credit-product-purchase {
  border-top: 1px solid var(--line);
  padding-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.credit-product-purchase > strong {
  font-size: 23px;
  letter-spacing: -0.03em;
  white-space: nowrap;
}
.credit-product-purchase small {
  font-size: 12px;
  margin-right: 3px;
}
.credit-product-purchase .btn {
  font-size: 12px;
  padding: 10px 12px;
  gap: 7px;
  white-space: nowrap;
}
.credit-store-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
  margin: 20px 0 0;
}
.credit-store-note svg {
  flex-shrink: 0;
}
@media (max-width: 1100px) {
  .credit-product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .credit-product-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .credit-product-card {
    padding: 20px;
  }
  .credit-product-amount {
    margin-top: 18px;
  }
  .credit-product-description {
    margin-bottom: 16px;
  }
}
</style>
