<script setup>
import { ref, watch, onMounted, computed, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import { request, toast, dateLabel } from "../store.js";
import { refreshAi } from "../ai.js";
import AppField from "../components/AppField.vue";
import AppDisclosure from "../components/AppDisclosure.vue";
import AdminCallHistory from "../components/AdminCallHistory.vue";
import AdminCallDetail from "../components/AdminCallDetail.vue";
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
    route.query.tab === "limits"
      ? "models"
      : [
            "providers",
            "models",
            "users",
            "products",
            "pricing",
            "history",
          ].includes(route.query.tab)
        ? route.query.tab
        : "providers",
  set: (value) =>
    router.replace({
      path: "/admin",
      query: { ...route.query, tab: value === "providers" ? undefined : value },
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
          ['providers', '服务商管理'],
          ['models', '模型管理'],
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
    <AdminAiPool
      v-if="['providers', 'models'].includes(tab)"
      :key="tab"
      :section="tab"
    />
    <AdminCredits v-if="tab === 'users'" />
    <AdminProducts v-if="tab === 'products'" />
    <AdminPricing v-if="tab === 'pricing'" />
    <template v-if="tab === 'history'">
      <AdminCallHistory
        :history="history"
        :summary="summary"
        :busy="busy"
        v-model:feature="feature"
        v-model:status="status"
        v-model:page="page"
        @detail="detail"
      />
      <AppDialog
        :open="!!selected"
        title="调用明细与费用核对"
        description="查看执行过程，核对用户额度与平台上游账单。"
        :width="1040"
        :busy="busy"
        @close="selected = null"
      >
        <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
        <AdminCallDetail v-if="selected" :run="selected">
          <template #actions>
            <section
              v-if="selected.billingStatus === 'pending'"
              class="call-review-card"
            >
              <h4>用户额度待核对</h4>
              <p>
                依据服务商记录填写实际额度，不能超过原预占。填写 0
                表示全部释放；仅可结算一次。
              </p>
              <form @submit.prevent="reconcile">
                <div class="call-action-fields">
                  <label
                    >实际结算额度<AppField
                      v-model="reconcilePoints"
                      inputmode="decimal"
                      aria-label="核对结算额度"
                      required
                  /></label>
                  <label class="call-action-wide"
                    >核对依据<AppField
                      v-model="reconcileNote"
                      multiline
                      rows="2"
                      minlength="5"
                      maxlength="300"
                      aria-label="人工核对原因"
                      placeholder="说明核对依据，至少 5 个字符"
                      required
                  /></label>
                </div>
                <div class="call-action-footer">
                  <button class="btn primary small" :disabled="busy">
                    提交人工结算
                  </button>
                </div>
              </form>
            </section>
            <AppDisclosure
              v-if="
                selected.billingStatus === 'settled' &&
                Number(selected.chargedPoints) > 0
              "
              title="退还本次用户扣费"
              class="call-action-disclosure"
            >
              <p>
                额度退回原扣费批次。原批次已过期的部分进入过期记录，原始消费和返还流水均会保留。
              </p>
              <form @submit.prevent="reverse">
                <div class="call-action-fields">
                  <label class="call-action-wide"
                    >冲正原因<AppField
                      v-model="reverseNote"
                      multiline
                      rows="2"
                      minlength="5"
                      maxlength="300"
                      aria-label="冲正原因"
                      placeholder="说明退还原因，至少 5 个字符"
                      required
                  /></label>
                </div>
                <div class="call-action-footer">
                  <button class="btn small" :disabled="busy">
                    确认冲正本次扣费
                  </button>
                </div>
              </form>
            </AppDisclosure>
            <AppDisclosure
              v-if="
                !selected.upstreamCostReview &&
                selected.attempts?.length &&
                selected.status !== 'running'
              "
              title="核对平台上游成本"
              class="call-action-disclosure"
              :default-open="
                !!selected.upstreamCostPending || !!selected.costIncomplete
              "
            >
              <p>
                已知预估成本
                {{
                  selected.estimatedCostCny == null
                    ? "未知"
                    : "¥" + selected.estimatedCostCny
                }}{{
                  selected.costIncomplete ? "（部分尝试未能估价）" : ""
                }}。填写实际账单金额与核对依据，此操作不改变用户额度。
              </p>
              <form @submit.prevent="reviewCosts">
                <div class="call-action-fields">
                  <label
                    >实际账单金额 · 元<AppField
                      v-model="costCny"
                      inputmode="decimal"
                      aria-label="实际采购成本"
                      placeholder="可选，未填写则保持未知"
                  /></label>
                  <label class="call-action-wide"
                    >账单核对依据<AppField
                      v-model="costNote"
                      multiline
                      rows="2"
                      minlength="5"
                      maxlength="300"
                      aria-label="上游成本核对依据"
                      placeholder="说明核对依据，至少 5 个字符"
                      required
                  /></label>
                </div>
                <div class="call-action-footer">
                  <button class="btn small" :disabled="busy">
                    记录成本核对
                  </button>
                </div>
              </form>
            </AppDisclosure>
            <div v-if="selected.upstreamCostReview" class="call-reviewed">
              <strong>上游成本已核对</strong>
              <p>{{ selected.upstreamCostReview.note }}</p>
              <p>
                实际成本
                {{
                  selected.upstreamCostReview.actualCostCny == null
                    ? "未填写"
                    : "¥" + selected.upstreamCostReview.actualCostCny
                }}
                · {{ dateLabel(selected.upstreamCostReview.createdAt) }}
              </p>
            </div>
          </template>
        </AdminCallDetail>
      </AppDialog>
    </template>
  </div>
</template>
