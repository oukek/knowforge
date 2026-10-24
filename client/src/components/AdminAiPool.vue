<script setup>
import { ref, reactive, computed, onMounted, watch } from "vue";
import { request, toast } from "../store.js";
import { refreshAi, useAiTask } from "../ai.js";
import AppDialog from "./AppDialog.vue";
import AppField from "./AppField.vue";
import AppSelect from "./AppSelect.vue";
import AppChoice from "./AppChoice.vue";
import AiRunMeta from "./AiRunMeta.vue";
const busy = ref(false),
  error = ref(""),
  formError = ref(""),
  encryptionReady = ref(false),
  dialog = ref("");
const pool = reactive({ revision: undefined, providers: [], policy: {} }),
  health = ref([]),
  models = reactive({});
const draft = ref({}),
  providerId = ref(""),
  editingId = ref(""),
  removeTarget = ref(null),
  testTarget = ref(null),
  costEnabled = ref(false);
const task = useAiTask(),
  clone = (x) => JSON.parse(JSON.stringify(x));
const features = [
  ["grade", "主观评阅"],
  ["variants", "举一反三"],
  ["interview", "模拟面试"],
];
const enabledOptions = [
  { value: true, label: "启用" },
  { value: false, label: "停用" },
];
const fields = [
  ["outputLimit", "最大输出 Token", 512, 4096],
  ["inputRate", "每千输入 Token 额度", 1, 1000],
  ["cachedRate", "每千缓存 Token 额度", 1, 1000],
  ["outputRate", "每千输出 Token 额度", 1, 1000],
  ["dailyRuns", "每用户近 24 小时次数", 1, 100],
  ["siteDailyRuns", "全站近 24 小时次数", 1, 10000],
  ["perQuestionRuns", "每题近 24 小时评阅次数", 1, 10],
  ["maxAttempts", "每任务最多上游尝试次数", 1, 3],
  ["attemptTimeoutMs", "单次上游超时（毫秒）", 10000, 60000],
  ["totalTimeoutMs", "任务总超时（毫秒）", 10000, 90000],
];
const title = computed(
  () =>
    ({
      provider: editingId.value ? "编辑服务商" : "添加服务商",
      model: editingId.value ? "编辑模型" : "添加模型",
      policy: "配置费率、调用限制与超时",
      remove: "确认移除配置",
      test: "测试已保存模型",
    })[dialog.value] || "服务配置",
);
function accept(data) {
  pool.revision = data.revision;
  pool.policy = { ...data.policy };
  pool.providers = data.providers.map((p) => ({
    ...p,
    apiKey: "",
    models: p.models.map((m) => ({ ...m, features: [...m.features] })),
  }));
  health.value = data.health || [];
}
async function act(fn) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  formError.value = "";
  try {
    await fn();
  } catch (e) {
    (dialog.value ? formError : error).value = e.message;
  } finally {
    busy.value = false;
  }
}
async function load() {
  const data = await request("/admin/ai/pool");
  encryptionReady.value = data.encryptionReady;
  accept(data.pool);
}
async function refreshHealth() {
  const data = await request("/admin/ai/pool");
  health.value = data.pool.health || [];
}
async function persist(providers, policy = pool.policy) {
  const body = providers.map(({ hasKey, apiKey, ...p }) => ({
    ...p,
    maxConcurrent: Number(p.maxConcurrent),
    ...(apiKey ? { apiKey } : {}),
    models: p.models.map((m) => ({
      ...m,
      weight: Number(m.weight),
      priority: Number(m.priority),
      maxConcurrent: Number(m.maxConcurrent),
    })),
  }));
  const data = await request("/admin/ai/pool", "PUT", {
    revision: pool.revision,
    providers: body,
    policy: Object.fromEntries(
      Object.entries(policy).map(([k, v]) => [k, Number(v)]),
    ),
  });
  accept(data.pool);
  await refreshAi();
}
function openProvider(p) {
  editingId.value = p?.id || "";
  providerId.value = "";
  draft.value = p
    ? clone(p)
    : {
        id: crypto.randomUUID(),
        name: "",
        baseUrl: "https://api.openai.com/v1",
        protocol: "chat",
        enabled: true,
        maxConcurrent: 3,
        apiKey: "",
        hasKey: false,
        models: [],
      };
  formError.value = "";
  dialog.value = "provider";
}
function openModel(p, m) {
  providerId.value = p.id;
  editingId.value = m?.id || "";
  draft.value = m
    ? clone(m)
    : {
        id: crypto.randomUUID(),
        model: "",
        enabled: true,
        features: ["grade", "variants", "interview"],
        priority: 0,
        weight: 1,
        maxConcurrent: 3,
        format: "schema",
        tokenParameter: "max_completion_tokens",
        procurement: null,
      };
  costEnabled.value = !!draft.value.procurement;
  if (!draft.value.procurement)
    draft.value.procurement = { input: "", cached: "", output: "" };
  formError.value = "";
  dialog.value = "model";
}
function openPolicy() {
  draft.value = clone(pool.policy);
  formError.value = "";
  dialog.value = "policy";
}
function close() {
  if (busy.value) return;
  dialog.value = "";
  draft.value = {};
  formError.value = "";
}
function askRemove(p, m) {
  removeTarget.value = {
    providerId: p.id,
    modelId: m?.id,
    name: m?.model || p.name,
  };
  formError.value = "";
  dialog.value = "remove";
}
async function save() {
  await act(async () => {
    const next = clone(pool.providers);
    if (dialog.value === "provider") {
      const p = draft.value;
      if (
        !p.name.trim() ||
        !p.baseUrl.trim() ||
        (!p.hasKey && !p.apiKey.trim())
      )
        throw new Error("请填写名称、Base URL 和 API Key。");
      const i = next.findIndex((x) => x.id === editingId.value);
      if (i >= 0) next[i] = { ...p, models: next[i].models };
      else next.push(p);
      await persist(next);
    } else if (dialog.value === "model") {
      if (!draft.value.model.trim() || !draft.value.features.length)
        throw new Error("请填写模型 ID，并至少选择一种用途。");
      const p = next.find((x) => x.id === providerId.value);
      if (!p) throw new Error("服务商已变化，请刷新后重试。");
      const m = clone(draft.value);
      m.procurement = costEnabled.value ? m.procurement : null;
      if (
        costEnabled.value &&
        Object.values(m.procurement).some((v) => v === "")
      )
        throw new Error("请填写三项采购价；真实免费项目可明确填写 0。");
      const i = p.models.findIndex((x) => x.id === editingId.value);
      if (i >= 0) p.models[i] = m;
      else p.models.push(m);
      await persist(next);
    } else if (dialog.value === "policy") await persist(next, draft.value);
    else if (dialog.value === "remove") {
      const t = removeTarget.value;
      await persist(
        t.modelId
          ? next.map((p) =>
              p.id === t.providerId
                ? { ...p, models: p.models.filter((m) => m.id !== t.modelId) }
                : p,
            )
          : next.filter((p) => p.id !== t.providerId),
      );
    }
    dialog.value = "";
    draft.value = {};
    toast("配置已保存，仅影响新的调用");
  });
}
async function loadModels(p) {
  await act(async () => {
    models[p.id] = (
      await request("/admin/ai/models", "POST", { providerId: p.id })
    ).models;
    toast("已读取 " + models[p.id].length + " 个模型");
  });
}
async function reset(id) {
  await act(async () => {
    health.value = (
      await request("/admin/ai/health/" + id + "/reset", "POST", {})
    ).health;
    toast("已恢复参与调度");
  });
}
function state(id) {
  return health.value.find((h) => h.id === id);
}
function stateText(id) {
  const h = state(id);
  return h
    ? {
        healthy: "可用",
        disabled: "已暂停",
        cooldown: "冷却中",
        "half-open": "等待恢复探测",
      }[h.state] +
        " · 调用中 " +
        h.active
    : "尚未调用";
}
function test(m) {
  task.stop();
  task.run.value = null;
  task.error.value = "";
  testTarget.value = m;
  formError.value = "";
  dialog.value = "test";
}
watch(
  () => task.run.value?.status,
  (value) => {
    if (value && value !== "running") void act(refreshHealth);
  },
);
onMounted(() => void act(load));
</script>
<template>
  <div class="ai-pool">
    <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    <p v-if="!encryptionReady" class="info-banner">
      请先在服务器配置 AI_ENCRYPTION_KEY，服务商 Key 将加密保存。
    </p>
    <section class="ai-detail">
      <div class="section-line">
        <div>
          <h2>服务商与模型</h2>
          <p class="tiny muted">
            同级按权重和并发调度，故障自动避让；配置保存后生效。
          </p>
        </div>
        <div class="row wrap">
          <button
            class="btn small"
            :disabled="busy"
            @click="act(refreshHealth)"
          >
            刷新健康状态</button
          ><button
            class="btn primary small"
            :disabled="busy || pool.providers.length >= 12"
            @click="openProvider()"
          >
            添加服务商
          </button>
        </div>
      </div>
      <div class="ai-config-summary">
        <span
          >输入 {{ pool.policy.inputRate }} / 缓存
          {{ pool.policy.cachedRate }} / 输出
          {{ pool.policy.outputRate }} 额度／千 Token</span
        ><button class="text-btn" :disabled="busy" @click="openPolicy">
          配置费率与限制
        </button>
      </div>
      <p class="tiny muted">
        用户费率统一，不随模型采购价与自动切换变化。未交付有效结果不扣用户额度，各次上游成本独立记录。
      </p>
    </section>
    <article
      v-for="p in pool.providers"
      :key="p.id"
      class="ai-detail ai-provider-summary"
    >
      <div class="section-line">
        <div>
          <h2>
            {{ p.name }}
            <span class="badge subtle">{{
              p.enabled ? "已启用" : "已停用"
            }}</span>
          </h2>
          <p class="tiny muted">
            {{ p.protocol === "chat" ? "Chat Completions" : "Responses" }} ·
            {{ p.models.length }} 个模型 · 并发 {{ p.maxConcurrent }} · Key
            {{ p.hasKey ? "已保存" : "未配置" }}
          </p>
        </div>
        <div class="row wrap">
          <button class="btn small" :disabled="busy" @click="openProvider(p)">
            编辑服务商</button
          ><button
            class="btn small"
            :disabled="busy || p.models.length >= 16"
            @click="openModel(p)"
          >
            添加模型</button
          ><button class="text-btn" :disabled="busy" @click="askRemove(p)">
            移除
          </button>
        </div>
      </div>
      <p class="tiny muted ai-endpoint">{{ p.baseUrl }}</p>
      <p class="ai-health" :data-state="state(p.id)?.state">
        {{ stateText(p.id) }} <span>{{ state(p.id)?.reason }}</span>
      </p>
      <div class="row wrap">
        <button
          class="text-btn"
          :disabled="busy || !p.hasKey"
          @click="loadModels(p)"
        >
          读取模型列表</button
        ><button
          v-if="state(p.id) && state(p.id).state !== 'healthy'"
          class="text-btn"
          :disabled="busy"
          @click="reset(p.id)"
        >
          恢复服务商
        </button>
      </div>
      <div class="ai-record-list">
        <article v-for="m in p.models" :key="m.id" class="ai-record-row">
          <div>
            <strong
              >{{ m.model }}
              <span class="tiny muted">{{
                m.enabled ? "启用" : "停用"
              }}</span></strong
            ><span class="tiny muted"
              >{{
                m.features
                  .map((f) => features.find((x) => x[0] === f)?.[1])
                  .join(" · ")
              }}
              · 优先级 {{ m.priority }} · 权重 {{ m.weight }} · 并发
              {{ m.maxConcurrent }}</span
            ><span class="tiny muted"
              >采购价：{{
                m.procurement
                  ? `输入 ${m.procurement.input} / 缓存 ${m.procurement.cached} / 输出 ${m.procurement.output} 元／百万 Token`
                  : "未配置，成本不按零估算"
              }}</span
            ><span class="ai-health" :data-state="state(m.id)?.state"
              >{{ stateText(m.id) }} {{ state(m.id)?.reason }}</span
            >
          </div>
          <div class="row wrap">
            <button class="btn small" :disabled="busy" @click="openModel(p, m)">
              编辑模型</button
            ><button
              class="btn small"
              :disabled="busy || !p.enabled || !m.enabled || task.busy.value"
              @click="test(m)"
            >
              测试</button
            ><button
              v-if="state(m.id) && state(m.id).state !== 'healthy'"
              class="text-btn"
              :disabled="busy"
              @click="reset(m.id)"
            >
              恢复</button
            ><button class="text-btn" :disabled="busy" @click="askRemove(p, m)">
              移除
            </button>
          </div>
        </article>
      </div>
      <p v-if="!p.models.length" class="ai-empty">
        添加模型后，该服务商才会参与任务调度。
      </p>
    </article>
    <p v-if="!pool.providers.length" class="ai-empty">
      尚未配置服务商。点击“添加服务商”开始。
    </p>
    <AppDialog :open="!!dialog" :title="title" :busy="busy" @close="close">
      <p
        v-if="formError || (dialog === 'test' && task.error.value)"
        class="ai-error"
        role="alert"
      >
        {{ formError || (dialog === "test" && task.error.value) }}
      </p>
      <form
        v-if="dialog === 'provider'"
        novalidate
        class="ai-admin-form"
        @submit.prevent="save"
      >
        <div class="ai-admin-grid">
          <label
            >服务商名称<AppField v-model="draft.name" maxlength="80" /></label
          ><label
            >参与调度<AppSelect
              v-model="draft.enabled"
              label="服务商启用状态"
              :options="enabledOptions" /></label
          ><label
            >接口协议<AppSelect
              v-model="draft.protocol"
              label="服务商接口协议"
              :options="[
                { value: 'chat', label: 'OpenAI 兼容 Chat Completions' },
                { value: 'responses', label: 'OpenAI Responses' },
              ]" /></label
          ><label
            >最大并发<AppField
              v-model="draft.maxConcurrent"
              type="number"
              min="1"
              max="10" /></label
          ><label class="ai-wide"
            >Base URL<AppField
              v-model="draft.baseUrl"
              type="url"
              maxlength="500" /></label
          ><label class="ai-wide"
            >API Key · {{ draft.hasKey ? "留空保留已有密钥" : "首次保存必填"
            }}<AppField
              v-model="draft.apiKey"
              type="password"
              autocomplete="new-password"
              maxlength="1000"
          /></label>
        </div>
        <button class="btn primary" :disabled="busy || !encryptionReady">
          保存服务商
        </button>
      </form>
      <form
        v-if="dialog === 'model'"
        novalidate
        class="ai-admin-form"
        @submit.prevent="save"
      >
        <div class="ai-admin-grid">
          <label
            >模型 ID<AppField v-model="draft.model" maxlength="160" /></label
          ><label v-if="models[providerId]?.length"
            >从已读取列表选择<AppSelect
              v-model="draft.model"
              label="服务商模型列表"
              :options="
                models[providerId].map((value) => ({ value, label: value }))
              " /></label
          ><label
            >参与调度<AppSelect
              v-model="draft.enabled"
              label="模型启用状态"
              :options="enabledOptions" /></label
          ><label
            >优先级 · 越小越优先<AppField
              v-model="draft.priority"
              type="number"
              min="0"
              max="10" /></label
          ><label
            >调度权重<AppField
              v-model="draft.weight"
              type="number"
              min="1"
              max="100" /></label
          ><label
            >最大并发<AppField
              v-model="draft.maxConcurrent"
              type="number"
              min="1"
              max="10" /></label
          ><label
            >输出格式<AppSelect
              v-model="draft.format"
              label="模型输出格式"
              :options="[
                { value: 'schema', label: '严格 JSON Schema' },
                { value: 'json', label: 'JSON 对象模式' },
                { value: 'prompt', label: '提示词 JSON 兼容模式' },
              ]" /></label
          ><label
            v-if="
              pool.providers.find((p) => p.id === providerId)?.protocol ===
              'chat'
            "
            >输出上限参数<AppSelect
              v-model="draft.tokenParameter"
              label="输出 Token 参数"
              :options="[
                {
                  value: 'max_completion_tokens',
                  label: 'max_completion_tokens',
                },
                { value: 'max_tokens', label: 'max_tokens' },
              ]"
          /></label>
        </div>
        <div
          class="row wrap ai-model-features"
          role="group"
          aria-label="模型用途"
        >
          <AppChoice
            v-for="[f, label] in features"
            :key="f"
            v-model="draft.features"
            :value="f"
            >{{ label }}</AppChoice
          >
        </div>
        <p class="info-banner">
          用户消耗采用统一公开费率：输入 {{ pool.policy.inputRate }}、缓存
          {{ pool.policy.cachedRate }}、输出
          {{ pool.policy.outputRate }} 额度／千 Token。采购成本只用于内部对账。
        </p>
        <AppChoice v-model="costEnabled">记录该模型的人民币采购价</AppChoice>
        <div v-if="costEnabled" class="ai-admin-grid">
          <label
            >每百万输入 Token 成本（元）<AppField
              v-model="draft.procurement.input"
              inputmode="decimal" /></label
          ><label
            >每百万缓存 Token 成本（元）<AppField
              v-model="draft.procurement.cached"
              inputmode="decimal" /></label
          ><label
            >每百万输出 Token 成本（元）<AppField
              v-model="draft.procurement.output"
              inputmode="decimal"
          /></label>
        </div>
        <p v-else class="tiny muted">
          未填写采购价时记录为未知，不伪造零成本；最终以服务商账单为准。
        </p>
        <button class="btn primary" :disabled="busy">保存模型</button>
      </form>
      <form
        v-if="dialog === 'policy'"
        novalidate
        class="ai-admin-form"
        @submit.prevent="save"
      >
        <p class="tiny muted">
          修改仅作用于新任务；运行中的调用和历史账单保留费率快照。
        </p>
        <div class="ai-admin-grid">
          <label v-for="[key, label, min, max] in fields" :key="key"
            >{{ label
            }}<AppField
              v-model="draft[key]"
              type="number"
              :min="min"
              :max="max"
          /></label>
        </div>
        <button class="btn primary" :disabled="busy">保存费率与限制</button>
      </form>
      <template v-if="dialog === 'remove'"
        ><p>
          移除“{{ removeTarget.name }}”的调度配置{{
            removeTarget.modelId ? "" : "及其模型"
          }}？调用历史与账单会保留。
        </p>
        <div class="row wrap">
          <button class="btn" :disabled="busy" @click="close">取消</button
          ><button class="btn primary" :disabled="busy" @click="save">
            确认移除
          </button>
        </div></template
      >
      <template v-if="dialog === 'test'"
        ><p>
          目标模型：{{
            testTarget.model
          }}。测试使用已保存配置，真实上游调用会记录用量与平台成本。
        </p>
        <button
          class="btn primary"
          :disabled="task.busy.value"
          @click="task.start('/admin/ai/test', { targetId: testTarget.id })"
        >
          测试此模型</button
        ><AiRunMeta :run="task.run.value"
      /></template>
    </AppDialog>
  </div>
</template>
<style>
.ai-config-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 12px 0;
  border-top: 1px solid var(--line);
  font-size: 12px;
}
.ai-provider-summary .section-line {
  flex-wrap: wrap;
  gap: 12px;
}
.ai-provider-summary .ai-record-list {
  margin-top: 16px;
}
.ai-health {
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.ai-health[data-state="cooldown"],
.ai-health[data-state="disabled"] {
  color: #a04732;
}
.ai-endpoint {
  overflow-wrap: anywhere;
}
.ai-model-features {
  gap: 16px;
  margin: 12px 0 20px;
}
</style>
