<script setup>
import { ref, reactive, onMounted, watch } from "vue";
import { request, toast } from "../store.js";
import { refreshAi, useAiTask } from "../ai.js";
import AppField from "./AppField.vue";
import AppSelect from "./AppSelect.vue";
import AppDisclosure from "./AppDisclosure.vue";
import AiRunMeta from "./AiRunMeta.vue";
const busy = ref(false),
  error = ref(""),
  encryptionReady = ref(false);
const pool = reactive({ revision: undefined, providers: [], policy: {} });
const health = ref([]),
  models = reactive({});
const task = useAiTask();
const featureOptions = [
  ["grade", "主观评阅"],
  ["variants", "举一反三"],
  ["interview", "模拟面试"],
];
const booleanOptions = [
  { value: true, label: "启用" },
  { value: false, label: "停用" },
];
const fields = [
  ["outputLimit", "最大输出 Token", 512, 4096],
  ["inputRate", "每千输入 Token 资源点", 1, 1000],
  ["cachedRate", "每千缓存 Token 资源点", 1, 1000],
  ["outputRate", "每千输出 Token 资源点", 1, 1000],
  ["dailyRuns", "每用户近 24 小时次数", 1, 100],
  ["siteDailyRuns", "全站近 24 小时次数", 1, 10000],
  ["perQuestionRuns", "每题近 24 小时评阅次数", 1, 10],
  ["maxAttempts", "每任务最多上游尝试次数", 1, 3],
  ["attemptTimeoutMs", "单次上游超时（毫秒）", 10000, 60000],
  ["totalTimeoutMs", "任务总超时（毫秒）", 10000, 90000],
];
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
async function load() {
  const data = await request("/admin/ai/pool");
  encryptionReady.value = data.encryptionReady;
  accept(data.pool);
}
async function refreshHealth() {
  const data = await request("/admin/ai/pool");
  health.value = data.pool.health;
}
function addProvider() {
  pool.providers.push({
    id: crypto.randomUUID(),
    name: "新服务商",
    baseUrl: "https://api.openai.com/v1",
    protocol: "chat",
    enabled: true,
    maxConcurrent: 3,
    apiKey: "",
    hasKey: false,
    models: [],
  });
}
function addModel(p) {
  p.models.push({
    id: crypto.randomUUID(),
    model: "",
    enabled: true,
    features: ["grade", "variants", "interview"],
    priority: 0,
    weight: 1,
    maxConcurrent: 3,
    format: "schema",
    tokenParameter: "max_completion_tokens",
  });
}
function toggleFeature(m, f) {
  if (m.features.includes(f)) m.features = m.features.filter((x) => x !== f);
  else m.features.push(f);
}
async function save() {
  await act(async () => {
    const providers = pool.providers.map(({ hasKey, apiKey, ...p }) => ({
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
    const policy = Object.fromEntries(
      Object.entries(pool.policy).map(([k, v]) => [k, Number(v)]),
    );
    const data = await request("/admin/ai/pool", "PUT", {
      revision: pool.revision,
      policy,
      providers,
    });
    accept(data.pool);
    await refreshAi();
    toast("服务池配置已保存，新的调用将自动调度");
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
    const data = await request("/admin/ai/health/" + id + "/reset", "POST", {});
    health.value = data.health;
    toast("已恢复参与调度，下次调用将重新验证");
  });
}
function state(id) {
  return health.value.find((h) => h.id === id);
}
function stateText(id) {
  const h = state(id);
  if (!h) return "尚未保存";
  const name = {
    healthy: "可用",
    disabled: "暂停 · 需修正后恢复",
    cooldown: "冷却中",
    "half-open": "等待恢复探测",
  }[h.state];
  return (
    name +
    (h.state === "cooldown"
      ? " · 至 " + new Date(h.until).toLocaleTimeString()
      : "") +
    " · 正在调用 " +
    h.active
  );
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
    <p v-if="error || task.error.value" class="ai-error" role="alert">
      {{ error || task.error.value }}
    </p>
    <p v-if="!encryptionReady" class="info-banner">
      请先在服务器配置 AI_ENCRYPTION_KEY，服务商 Key 将加密保存。
    </p>
    <section class="ai-detail">
      <div class="section-line">
        <h2>服务池与故障切换</h2>
        <button
          type="button"
          class="btn small"
          :disabled="busy"
          @click="act(refreshHealth)"
        >
          刷新健康状态
        </button>
      </div>
      <p class="tiny muted">
        先选择优先级数字最小的可用模型，同级按权重和当前并发分配。故障、限流会自动避让并尝试其他模型；备用模型可设置更大的优先级数字。连接测试只测试指定模型。
      </p>
      <p class="tiny muted">
        切换成功后只按最终结果结算一次；全部失败时按已知用量结算，未知用量保留预占待核对。每次上游尝试都会记录，超时可能产生的平台额外费用会标记待核对。当前协议支持
        OpenAI 兼容 Chat Completions 和 Responses。
      </p>
      <AiRunMeta :run="task.run.value" />
    </section>
    <form class="ai-admin-form" @submit.prevent="save">
      <article
        v-for="(p, pi) in pool.providers"
        :key="p.id"
        class="ai-detail ai-pool-provider"
      >
        <div class="section-line">
          <h2>服务商 {{ pi + 1 }} · {{ p.name }}</h2>
          <button
            type="button"
            class="text-btn"
            :disabled="busy"
            @click="pool.providers.splice(pi, 1)"
          >
            移除服务商
          </button>
        </div>
        <p class="ai-health" :data-state="state(p.id)?.state">
          {{ stateText(p.id)
          }}<span v-if="state(p.id)?.reason"> · {{ state(p.id).reason }}</span>
        </p>
        <div class="ai-admin-grid">
          <label
            >服务商名称<AppField v-model="p.name" maxlength="80" required
          /></label>
          <label
            >参与调度<AppSelect
              v-model="p.enabled"
              :options="booleanOptions"
              label="服务商启用状态"
          /></label>
          <label
            >接口协议<AppSelect
              v-model="p.protocol"
              :options="[
                { value: 'chat', label: 'OpenAI 兼容 Chat Completions' },
                { value: 'responses', label: 'OpenAI Responses' },
              ]"
              label="服务商接口协议"
          /></label>
          <label
            >服务商最大并发<AppField
              v-model="p.maxConcurrent"
              type="number"
              min="1"
              max="10"
              required
          /></label>
          <label class="ai-wide"
            >Base URL<AppField
              v-model="p.baseUrl"
              type="url"
              placeholder="https://api.example.com/v1"
              maxlength="500"
              required
          /></label>
          <label class="ai-wide"
            >API Key · {{ p.hasKey ? "已加密保存，留空保留" : "首次保存必填"
            }}<AppField
              v-model="p.apiKey"
              type="password"
              autocomplete="new-password"
              maxlength="1000"
              :required="!p.hasKey"
          /></label>
        </div>
        <div class="row wrap">
          <button
            type="button"
            class="btn small"
            :disabled="busy || !p.hasKey"
            @click="loadModels(p)"
          >
            读取该服务商 models 列表
          </button>
          <button
            v-if="state(p.id) && state(p.id).state !== 'healthy'"
            type="button"
            class="btn small"
            :disabled="busy"
            @click="reset(p.id)"
          >
            恢复该服务商
          </button>
        </div>
        <p class="tiny muted">
          首次先保存连接，再读取模型。修改连接或 Key
          后需保存，测试与读取列表使用已保存配置。
        </p>
        <article v-for="(m, mi) in p.models" :key="m.id" class="ai-pool-model">
          <div class="section-line">
            <h3>模型 {{ mi + 1 }} · {{ m.model || "待填写" }}</h3>
            <button
              type="button"
              class="text-btn"
              :disabled="busy"
              @click="p.models.splice(mi, 1)"
            >
              移除模型
            </button>
          </div>
          <p class="ai-health" :data-state="state(m.id)?.state">
            {{ stateText(m.id)
            }}<span v-if="state(m.id)?.reason">
              · {{ state(m.id).reason }}</span
            >
          </p>
          <div class="ai-admin-grid">
            <label
              >模型 ID<AppField
                v-model="m.model"
                maxlength="160"
                placeholder="服务商提供的模型 ID"
                required
            /></label>
            <label v-if="models[p.id]?.length"
              >从 models 列表选择<AppSelect
                v-model="m.model"
                :options="
                  models[p.id].map((value) => ({ value, label: value }))
                "
                label="服务商模型列表"
            /></label>
            <label
              >参与调度<AppSelect
                v-model="m.enabled"
                :options="booleanOptions"
                label="模型启用状态"
            /></label>
            <label
              >优先级 · 数字越小越优先<AppField
                v-model="m.priority"
                type="number"
                min="0"
                max="10"
                required
            /></label>
            <label
              >调度权重<AppField
                v-model="m.weight"
                type="number"
                min="1"
                max="100"
                required
            /></label>
            <label
              >模型最大并发<AppField
                v-model="m.maxConcurrent"
                type="number"
                min="1"
                max="10"
                required
            /></label>
            <label
              >输出格式<AppSelect
                v-model="m.format"
                label="模型输出格式"
                :options="[
                  { value: 'schema', label: '严格 JSON Schema' },
                  { value: 'json', label: 'JSON 对象模式' },
                  { value: 'prompt', label: '提示词 JSON · 兼容模式' },
                ]"
            /></label>
            <label v-if="p.protocol === 'chat'"
              >输出上限参数<AppSelect
                v-model="m.tokenParameter"
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
            <button
              v-for="[f, label] in featureOptions"
              :key="f"
              type="button"
              class="btn small"
              :class="{ primary: m.features.includes(f) }"
              :aria-pressed="m.features.includes(f)"
              @click="toggleFeature(m, f)"
            >
              {{ label }}
            </button>
          </div>
          <p v-if="!m.features.length" class="ai-error">
            至少选择一种模型用途。
          </p>
          <div class="row wrap">
            <button
              type="button"
              class="btn small"
              :disabled="
                busy ||
                task.busy.value ||
                !state(m.id) ||
                !p.enabled ||
                !m.enabled
              "
              @click="task.start('/admin/ai/test', { targetId: m.id })"
            >
              测试此模型
            </button>
            <button
              v-if="state(m.id) && state(m.id).state !== 'healthy'"
              type="button"
              class="text-btn"
              :disabled="busy"
              @click="reset(m.id)"
            >
              恢复此模型
            </button>
          </div>
        </article>
        <button
          type="button"
          class="btn small"
          :disabled="busy || p.models.length >= 16"
          @click="addModel(p)"
        >
          添加模型
        </button>
      </article>
      <p v-if="!pool.providers.length" class="ai-empty">
        尚未配置服务商，添加连接后可配置多个模型。
      </p>
      <button
        type="button"
        class="btn"
        :disabled="busy || pool.providers.length >= 12"
        @click="addProvider"
      >
        添加服务商
      </button>
      <section class="ai-detail">
        <AppDisclosure title="全站资源点、调用限制与超时" default-open>
          <p class="tiny muted">
            资源点费率对所有模型统一，修改后只影响新任务。每任务最多预占一次额度；自动切换不会额外扣用户资源点。超时及重试次数共同限制上游成本。
          </p>
          <div class="ai-admin-grid">
            <label v-for="[key, label, min, max] in fields" :key="key"
              >{{ label
              }}<AppField
                v-model="pool.policy[key]"
                type="number"
                :min="min"
                :max="max"
                required
            /></label>
          </div>
        </AppDisclosure>
      </section>
      <button class="btn primary" :disabled="busy || !encryptionReady">
        {{ busy ? "保存中…" : "保存服务池配置" }}
      </button>
    </form>
  </div>
</template>
<style>
.ai-pool-provider,
.ai-pool-model {
  min-width: 0;
}
.ai-pool-provider {
  margin-block: 16px;
}
.ai-pool-model {
  margin-block: 18px;
  padding: 18px;
  border: 1px solid var(--line, #dce4df);
  border-radius: 10px;
  background: var(--paper, #fff);
}
.ai-model-features {
  margin-block: 14px;
}
.ai-health {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.ai-health[data-state="cooldown"],
.ai-health[data-state="disabled"] {
  color: #a04732;
}
.ai-pool .section-line {
  flex-wrap: wrap;
  gap: 10px;
}
.ai-pool h2,
.ai-pool h3 {
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  .ai-pool-model {
    padding: 12px;
  }
  .ai-pool .row > .btn {
    white-space: normal;
  }
}
</style>
