<script setup>
import { ref, watch, onMounted } from "vue";
import { request, toast, dateLabel } from "../store.js";
import { featureLabel, aiStateLabel, refreshAi } from "../ai.js";
import AppField from "../components/AppField.vue";
import AppSelect from "../components/AppSelect.vue";
import AppDisclosure from "../components/AppDisclosure.vue";
import AiRunMeta from "../components/AiRunMeta.vue";
import AdminAiPool from "../components/AdminAiPool.vue";
const tab = ref("config"),
  error = ref(""),
  busy = ref(false);
const users = ref([]),
  userQuery = ref(""),
  selectedUser = ref(""),
  amount = ref("1000"),
  note = ref("学习体验额度"),
  operationId = ref(crypto.randomUUID());
const history = ref({ rows: [], total: 0 }),
  page = ref(1),
  feature = ref(""),
  status = ref(""),
  selected = ref(null),
  reconcilePoints = ref("0"),
  reconcileNote = ref(""),
  costNote = ref("");
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
async function loadUsers() {
  users.value = (
    await request(
      "/admin/ai/users?query=" + encodeURIComponent(userQuery.value),
    )
  ).users;
}
async function grant() {
  await act(async () => {
    await request("/admin/ai/credits", "POST", {
      userId: selectedUser.value,
      amount: Number(amount.value),
      note: note.value,
      operationId: operationId.value,
    });
    await loadUsers();
    await refreshAi();
    operationId.value = crypto.randomUUID();
    toast("额度调整已记录");
  });
}
async function block(user) {
  await act(async () => {
    await request("/admin/ai/users/" + user.id + "/block", "POST", {
      blocked: !user.blocked,
    });
    await loadUsers();
  });
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
  });
}
async function reconcile() {
  await act(async () => {
    await request(
      "/admin/ai/runs/" + selected.value.id + "/reconcile",
      "POST",
      { points: Number(reconcilePoints.value), note: reconcileNote.value },
    );
    selected.value = await request("/admin/ai/runs/" + selected.value.id);
    await loadHistory();
    await loadSummary();
    await refreshAi();
    toast("人工结算已记录");
  });
}
async function reviewCosts() {
  await act(async () => {
    await request(
      "/admin/ai/runs/" + selected.value.id + "/cost-review",
      "POST",
      { note: costNote.value },
    );
    selected.value = await request("/admin/ai/runs/" + selected.value.id);
    await loadHistory();
    await loadSummary();
    toast("上游成本核对已记录，用户额度不变");
  });
}
watch(
  [selectedUser, amount, note],
  () => (operationId.value = crypto.randomUUID()),
);
watch([feature, status], () => {
  page.value = 1;
  void act(loadHistory);
});
watch(page, () => void act(loadHistory));
onMounted(
  () =>
    void act(async () => {
      await Promise.all([loadUsers(), loadHistory(), loadSummary()]);
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
            await loadUsers();
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
    <template v-if="tab === 'users'">
      <section class="ai-detail">
        <h2>分配学习资源点</h2>
        <p class="tiny muted">
          新注册账号初始额度为
          0。负数用于撤回可用额度，不会占用正在处理的预占额度。
        </p>
        <form class="ai-form-row" @submit.prevent="grant">
          <AppSelect
            v-model="selectedUser"
            label="额度调整账号"
            :options="[
              { value: '', label: '选择账号' },
              ...users.map((u) => ({
                value: u.id,
                label:
                  (u.displayName || u.username) +
                  ' · ' +
                  u.publicId +
                  ' (' +
                  u.username +
                  ')',
              })),
            ]"
          /><AppField
            v-model="amount"
            type="number"
            aria-label="调整资源点"
            min="-1000000"
            max="1000000"
          /><AppField
            v-model="note"
            maxlength="300"
            aria-label="额度调整原因"
          /><button class="btn primary small" :disabled="busy || !selectedUser">
            确认调整
          </button>
        </form>
      </section>
      <form class="ai-form-row" @submit.prevent="act(loadUsers)">
        <AppField
          v-model="userQuery"
          maxlength="40"
          aria-label="搜索账号"
          placeholder="搜索用户 ID、账号或名称，最多显示 100 人"
        /><button class="btn small" :disabled="busy">搜索账号</button>
      </form>
      <div class="ai-record-list">
        <article v-for="user in users" :key="user.id" class="ai-record-row">
          <div>
            <strong
              >{{ user.displayName || user.username }}
              <span class="tiny muted">{{
                user.role === "admin" ? "管理员" : "用户"
              }}</span></strong
            ><span class="tiny muted"
              >ID {{ user.publicId }} · 登录账号 {{ user.username }}</span
            ><span class="tiny muted"
              >{{ user.blocked ? "AI 已暂停" : "AI 可用" }} · 可用
              {{ user.balance - user.reserved }} / 预占
              {{ user.reserved }}</span
            >
          </div>
          <div class="row wrap">
            <button class="text-btn" @click="selectedUser = user.id">
              调整额度</button
            ><button class="btn small" :disabled="busy" @click="block(user)">
              {{ user.blocked ? "恢复 AI 使用" : "暂停 AI 使用" }}
            </button>
          </div>
        </article>
      </div>
    </template>
    <template v-if="tab === 'history'">
      <section class="ai-detail">
        <h2>近 24 小时用量</h2>
        <p class="tiny muted">
          这里统计用户结算用量；自动切换产生的额外上游消耗与未知用量，请在调用详情中核对。
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
              已结算 {{ item.points ?? 0 }} 点 · 待核对 {{ item.pending }} 条
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
              点</strong
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
      <article v-if="selected" class="ai-detail">
        <p v-if="selected.chargeCapped" class="ai-error">
          服务商用量超过预占估算，本次按预占上限结算；请检查模型计量口径与费率。
        </p>
        <div class="section-line">
          <h2>调用明细</h2>
          <button class="text-btn" @click="selected = null">收起详情</button>
        </div>
        <AiRunMeta :run="selected" />
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
              输入 {{ attempt.usage.input }} / 输出 {{ attempt.usage.output }} /
              缓存 {{ attempt.usage.cached }} / 推理
              {{ attempt.usage.reasoning }} Token
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
            v-if="selected.upstreamCostPending && selected.status !== 'running'"
            class="ai-reconcile"
          >
            <h3>核对平台上游成本</h3>
            <p class="tiny muted">
              记录未知尝试的账单核对结果，此操作不改变用户资源点。任务自身若为“用量待核对”，仍需另行结算预占额度。
            </p>
            <form class="ai-form-row" @submit.prevent="reviewCosts">
              <AppField
                v-model="costNote"
                maxlength="300"
                placeholder="填写账单核对依据，至少 5 个字符"
                aria-label="上游成本核对依据"
              /><button class="btn small" :disabled="busy">记录成本核对</button>
            </form>
          </div>
          <p v-if="selected.upstreamCostReview" class="tiny muted">
            已核对：{{ selected.upstreamCostReview.note }} ·
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
        <div v-if="selected.status === 'pending'" class="ai-reconcile">
          <h3>核对后结算</h3>
          <p class="tiny muted">
            请依据服务商记录填写实际资源点。0
            表示全部释放；此操作会记入审计，且不能重复执行。
          </p>
          <form class="ai-form-row" @submit.prevent="reconcile">
            <AppField
              v-model="reconcilePoints"
              type="number"
              min="0"
              :max="selected.reservedPoints"
              aria-label="核对结算点数"
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
