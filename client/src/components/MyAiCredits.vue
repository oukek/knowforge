<script setup>
import { ref, onMounted, watch } from "vue";
import { request, dateLabel, store } from "../store.js";
import { ai, refreshAi } from "../ai.js";
import WechatCheckout from "./WechatCheckout.vue";
import AppDialog from "./AppDialog.vue";
const allocationDetail = ref(null);
const checkout = ref(null),
  orders = ref([]);
const data = ref(null),
  page = ref(1),
  legacy = ref(false),
  error = ref(""),
  busy = ref(false);
const kinds = {
  purchase: "微信购买",
  grant: "额度发放",
  migration: "历史额度迁移",
  reserve: "调用预占",
  settle: "调用结算",
  release: "释放预占",
  waive: "免费或平台免扣",
  expire: "额度到期",
  revoke: "额度收回",
  reverse: "消费冲正",
  reconcile: "人工结算",
};
async function load() {
  busy.value = true;
  error.value = "";
  try {
    const response = await request(
      "/ai/ledger?page=" + page.value + (legacy.value ? "&legacy=1" : ""),
    );
    data.value = response;
    await refreshAi();
    orders.value = (await request("/payments/orders")).rows;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function changeLegacy() {
  legacy.value = !legacy.value;
  page.value = 1;
  await load();
}
onMounted(load);
watch(
  () => store.creditShopOpen,
  (open, previous) => {
    if (previous && !open) void load();
  },
);
</script>
<template>
  <section class="ai-my-credits">
    <div class="section-line" style="margin-bottom: 18px">
      <p class="tiny muted">查看额度明细与购买记录。</p>
      <button class="btn primary small" @click="store.creditShopOpen = true">
        购买资源包
      </button>
    </div>
    <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    <template v-if="data?.account">
      <section class="ai-detail">
        <h2>我的 AI 额度</h2>
        <p v-if="data.account.exempt" class="info-banner">
          免费资格生效中 ·
          {{
            data.account.policy.freeUntil
              ? "截止 " + dateLabel(data.account.policy.freeUntil)
              : "永久"
          }}。调用仍计量并记录，个人资源包不扣费，已有批次按原有效期到期。
        </p>
        <div class="ai-usage-summary">
          <article
            v-for="[key, label] in [
              ['available', '有效可用'],
              ['reserved', '当前预占'],
              ['expiring', '七天内到期'],
              ['consumed', '净消费'],
            ]"
            :key="key"
          >
            <span class="tiny muted">{{ label }}</span
            ><strong>{{ data.account[key] }}</strong>
          </article>
        </div>
      </section>
      <section class="ai-detail">
        <h2>任务额度说明</h2>
        <p class="tiny muted">
          每条任务记录实际消耗额度，可在 AI
          历史中查看。任务开始时预占额度，完成后结算并释放差额；技术失败不扣费。免费资格、免扣与退款会单独标记。
        </p>
        <p v-if="ai.budgets" class="tiny muted">
          单次任务最多 {{ ai.budgets.maxTaskPoints }} 额度，近 24 小时预算
          {{ ai.budgets.dailyBudget }}
          额度。免费用户仍受预算限制；失败请求也占用防滥用预算。
          用量未知时保留预占等待核对，最长 {{ ai.budgets.pendingHours }} 小时。
        </p>
      </section>
      <section class="ai-detail">
        <h2>我的额度批次</h2>
        <p class="tiny muted">
          优先使用即将过期的额度，同到期时间按发放顺序使用。永久额度排在最后。
        </p>
        <p v-if="!data.lots.length" class="ai-empty">
          还没有额度，可以购买资源包或联系管理员。
        </p>
        <div class="ai-record-list">
          <article v-for="lot in data.lots" :key="lot.id" class="ai-audit-row">
            <strong>{{ lot.title }}</strong>
            <p class="tiny">
              发放 {{ lot.granted }} · 可用 {{ lot.available }} · 预占
              {{ lot.reserved }} · 净消费
              {{ lot.consumed }}
            </p>
            <p class="tiny muted">
              {{
                lot.expiresAt ? "到期 " + dateLabel(lot.expiresAt) : "永久有效"
              }}
              · 已过期 {{ lot.expired }} · 已收回 {{ lot.revoked }}
            </p>
          </article>
        </div>
      </section>
    </template>
    <section class="ai-detail">
      <div class="section-line">
        <h2>{{ legacy ? "升级前额度流水" : "额度变动流水" }}</h2>
        <div class="row wrap">
          <button class="text-btn" :disabled="busy" @click="changeLegacy">
            {{ legacy ? "查看当前流水" : "查看升级前流水" }}</button
          ><button class="text-btn" :disabled="busy" @click="load">刷新</button>
        </div>
      </div>
      <p class="tiny muted">
        每次逻辑调用只结算一次；点击详情可查看跨批次分摊。失败调用释放预占，免费调用记录豁免额度。
      </p>
      <div class="ai-record-list">
        <article
          v-for="row in data?.rows || []"
          :key="row.id"
          class="ai-audit-row"
        >
          <div class="section-line">
            <strong>{{ kinds[row.kind] || row.kind }}</strong
            ><strong
              >{{ Number(row.amount) > 0 ? "+" : ""
              }}{{ row.amount }} 额度</strong
            >
          </div>
          <p class="tiny muted">
            {{ dateLabel(row.createdAt) }} · {{ row.note }}
          </p>
          <p
            v-if="row.waivedPoints && Number(row.waivedPoints) > 0"
            class="tiny"
          >
            应扣 {{ row.duePoints }} · 免扣 {{ row.waivedPoints }} 额度
          </p>
          <RouterLink
            v-if="row.runId"
            :to="'/ai?run=' + row.runId"
            class="text-link"
            >查看关联 AI 记录</RouterLink
          >
          <button
            v-if="row.allocations?.length"
            class="text-btn"
            @click="allocationDetail = row"
          >
            查看批次分摊
          </button>
        </article>
      </div>
      <p v-if="!data?.rows?.length" class="ai-empty">还没有额度变动记录。</p>
      <div class="ai-pagination">
        <button
          class="btn small"
          :disabled="busy || page <= 1"
          @click="
            page--;
            load();
          "
        >
          上一页</button
        ><span>{{ page }}</span
        ><button
          class="btn small"
          :disabled="busy || page * 30 >= (data?.total || 0)"
          @click="
            page++;
            load();
          "
        >
          下一页
        </button>
      </div>
    </section>
    <section v-if="orders.length" class="ai-detail">
      <div class="section-line">
        <h2>我的支付订单</h2>
        <button class="text-btn" :disabled="busy" @click="load">刷新</button>
      </div>
      <div class="ai-record-list">
        <article v-for="order in orders" :key="order.id" class="ai-audit-row">
          <div class="section-line">
            <strong>{{ order.product }} · ¥{{ order.amount }}</strong
            ><button class="text-btn" @click="checkout = { orderId: order.id }">
              {{ order.status === "paid" ? "查看详情" : "核对订单" }}
            </button>
          </div>
          <p class="tiny muted">
            {{
              order.status === "paid"
                ? "已支付，额度已入账"
                : order.status === "closed"
                  ? "已关闭"
                  : "待支付／待核对"
            }}
            · {{ dateLabel(order.createdAt) }}
          </p>
        </article>
      </div>
      <p class="tiny muted">
        展示最近 50 笔订单；支付状态以服务端核对结果为准。
      </p>
    </section>
    <AppDialog
      :open="!!allocationDetail"
      title="额度批次分摊"
      :width="680"
      mobile-fullscreen
      @close="allocationDetail = null"
    >
      <template v-if="allocationDetail">
        <p class="tiny muted">
          {{ kinds[allocationDetail.kind] || allocationDetail.kind }} ·
          {{ dateLabel(allocationDetail.createdAt) }}
        </p>
        <div
          v-for="a in allocationDetail.allocations"
          :key="a.lotId"
          class="ai-audit-row"
        >
          <p class="tiny muted">批次 {{ a.lotId }}</p>
          <p class="tiny">
            {{
              a.charged !== undefined
                ? "实际扣除 " + a.charged + " · 释放 " + a.released
                : "变动 " + a.amount
            }}
            额度{{ a.returnedTo === "expired" ? " · 返还时已到期" : "" }}
          </p>
        </div>
      </template>
      <template #footer
        ><button class="btn" @click="allocationDetail = null">
          关闭
        </button></template
      >
    </AppDialog>
    <WechatCheckout
      v-if="checkout"
      v-bind="checkout"
      @close="
        checkout = null;
        load();
      "
      @paid="load"
    />
  </section>
</template>
<style scoped>
.ai-usage-summary article {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
