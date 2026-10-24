<script setup>
import { ref, watch, onMounted } from "vue";
import { request, toast, dateLabel } from "../store.js";
import { refreshAi } from "../ai.js";
import AppField from "./AppField.vue";
import AppSelect from "./AppSelect.vue";
import AppDisclosure from "./AppDisclosure.vue";
import AppDialog from "./AppDialog.vue";
const users = ref([]),
  query = ref(""),
  selected = ref(""),
  detail = ref(null),
  products = ref([]),
  busy = ref(false),
  error = ref("");
const amount = ref("1000"),
  source = ref("gift"),
  template = ref(""),
  validity = ref("permanent"),
  validDays = ref("30"),
  note = ref("学习体验额度"),
  grantId = ref(crypto.randomUUID());
const mode = ref("paid"),
  freeValidity = ref("days"),
  freeDays = ref("30"),
  dailyBudget = ref(""),
  policyNote = ref("调整 AI 使用资格"),
  policyId = ref(crypto.randomUUID());
const revokeLot = ref(""),
  revokeAmount = ref(""),
  revokeNote = ref("人工收回未使用额度"),
  revokeId = ref(crypto.randomUUID());
async function act(fn) {
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function search() {
  users.value = (
    await request("/admin/ai/users?query=" + encodeURIComponent(query.value))
  ).users;
}
async function loadDetail() {
  if (!selected.value) {
    detail.value = null;
    return;
  }
  const data = await request("/admin/ai/users/" + selected.value + "/credits");
  detail.value = data;
  const p = data.account.policy;
  mode.value = p.mode;
  freeValidity.value = p.freeUntil ? "days" : "permanent";
  freeDays.value = p.freeUntil
    ? String(
        Math.max(
          1,
          Math.ceil((Date.parse(p.freeUntil) - Date.now()) / 86400000),
        ),
      )
    : "30";
  dailyBudget.value = p.dailyBudget || "";
}
async function select(user) {
  selected.value = user.id;
  await act(loadDetail);
}
async function grant() {
  await act(async () => {
    const body = {
      userId: selected.value,
      source: source.value,
      note: note.value,
      operationId: grantId.value,
      ...(template.value
        ? { productVersionId: template.value }
        : { amount: amount.value }),
    };
    if (validity.value !== "inherit")
      body.validDays =
        validity.value === "permanent" ? null : Number(validDays.value);
    await request("/admin/ai/credits", "POST", body);
    await Promise.all([loadDetail(), search(), refreshAi()]);
    grantId.value = crypto.randomUUID();
    toast("额度已发放并生成独立批次");
  });
}
async function savePolicy() {
  await act(async () => {
    await request(
      "/admin/ai/users/" + selected.value + "/billing-policy",
      "PUT",
      {
        mode: mode.value,
        freeDays:
          freeValidity.value === "permanent" ? null : Number(freeDays.value),
        dailyBudget: dailyBudget.value.trim() || null,
        note: policyNote.value,
        operationId: policyId.value,
      },
    );
    policyId.value = crypto.randomUUID();
    await Promise.all([loadDetail(), search(), refreshAi()]);
    toast("用户计费资格已保存，新的调用将按此规则执行");
  });
}
async function revoke() {
  await act(async () => {
    await request(
      "/admin/ai/users/" +
        selected.value +
        "/credits/" +
        revokeLot.value +
        "/revoke",
      "POST",
      {
        amount: revokeAmount.value,
        note: revokeNote.value,
        operationId: revokeId.value,
      },
    );
    await Promise.all([loadDetail(), search(), refreshAi()]);
    revokeId.value = crypto.randomUUID();
    toast("剩余额度已收回，流水已记录");
  });
}
async function block(user) {
  await act(async () => {
    await request("/admin/ai/users/" + user.id + "/block", "POST", {
      blocked: !user.blocked,
    });
    await search();
    if (selected.value === user.id) await loadDetail();
    await refreshAi();
  });
}
watch(
  [selected, amount, source, template, validity, validDays, note],
  () => (grantId.value = crypto.randomUUID()),
);
watch(
  [selected, mode, freeValidity, freeDays, dailyBudget, policyNote],
  () => (policyId.value = crypto.randomUUID()),
);
watch(
  [selected, revokeLot, revokeAmount, revokeNote],
  () => (revokeId.value = crypto.randomUUID()),
);
watch(
  template,
  () => (validity.value = template.value ? "inherit" : "permanent"),
);
onMounted(
  () =>
    void act(async () => {
      await Promise.all([
        search(),
        (async () =>
          (products.value = (await request("/admin/ai/products")).rows))(),
      ]);
    }),
);
const sourceLabel = {
  gift: "手动赠送",
  compensation: "补偿",
  bonus: "资源包附赠",
  legacy: "历史迁移",
};
</script>
<template>
  <div class="ai-credit-admin">
    <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    <form class="ai-form-row" @submit.prevent="act(search)">
      <AppField
        v-model="query"
        maxlength="40"
        aria-label="搜索用户"
        placeholder="搜索账号、昵称或用户编号"
      /><button class="btn small" :disabled="busy">搜索用户</button>
    </form>
    <div class="ai-record-list">
      <article v-for="u in users" :key="u.id" class="ai-record-row">
        <div>
          <strong
            >{{ u.displayName || u.username }}
            <span class="tiny muted"
              >{{ u.username }} · {{ u.publicId }}</span
            ></strong
          ><span class="tiny muted"
            >{{
              u.blocked ? "AI 已暂停" : u.exempt ? "免费资格生效中" : "普通计费"
            }}
            · 可用 {{ u.available }} · 预占 {{ u.reserved }}</span
          >
        </div>
        <div class="row wrap">
          <button class="btn small" :disabled="busy" @click="select(u)">
            管理额度</button
          ><button class="text-btn" :disabled="busy" @click="block(u)">
            {{ u.blocked ? "恢复 AI" : "暂停 AI" }}
          </button>
        </div>
      </article>
    </div>
    <p v-if="!users.length" class="ai-empty">没有找到匹配用户。</p>
    <AppDialog
      :open="!!detail"
      title="用户资格与额度管理"
      :busy="busy"
      :width="920"
      @close="detail = null"
    >
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
      <template v-if="detail">
        <section class="ai-detail">
          <div class="section-line">
            <h2>
              {{
                users.find((u) => u.id === selected)?.displayName ||
                users.find((u) => u.id === selected)?.username
              }}
              · 权益明细
            </h2>
            <button class="text-btn" @click="act(loadDetail)">刷新明细</button>
          </div>
          <div class="ai-usage-summary">
            <article
              v-for="[key, label] in [
                ['available', '有效可用'],
                ['reserved', '预占'],
                ['consumed', '净消费'],
                ['expired', '已过期'],
                ['revoked', '已收回'],
              ]"
              :key="key"
            >
              <span class="tiny muted">{{ label }}</span
              ><strong>{{ detail.account[key] }}</strong>
            </article>
          </div>
        </section>
        <form class="ai-detail ai-admin-form" @submit.prevent="savePolicy">
          <h2>免费资格与预算</h2>
          <p class="tiny muted">
            免费资格免扣个人资源包，仍受频率、并发和预算限制。资格变化只影响新调用；已有资源包按原日期到期。
          </p>
          <div class="ai-admin-grid">
            <label
              >用户计费模式<AppSelect
                v-model="mode"
                label="用户计费模式"
                :options="[
                  { value: 'paid', label: '普通计费' },
                  { value: 'exempt', label: '免费 · 免扣额度' },
                ]"
            /></label>
            <label v-if="mode === 'exempt'"
              >免费资格有效期<AppSelect
                v-model="freeValidity"
                label="免费资格有效期"
                :options="[
                  { value: 'days', label: '从保存起指定天数' },
                  { value: 'permanent', label: '永久' },
                ]"
            /></label>
            <label v-if="mode === 'exempt' && freeValidity === 'days'"
              >免费天数<AppField
                v-model="freeDays"
                type="number"
                min="1"
                max="3650"
                required
            /></label>
            <label
              >近 24 小时预算 · 留空继承全站<AppField
                v-model="dailyBudget"
                inputmode="decimal"
                placeholder="例如 1000"
            /></label>
            <label class="ai-wide"
              >资格调整原因<AppField
                v-model="policyNote"
                maxlength="300"
                minlength="3"
                required
            /></label>
          </div>
          <p v-if="detail.account.policy.freeUntil" class="tiny muted">
            当前免费资格截止：{{ dateLabel(detail.account.policy.freeUntil)
            }}{{ detail.account.exempt ? "" : " · 已到期或已关闭" }}
          </p>
          <button class="btn primary small" :disabled="busy">
            保存用户资格
          </button>
        </form>
        <form class="ai-detail ai-admin-form" @submit.prevent="grant">
          <h2>发放额度</h2>
          <p class="tiny muted">
            新注册用户初始额度为
            0。每次发放生成独立批次；按资源包发放属于人工赠送，不产生支付订单。
          </p>
          <div class="ai-admin-grid">
            <label
              >发放方式<AppSelect
                v-model="template"
                label="资源包发放模板"
                :options="[
                  { value: '', label: '手动填写额度' },
                  ...products
                    .filter((p) => p.published)
                    .map((p) => ({
                      value: p.published.versionId,
                      label:
                        p.published.name +
                        ' · v' +
                        p.published.version +
                        ' · ' +
                        p.published.credits +
                        ' + ' +
                        p.published.bonus +
                        ' 额度',
                    })),
                ]"
            /></label>
            <label v-if="!template"
              >赠送额度<AppField v-model="amount" inputmode="decimal" required
            /></label>
            <label
              >发放来源<AppSelect
                v-model="source"
                label="额度发放来源"
                :options="[
                  { value: 'gift', label: '手动赠送' },
                  { value: 'compensation', label: '人工补偿' },
                ]"
            /></label>
            <label
              >额度有效期<AppSelect
                v-model="validity"
                label="赠送额度有效期"
                :options="[
                  ...(template
                    ? [{ value: 'inherit', label: '使用商品版本有效期' }]
                    : []),
                  { value: 'permanent', label: '永久有效' },
                  { value: 'days', label: '指定有效天数' },
                ]"
            /></label>
            <label v-if="validity === 'days'"
              >有效天数<AppField
                v-model="validDays"
                type="number"
                min="1"
                max="3650"
                required
            /></label>
            <label class="ai-wide"
              >发放原因<AppField
                v-model="note"
                maxlength="300"
                minlength="3"
                required
            /></label>
          </div>
          <button class="btn primary small" :disabled="busy">
            确认发放额度
          </button>
        </form>
        <section class="ai-detail">
          <h2>额度批次</h2>
          <p v-if="!detail.lots.length" class="ai-empty">还没有额度批次。</p>
          <div class="ai-record-list">
            <article
              v-for="lot in detail.lots"
              :key="lot.id"
              class="ai-audit-row"
            >
              <strong
                >{{ lot.title }}
                <span class="tiny muted">{{
                  sourceLabel[lot.source] || lot.source
                }}</span></strong
              >
              <p class="tiny">
                可用 {{ lot.available }} · 预占 {{ lot.reserved }} · 已消费
                {{ lot.consumed }} · 过期 {{ lot.expired }} · 收回
                {{ lot.revoked }}
              </p>
              <p class="tiny muted">
                {{
                  lot.expiresAt
                    ? "到期 " + dateLabel(lot.expiresAt)
                    : "永久有效"
                }}
                · 发放 {{ dateLabel(lot.createdAt) }}
              </p>
              <AppDisclosure title="查看批次来源与快照">
                <pre class="ai-json">{{
                  JSON.stringify(lot.data, null, 2)
                }}</pre>
              </AppDisclosure>
            </article>
          </div>
        </section>
        <form
          v-if="detail.lots.some((l) => Number(l.available) > 0)"
          class="ai-detail ai-admin-form"
          @submit.prevent="revoke"
        >
          <h2>收回未使用额度</h2>
          <p class="tiny muted">
            仅可收回所选批次的有效可用部分，不能收回预占或已消费的额度。
          </p>
          <div class="ai-admin-grid">
            <label
              >收回批次<AppSelect
                v-model="revokeLot"
                label="收回额度批次"
                :options="[
                  { value: '', label: '选择批次' },
                  ...detail.lots
                    .filter((l) => Number(l.available) > 0)
                    .map((l) => ({
                      value: l.id,
                      label: l.title + ' · 可用 ' + l.available,
                    })),
                ]" /></label
            ><label
              >收回数量<AppField
                v-model="revokeAmount"
                inputmode="decimal"
                required /></label
            ><label class="ai-wide"
              >收回原因<AppField
                v-model="revokeNote"
                minlength="3"
                maxlength="300"
                required
            /></label>
          </div>
          <button class="btn small" :disabled="busy || !revokeLot">
            确认收回
          </button>
        </form>
      </template>
    </AppDialog>
  </div>
</template>
<style scoped>
.ai-usage-summary article {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
