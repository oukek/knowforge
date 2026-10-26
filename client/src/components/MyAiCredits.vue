<script setup>
import { ref, onMounted } from "vue";
import { request, dateLabel } from "../store.js";
import { ai, refreshAi } from "../ai.js";
import AppDisclosure from "./AppDisclosure.vue";
const data = ref(null),
  products = ref([]),
  page = ref(1),
  legacy = ref(false),
  error = ref(""),
  busy = ref(false);
const kinds = {
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
onMounted(async () => {
  await load();
  try {
    products.value = (await request("/ai/products")).rows;
  } catch (e) {
    error.value = e.message;
  }
});
</script>
<template>
  <section class="ai-my-credits">
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
          还没有额度，联系管理员发放或开通免费资格。
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
        每次逻辑调用只结算一次；展开可查看跨批次分摊。失败调用释放预占，免费调用记录豁免额度。
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
          ><AppDisclosure v-if="row.allocations?.length" title="查看批次分摊"
            ><div
              v-for="a in row.allocations"
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
            </div></AppDisclosure
          >
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
    <section v-if="products.length" class="ai-detail">
      <h2>可配置的资源包</h2>
      <p class="tiny muted">
        当前由管理员发放，尚未开放在线购买。价格为商品配置，实际赠送不会产生付款。
      </p>
      <div class="ai-usage-summary">
        <article v-for="p in products" :key="p.id">
          <h3>{{ p.published.name }}</h3>
          <strong>{{ p.published.credits }} 额度</strong>
          <p v-if="Number(p.published.bonus) > 0">
            另赠 {{ p.published.bonus }} 额度
          </p>
          <p>
            配置售价 ¥{{ p.published.price }} ·
            {{
              p.published.validDays === null
                ? "永久"
                : p.published.validDays + " 天"
            }}
          </p>
          <p class="tiny muted">{{ p.published.description }}</p>
        </article>
      </div>
    </section>
  </section>
</template>
<style scoped>
.ai-usage-summary article {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
