<script setup>
import { ref, watch, onMounted, computed, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import { request, toast, dateLabel } from "../store.js";
import { featureLabel, aiStateLabel, refreshAi } from "../ai.js";
import AppField from "../components/AppField.vue";
import AppSelect from "../components/AppSelect.vue";
import AppDisclosure from "../components/AppDisclosure.vue";
import AiRunMeta from "../components/AiRunMeta.vue";
import AdminAiPool from "../components/AdminAiPool.vue";
import AdminCredits from "../components/AdminCredits.vue";
import AdminProducts from "../components/AdminProducts.vue";
import AppDialog from "../components/AppDialog.vue";
const AdminPricing = defineAsyncComponent(
  () => import("../components/AdminPricing.vue"),
);
const route = useRoute(),
  router = useRouter();
const tab = computed({
  get: () =>
    ["config", "users", "products", "pricing", "history"].includes(
      route.query.tab,
    )
      ? route.query.tab
      : "config",
  set: (value) =>
    router.replace({
      path: "/admin",
      query: { ...route.query, tab: value === "config" ? undefined : value },
    }),
});
const error = ref(""),
  busy = ref(false);
const history = ref({ rows: [], total: 0 }),
  page = ref(1),
  feature = ref(""),
  status = ref(""),
  selected = ref(null),
  reconcilePoints = ref("0"),
  reconcileNote = ref(""),
  costNote = ref(""),
  costCny = ref("");
const reverseNote = ref(""),
  reverseId = ref(crypto.randomUUID());
const summary = ref({ rows: [], audit: [] });
async function act(callback) {
  busy.value = true;
  error.value = "";
  try {
    return await callback();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function loadHistory() {
  const query = new URLSearchParams({ page: page.value });
  if (feature.value) query.set("feature", feature.value);
  if (status.value) query.set("status", status.value);
  history.value = await request("/admin/ai/runs?" + query);
}
async function loadSummary() {
  summary.value = await request("/admin/ai/summary");
}
async function detail(id) {
  await act(async () => {
    selected.value = await request("/admin/ai/runs/" + id);
    reconcilePoints.value = "0";
    reconcileNote.value = "";
    costNote.value = "";
    costCny.value = "";
    reverseNote.value = "";
    reverseId.value = crypto.randomUUID();
  });
}
async function reconcile() {
  await act(async () => {
    await request(
      "/admin/ai/runs/" + selected.value.id + "/reconcile",
      "POST",
      { points: reconcilePoints.value, note: reconcileNote.value },
    );
    selected.value = await request("/admin/ai/runs/" + selected.value.id);
    await loadHistory();
    await loadSummary();
    await refreshAi();
    toast("人工结算已记录");
  });
}
async function reverse() {
  await act(async () => {
    await request("/admin/ai/runs/" + selected.value.id + "/reverse", "POST", {
      note: reverseNote.value,
      operationId: reverseId.value,
    });
    selected.value = await request("/admin/ai/runs/" + selected.value.id);
    await Promise.all([loadHistory(), loadSummary(), refreshAi()]);
    toast("额度冲正已记录");
  });
}
watch(reverseNote, () => (reverseId.value = crypto.randomUUID()));
async function reviewCosts() {
  await act(async () => {
    await request(
      "/admin/ai/runs/" + selected.value.id + "/cost-review",
      "POST",
      {
        note: costNote.value,
        ...(costCny.value.trim() ? { costCny: costCny.value } : {}),
      },
    );
    selected.value = await request("/admin/ai/runs/" + selected.value.id);
    await loadHistory();
    await loadSummary();
    toast("上游成本核对已记录，用户额度不变");
  });
}
watch([feature, status], () => {
  page.value = 1;
  void act(loadHistory);
});
watch(page, () => void act(loadHistory));
onMounted(
  () =>
    void act(async () => {
      await Promise.all([loadHistory(), loadSummary()]);
    }),
);
</script>
<template>
  <div class="page-enter ai-admin">
    <div class="page-heading">
      <div>
        <div class="eyebrow">KNOWFORGE ADMIN</div>
        <h1>让每次调用都有据可查。</h1>
        <p>统一配置服务，按用户分配额度，核对内容与模型消耗。</p>
      </div>
      <button
        class="btn small"
        :disabled="busy"
        @click="
          act(async () => {
            await loadHistory();
            await loadSummary();
          })
        "
      >
        刷新用量
      </button>
    </div>
    <div class="type-tabs">
      <button
        v-for="[value, label] in [
          ['config', '服务与模型'],
          ['users', '用户与额度'],
          ['products', '资源包与预算'],
          ['pricing', '定价测算'],
          ['history', '调用与核对'],
        ]"
        :key="value"
        :class="{ active: tab === value }"
        @click="tab = value"
      >
        {{ label }}
      </button>
    </div>
    <p v-if="error" class="ai-error" role="alert">
      {{ error }}
    </p>
    <AdminAiPool v-if="tab === 'config'" />
    <AdminCredits v-if="tab === 'users'" />
    <AdminProducts v-if="tab === 'products'" />
    <AdminPricing v-if="tab === 'pricing'" />
    <template v-if="tab === 'history'">
      <section class="ai-detail">
        <h2>近 24 小时调用与额度</h2>
        <p class="tiny muted">
          额度统计采用新的批次账本，显示净扣除及豁免；自动切换的完整上游消耗与采购成本可在调用详情核对。
        </p>
        <div class="ai-usage-summary">
          <article v-for="item in summary.rows" :key="item.feature">
            <h3>{{ featureLabel[item.feature] }}</h3>
            <strong>{{ item.calls }} 次</strong>
            <p>
              输入 {{ item.inputTokens ?? 0 }} / 输出
              {{ item.outputTokens ?? 0 }} Token
            </p>
            <p>
              净扣除 {{ item.points ?? 0 }} 额度 · 豁免
              {{ item.waivedPoints ?? 0 }} · 待核对 {{ item.pending }} 条
            </p>
          </article>
        </div>
        <p v-if="!summary.rows.length" class="ai-empty">还没有调用记录。</p>
      </section>
      <div class="ai-form-row">
        <AppSelect
          v-model="feature"
          label="后台功能筛选"
          :options="[
            { value: '', label: '全部功能' },
            ...Object.entries(featureLabel).map(([value, label]) => ({
              value,
              label,
            })),
          ]"
        /><AppSelect
          v-model="status"
          label="后台调用状态"
          :options="[
            { value: '', label: '全部状态' },
            ...Object.entries(aiStateLabel).map(([value, label]) => ({
              value,
              label,
            })),
          ]"
        /><span class="tiny muted">{{ history.total }} 条</span>
      </div>
      <div class="ai-record-list">
        <button
          v-for="item in history.rows"
          :key="item.id"
          class="ai-record-row"
          @click="detail(item.id)"
        >
          <div>
            <span class="tiny muted"
              >{{ featureLabel[item.feature] }} · {{ aiStateLabel[item.status]
              }}{{
                item.failoverCount
                  ? " · 切换 " + item.failoverCount + " 次"
                  : ""
              }}{{ item.upstreamCostPending ? " · 上游成本待核对" : "" }}</span
            ><strong>{{ item.title }}</strong
            ><span class="tiny muted"
              >{{ item.userId }} · {{ dateLabel(item.createdAt) }}</span
            >
          </div>
          <div class="ai-record-usage">
            <span>{{
              item.usage ? item.usage.total + " Token" : "用量未知"
            }}</span
            ><strong
              >{{
                item.chargedPoints === null || item.chargedPoints === undefined
                  ? "预占 " + item.reservedPoints
                  : item.chargedPoints
              }}
              额度</strong
            >
          </div>
        </button>
      </div>
      <div class="ai-pagination">
        <button class="btn small" :disabled="page <= 1" @click="page--">
          上一页</button
        ><span>{{ page }}</span
        ><button
          class="btn small"
          :disabled="page * 30 >= history.total"
          @click="page++"
        >
          下一页
        </button>
      </div>
      <AppDialog
        :open="!!selected"
        title="调用明细与费用核对"
        :width="920"
        :busy="busy"
        @close="selected = null"
      >
        <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
        <article v-if="selected" class="ai-detail">
          <p v-if="selected.chargeCapped" class="ai-error">
            服务商用量超过预占估算，未向用户追加扣款；请检查模型计量口径与费率。
          </p>
          <div class="section-line">
            <h2>调用明细</h2>
            <button class="text-btn" @click="selected = null">收起详情</button>
          </div>
          <AiRunMeta :run="selected" />
          <div
            v-if="
              selected.billingStatus === 'settled' &&
              Number(selected.chargedPoints) > 0
            "
            class="ai-reconcile"
          >
            <h3>退还本次额度</h3>
            <p class="tiny muted">
              冲正返回原扣费批次，已过期的部分进入过期额度；保留原消费及返还流水。
            </p>
            <form class="ai-form-row" @submit.prevent="reverse">
              <AppField
                v-model="reverseNote"
                minlength="5"
                maxlength="300"
                aria-label="冲正原因"
                placeholder="填写冲正原因，至少 5 个字符"
                required
              /><button class="btn small" :disabled="busy">
                确认冲正本次扣费
              </button>
            </form>
          </div>
          <section v-if="selected.attempts?.length" class="ai-attempts">
            <h3>上游调用链 · {{ selected.attempts.length }} 次尝试</h3>
            <p class="tiny muted">
              已知上游输入 {{ selected.upstreamUsage?.input || 0 }} / 输出
              {{ selected.upstreamUsage?.output || 0 }}
              Token；含失败重试，可能大于用户结算用量。
            </p>
            <article
              v-for="attempt in selected.attempts"
              :key="attempt.id"
              class="ai-audit-row"
            >
              <strong
                >#{{ attempt.number }} {{ attempt.providerName }} ·
                {{ attempt.actualModel || attempt.model }}</strong
              >
              <p class="tiny muted">
                {{
                  attempt.status === "succeeded"
                    ? "返回有效结果"
                    : attempt.status === "running"
                      ? "调用中或中断"
                      : "失败"
                }}
                · {{ attempt.durationMs ?? "?" }} ms ·
                {{ attempt.requestId || "未返回请求 ID" }}
              </p>
              <p v-if="attempt.usage" class="tiny">
                输入 {{ attempt.usage.input }} / 输出
                {{ attempt.usage.output }} / 缓存 {{ attempt.usage.cached }} /
                推理 {{ attempt.usage.reasoning }} Token
              </p>
              <p v-else class="tiny">
                {{
                  attempt.noCharge
                    ? "上游明确拒绝或未发送，不结算"
                    : "用量未知，需核对服务商账单"
                }}
              </p>
              <p v-if="attempt.error" class="ai-error">
                {{ attempt.error
                }}{{
                  attempt.upstreamStatus
                    ? " · HTTP " + attempt.upstreamStatus
                    : ""
                }}
                · {{ attempt.providerError }}
              </p>
            </article>
            <div
              v-if="
                !selected.upstreamCostReview &&
                selected.attempts?.length &&
                selected.status !== 'running'
              "
              class="ai-reconcile"
            >
              <h3>核对平台上游成本</h3>
              <p class="tiny muted">
                已知预计采购成本 ¥{{ selected.estimatedCostCny || 0
                }}{{
                  selected.costIncomplete ? " · 部分尝试未能估价" : ""
                }}，仅供对账参考。
              </p>
              <p class="tiny muted">
                记录上游账单核对结果，此操作不改变用户额度。任务自身若为“额度待核对”，仍需另行结算预占额度。
              </p>
              <form class="ai-form-row" @submit.prevent="reviewCosts">
                <AppField
                  v-model="costCny"
                  inputmode="decimal"
                  aria-label="实际采购成本"
                  placeholder="实际账单人民币金额 · 可选"
                />
                <AppField
                  v-model="costNote"
                  maxlength="300"
                  placeholder="填写账单核对依据，至少 5 个字符"
                  aria-label="上游成本核对依据"
                /><button class="btn small" :disabled="busy">
                  记录成本核对
                </button>
              </form>
            </div>
            <p v-if="selected.upstreamCostReview" class="tiny muted">
              已核对：{{ selected.upstreamCostReview.note }} · 实际成本
              {{
                selected.upstreamCostReview.actualCostCny === null
                  ? "未填"
                  : "¥" + selected.upstreamCostReview.actualCostCny
              }}
              ·
              {{ dateLabel(selected.upstreamCostReview.createdAt) }}
            </p>
            <AppDisclosure title="查看每次上游尝试的完整记录">
              <pre class="ai-json">{{
                JSON.stringify(selected.attempts, null, 2)
              }}</pre>
            </AppDisclosure>
          </section>
          <p class="tiny muted">
            请求 {{ selected.id }} · 上游
            {{ selected.upstreamRequestId || "未返回" }} ·
            {{ selected.actualModel || selected.config?.model }}
          </p>
          <div v-if="selected.billingStatus === 'pending'" class="ai-reconcile">
            <h3>核对后结算</h3>
            <p class="tiny muted">
              请依据服务商记录填写实际额度。0
              表示全部释放；此操作会记入审计，且不能重复执行。
            </p>
            <form class="ai-form-row" @submit.prevent="reconcile">
              <AppField
                v-model="reconcilePoints"
                inputmode="decimal"
                aria-label="核对结算额度"
              /><AppField
                v-model="reconcileNote"
                maxlength="300"
                aria-label="人工核对原因"
                placeholder="填写核对依据，至少 5 个字符"
              /><button class="btn primary small" :disabled="busy">
                提交人工结算
              </button>
            </form>
          </div>
          <AppDisclosure title="查看实际发送的消息与题目快照">
            <pre class="ai-json">{{
              JSON.stringify(
                {
                  messages: selected.messages,
                  context: selected.context,
                  templateVersion: selected.templateVersion,
                },
                null,
                2,
              )
            }}</pre></AppDisclosure
          ><AppDisclosure title="查看模型返回内容与用量明细">
            <pre class="ai-json">{{
              JSON.stringify(
                {
                  responseText: selected.responseText,
                  result: selected.result,
                  usage: selected.usage,
                  reconciliation: selected.reconciliation,
                  error: selected.error,
                  providerError: selected.providerError,
                },
                null,
                2,
              )
            }}</pre>
          </AppDisclosure>
        </article>
      </AppDialog>
      <AppDisclosure title="最近 30 条管理操作审计"
        ><div class="ai-record-list">
          <article
            v-for="item in summary.audit"
            :key="item.id"
            class="ai-audit-row"
          >
            <strong>{{ item.action }}</strong
            ><span class="tiny muted"
              >{{ dateLabel(item.createdAt) }} · {{ item.userId }}</span
            >
            <pre class="ai-json">{{ item.data }}</pre>
          </article>
        </div></AppDisclosure
      >
    </template>
  </div>
</template>
