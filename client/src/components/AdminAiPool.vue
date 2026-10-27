<script setup>
import { ref, reactive, computed, onMounted, watch } from "vue";
import { request, toast } from "../store.js";
import { refreshAi, useAiTask } from "../ai.js";
import { modelOnlyPolicy } from "../ai-model-policy.js";
import AppDialog from "./AppDialog.vue";
import AppField from "./AppField.vue";
import AppSelect from "./AppSelect.vue";
import AppChoice from "./AppChoice.vue";
import AiRunMeta from "./AiRunMeta.vue";
import AiTaskProgress from "./AiTaskProgress.vue";
import AdminModelTestResult from "./AdminModelTestResult.vue";
import ModelPriceEditor from "./ModelPriceEditor.vue";
const props = defineProps({ section: { type: String, default: "providers" } });
const filterProvider = ref(""),
  filterKind = ref(""),
  search = ref("");
const priceTarget = ref(null);
const testFeature = ref("connection"),
  testDetail = ref(null),
  testDetailError = ref("");
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
  testTarget = ref(null);
const task = useAiTask(),
  clone = (x) => JSON.parse(JSON.stringify(x));
const testProvider = computed(() =>
  pool.providers.find((p) =>
    p.models.some((m) => m.id === testTarget.value?.id),
  ),
);
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
  ["dailyRuns", "每用户近 24 小时次数", 1, 100],
  ["siteDailyRuns", "全站近 24 小时次数", 1, 10000],
  ["perQuestionRuns", "每题近 24 小时评阅次数", 1, 10],
];
const schedulingFields = [
  ["maxAttempts", "每任务最多尝试次数（含首次）", 1, 3],
  ["attemptTimeoutMs", "单次上游超时（毫秒）", 10000, 60000],
  ["totalTimeoutMs", "任务总超时（毫秒）", 10000, 90000],
];
const title = computed(
  () =>
    ({
      provider: editingId.value ? "编辑服务商" : "添加服务商",
      model: editingId.value ? "编辑模型" : "添加模型",
      policy: "配置当前模型调用限制",
      scheduling: "统一调用设置",
      remove: "确认移除配置",
      test: "测试已保存模型",
    })[dialog.value] || "服务配置",
);
const providerOptions = computed(() =>
  pool.providers.map((p) => ({ value: p.id, label: p.name })),
);
const modelRows = computed(() =>
  pool.providers
    .flatMap((p) => p.models.map((m) => ({ provider: p, model: m })))
    .filter(
      ({ provider: p, model: m }) =>
        (!filterProvider.value || p.id === filterProvider.value) &&
        (!filterKind.value || m.kind === filterKind.value) &&
        (!search.value.trim() ||
          (m.model + " " + p.name)
            .toLowerCase()
            .includes(search.value.trim().toLowerCase())),
    ),
);
function priceText(m) {
  if (m.kind === "image") {
    const value = m.imageProcurement;
    return value === null || value === undefined
      ? "未配置"
      : `¥${value}／张` +
          (m.pricing?.specification ? ` · ${m.pricing.specification}` : "");
  }
  const value = m.procurement;
  return value
    ? `输入 ${value.input} / 缓存 ${value.cached} / 输出 ${value.output} 元／百万 Token`
    : "未配置";
}
function originalText(m) {
  return m.kind === "image"
    ? `¥${m.pricing.perImage}／张`
    : `输入 ${m.pricing.input} / 缓存 ${m.pricing.cached} / 输出 ${m.pricing.output} 元／百万 Token`;
}
function accept(data) {
  pool.revision = data.revision;
  pool.policy = { ...data.policy };
  pool.providers = data.providers.map((p) => ({
    ...p,
    apiKey: "",
    models: p.models.map((m) => ({
      kind: "text",
      pricing: null,
      imageProcurement: null,
      imageCredits: "1",
      ...m,
      features: [...m.features],
    })),
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
  p ||=
    pool.providers.find((p) => p.id === filterProvider.value) ||
    pool.providers[0];
  if (!p) return;
  providerId.value = p.id;
  editingId.value = m?.id || "";
  draft.value = m
    ? clone(m)
    : {
        id: crypto.randomUUID(),
        model: "",
        kind: "text",
        pricing: null,
        imageProcurement: null,
        imageCredits: "1",
        enabled: true,
        features: ["grade", "variants", "interview"],
        priority: 0,
        weight: 1,
        maxConcurrent: 3,
        format: "schema",
        tokenParameter: "max_completion_tokens",
        procurement: null,
        policy: modelOnlyPolicy(pool.policy),
      };
  formError.value = "";
  dialog.value = "model";
}
function changeKind(kind) {
  draft.value.features =
    kind === "image" ? [] : ["grade", "variants", "interview"];
  draft.value.pricing = null;
  draft.value.costDiscount = null;
  draft.value.procurement = null;
  draft.value.imageProcurement = null;
  draft.value.imageCredits = "1";
}
function openPolicy(p, m) {
  providerId.value = p.id;
  editingId.value = m.id;
  draft.value = modelOnlyPolicy({ ...pool.policy, ...(m.policy || {}) });
  formError.value = "";
  dialog.value = "policy";
}
function openScheduling() {
  draft.value = Object.fromEntries(
    schedulingFields.map(([key]) => [key, pool.policy[key]]),
  );
  formError.value = "";
  dialog.value = "scheduling";
}
function openPrices(p, m) {
  priceTarget.value = { providerId: p.id, model: clone(m) };
  formError.value = "";
  dialog.value = "prices";
}
async function savePrices(model) {
  await act(async () => {
    const next = clone(pool.providers),
      provider = next.find((p) => p.id === priceTarget.value.providerId);
    const index = provider?.models.findIndex((m) => m.id === model.id) ?? -1;
    if (index < 0) throw Error("模型已变化，请重新载入");
    provider.models[index] = model;
    await persist(next);
    dialog.value = "";
    priceTarget.value = null;
    toast("当前模型价格已保存，新任务按模型费率执行");
  });
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
    if (dialog.value === "scheduling") {
      const values = Object.fromEntries(
        schedulingFields.map(([key]) => [key, Number(draft.value[key])]),
      );
      for (const [key, label, min, max] of schedulingFields)
        if (
          !Number.isInteger(values[key]) ||
          values[key] < min ||
          values[key] > max
        )
          throw Error(`${label}必须是 ${min}–${max} 之间的整数。`);
      if (values.totalTimeoutMs < values.attemptTimeoutMs)
        throw Error("任务总超时不能小于单次上游超时。");
      const data = await request("/admin/ai/scheduling", "PUT", {
        revision: pool.revision,
        ...values,
      });
      accept(data.pool);
    } else if (dialog.value === "provider") {
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
      if (
        !draft.value.model.trim() ||
        (draft.value.kind !== "image" && !draft.value.features.length)
      )
        throw new Error("请填写模型 ID，并至少选择一种用途。");
      const p = next.find((x) => x.id === providerId.value);
      if (!p) throw new Error("服务商已变化，请刷新后重试。");
      const m = clone(draft.value);
      const i = p.models.findIndex((x) => x.id === editingId.value);
      if (i >= 0) p.models[i] = m;
      else p.models.push(m);
      await persist(next);
    } else if (dialog.value === "policy") {
      const m = next
        .find((p) => p.id === providerId.value)
        ?.models.find((m) => m.id === editingId.value);
      if (!m) throw Error("模型已变化，请重新载入");
      m.policy = {
        ...modelOnlyPolicy({ ...pool.policy, ...(m.policy || {}) }),
        ...Object.fromEntries(
          fields.map(([key]) => [key, Number(draft.value[key])]),
        ),
      };
      await persist(next);
    } else if (dialog.value === "remove") {
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
  testFeature.value = "connection";
  testDetail.value = null;
  testDetailError.value = "";
  formError.value = "";
  dialog.value = "test";
}
watch(
  [() => task.run.value?.id, () => task.run.value?.status],
  async ([id, value]) => {
    testDetail.value = null;
    testDetailError.value = "";
    if (!id || !value || value === "running") return;
    void act(refreshHealth);
    try {
      const detail = await request("/admin/ai/runs/" + id);
      if (task.run.value?.id === id) testDetail.value = detail;
    } catch (e) {
      if (task.run.value?.id === id) testDetailError.value = e.message;
    }
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
    <template v-if="props.section === 'providers'">
      <section class="ai-detail">
        <div class="section-line">
          <div>
            <h2>服务商连接</h2>
            <p class="tiny muted">
              配置接口地址、密钥、协议与并发。模型及价格在“模型管理”配置。
            </p>
          </div>
          <button
            class="btn primary small"
            :disabled="busy || pool.providers.length >= 12"
            @click="openProvider()"
          >
            添加服务商
          </button>
        </div>
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
              关联 {{ p.models.length }} 个模型 · 并发 {{ p.maxConcurrent }} ·
              Key {{ p.hasKey ? "已保存" : "未配置" }}
            </p>
          </div>
          <div class="row wrap">
            <button class="btn small" :disabled="busy" @click="openProvider(p)">
              编辑服务商</button
            ><button class="text-btn" :disabled="busy" @click="askRemove(p)">
              移除
            </button>
          </div>
        </div>
        <p class="tiny muted ai-endpoint">{{ p.baseUrl }}</p>
        <p class="ai-health" :data-state="state(p.id)?.state">
          {{ stateText(p.id) }} {{ state(p.id)?.reason }}
        </p>
        <button
          v-if="state(p.id) && state(p.id).state !== 'healthy'"
          class="text-btn"
          :disabled="busy"
          @click="reset(p.id)"
        >
          恢复服务商
        </button>
      </article>
      <p v-if="!pool.providers.length" class="ai-empty">
        尚未配置服务商。点击“添加服务商”开始。
      </p>
    </template>
    <template v-else-if="props.section === 'models'">
      <section class="ai-detail">
        <div class="section-line">
          <div>
            <h2>模型与定价</h2>
            <p class="tiny muted">
              填写原价与上游优惠倍率，自动计算采购成本；用户价格按资源包和扣费额度换算，图片按张计价。
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
              class="btn small"
              :disabled="busy || !pool.revision"
              @click="openScheduling"
            >
              统一调用设置</button
            ><button
              class="btn primary small"
              :disabled="
                busy ||
                !pool.providers.length ||
                pool.providers.reduce((n, p) => n + p.models.length, 0) >= 64
              "
              @click="openModel()"
            >
              添加模型
            </button>
          </div>
        </div>
        <div v-if="pool.revision" class="ai-config-summary">
          <span
            >统一调用策略 · 最多 {{ pool.policy.maxAttempts }} 次尝试（含首次）
            · 单次 {{ pool.policy.attemptTimeoutMs / 1000 }} 秒 · 总时限
            {{ pool.policy.totalTimeoutMs / 1000 }} 秒</span
          >
          <button class="text-btn" :disabled="busy" @click="openScheduling">
            调整
          </button>
        </div>
        <div class="row wrap ai-model-filters">
          <AppSelect
            v-model="filterProvider"
            label="按服务商筛选模型"
            :options="[{ value: '', label: '全部服务商' }, ...providerOptions]"
          /><AppSelect
            v-model="filterKind"
            label="按模型类型筛选"
            :options="[
              { value: '', label: '全部类型' },
              { value: 'text', label: '文本模型' },
              { value: 'image', label: '图片模型' },
            ]"
          /><AppField
            v-model="search"
            aria-label="搜索模型"
            placeholder="搜索模型或服务商"
          />
        </div>
      </section>
      <article
        v-for="{ provider: p, model: m } in modelRows"
        :key="m.id"
        class="ai-detail ai-model-summary"
      >
        <div class="section-line">
          <div>
            <h2>
              {{ m.model }}
              <span class="badge subtle">{{
                m.kind === "image" ? "图片" : "文本"
              }}</span>
              <span class="tiny muted">{{ m.enabled ? "启用" : "停用" }}</span>
            </h2>
            <p class="tiny muted">
              所属服务商：{{ p.name }}{{ p.enabled ? "" : "（已停用）" }}
              <template v-if="m.kind !== 'image'">
                ·
                {{
                  m.features
                    .map((f) => features.find((x) => x[0] === f)?.[1])
                    .join(" · ")
                }}
                · 优先级 {{ m.priority }} · 权重 {{ m.weight }} · 并发
                {{ m.maxConcurrent }}</template
              >
            </p>
          </div>
          <div class="row wrap">
            <button class="btn small" :disabled="busy" @click="openModel(p, m)">
              编辑模型</button
            ><button
              class="btn small"
              :disabled="busy"
              @click="openPrices(p, m)"
            >
              配置价格</button
            ><button
              v-if="m.kind !== 'image'"
              class="btn small"
              :disabled="busy"
              @click="openPolicy(p, m)"
            >
              调用限制</button
            ><button
              v-if="m.kind !== 'image'"
              class="btn small"
              :disabled="busy || !p.enabled || !m.enabled || task.busy.value"
              @click="test(m)"
            >
              测试</button
            ><button class="text-btn" :disabled="busy" @click="askRemove(p, m)">
              移除
            </button>
          </div>
        </div>
        <div class="ai-model-price-summary">
          <template v-if="m.costDiscount != null && m.pricing"
            ><span><strong>原价</strong> {{ originalText(m) }}</span
            ><span>上游优惠倍率 {{ m.costDiscount }}</span></template
          >
          <span><strong>实际采购成本</strong> {{ priceText(m) }}</span
          ><span v-if="m.kind !== 'image'"
            >扣费额度／千 Token：输入
            {{ (m.policy || pool.policy).inputRate }} / 缓存
            {{ (m.policy || pool.policy).cachedRate }} / 输出
            {{ (m.policy || pool.policy).outputRate }}</span
          ><span v-if="m.kind === 'image'"
            >测算扣费：{{
              m.imageCredits
            }}
            额度／张；当前学习功能仅调用文本模型。</span
          >
        </div>
        <template v-if="m.kind !== 'image'"
          ><p class="ai-health" :data-state="state(m.id)?.state">
            模型：{{ stateText(m.id) }} {{ state(m.id)?.reason }}
          </p>
          <p
            v-if="state(p.id)?.state !== 'healthy'"
            class="ai-health"
            :data-state="state(p.id)?.state"
          >
            服务商：{{ stateText(p.id) }} {{ state(p.id)?.reason }}
          </p>
          <button
            v-if="state(p.id) && state(p.id).state !== 'healthy'"
            class="text-btn"
            :disabled="busy"
            @click="reset(p.id)"
          >
            恢复服务商
          </button>
          <button
            v-if="state(m.id) && state(m.id).state !== 'healthy'"
            class="text-btn"
            :disabled="busy"
            @click="reset(m.id)"
          >
            恢复模型
          </button></template
        >
      </article>
      <p v-if="!modelRows.length" class="ai-empty">
        {{
          pool.providers.length
            ? "没有符合条件的模型，可调整筛选或添加模型。"
            : "请先到“服务商管理”保存连接，再添加模型。"
        }}
      </p>
    </template>
    <AppDialog
      :open="!!dialog && dialog !== 'prices'"
      :title="title"
      :busy="busy"
      @close="close"
    >
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
            >所属服务商<AppSelect
              v-model="providerId"
              label="模型所属服务商"
              :options="providerOptions"
              :disabled="!!editingId"
          /></label>
          <label
            >模型类型<AppSelect
              v-model="draft.kind"
              label="模型类型"
              :options="[
                { value: 'text', label: '文本 · Token 计价' },
                { value: 'image', label: '图片 · 按张计价' },
              ]"
              @change="changeKind"
          /></label>
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
          ><template v-if="draft.kind !== 'image'"
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
          </template>
        </div>
        <button
          type="button"
          class="text-btn"
          :disabled="
            busy || !pool.providers.find((p) => p.id === providerId)?.hasKey
          "
          @click="loadModels(pool.providers.find((p) => p.id === providerId))"
        >
          读取所选服务商模型列表
        </button>
        <p v-if="draft.kind === 'image'" class="info-banner">
          图片模型用于按张定价和资源包测算，当前不接入文本评阅、出题或面试调度。不同尺寸、质量请分别填写规格，固定单价只适用于该规格。
        </p>
        <div
          v-if="draft.kind !== 'image'"
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
        <p class="tiny muted">
          保存模型后，可从模型卡片单独配置价格和调用限制。
        </p>
        <p v-if="editingId" class="tiny muted">
          切换模型类型会清空原类型的价格配置；取消本次编辑会保留原配置。
        </p>
        <button class="btn primary" :disabled="busy">保存模型</button>
      </form>
      <form
        v-if="dialog === 'scheduling'"
        novalidate
        class="ai-admin-form"
        @submit.prevent="save"
      >
        <p class="tiny muted">
          所有模型使用同一套超时和重试规则，仅影响新任务。最多尝试次数包含首次调用；自动切换时每次仍受单次超时限制，整项任务受总时限限制。单模型连接测试只调用目标模型一次。
        </p>
        <div class="ai-admin-grid">
          <label v-for="[key, label, min, max] in schedulingFields" :key="key"
            >{{ label
            }}<AppField
              v-model="draft[key]"
              type="number"
              :min="min"
              :max="max"
          /></label>
        </div>
        <button class="btn primary" :disabled="busy">保存统一调用设置</button>
      </form>
      <form
        v-if="dialog === 'policy'"
        novalidate
        class="ai-admin-form"
        @submit.prevent="save"
      >
        <p class="tiny muted">
          仅配置当前模型的输出上限与调用次数。次数按实际选择该模型的尝试计数，失败尝试也计入；超时与尝试次数在统一调用设置中配置。修改仅影响新任务。
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
        <button class="btn primary" :disabled="busy">保存模型限制</button>
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
        <AppSelect
          v-model="testFeature"
          label="模型测试场景"
          :disabled="task.busy.value"
          :options="[
            { value: 'connection', label: '基础连接 · 返回标准确认结果' },
            { value: 'variants', label: '举一反三 · 生成并校验 1 道题' },
          ]" />
        <p class="tiny muted">
          测试使用该模型已保存的协议、输出模式与 Token
          上限，只调用目标模型一次。出题测试使用系统内置知识点，不改变模型用途，也不保存正式题目。
        </p>
        <div
          v-if="testProvider && state(testProvider.id)?.state !== 'healthy'"
          class="info-banner"
        >
          服务商：{{ stateText(testProvider.id) }} ·
          {{ state(testProvider.id)?.reason }}
          <button
            class="text-btn"
            :disabled="busy || task.busy.value"
            @click="reset(testProvider.id)"
          >
            确认配置已修复，恢复服务商
          </button>
        </div>
        <div
          v-if="
            state(testTarget.id) && state(testTarget.id).state !== 'healthy'
          "
          class="info-banner"
        >
          模型：{{ stateText(testTarget.id) }} ·
          {{ state(testTarget.id)?.reason }}
          <button
            class="text-btn"
            :disabled="busy || task.busy.value"
            @click="reset(testTarget.id)"
          >
            恢复模型后重试
          </button>
        </div>
        <button
          class="btn primary"
          :disabled="task.busy.value"
          @click="
            task.start('/admin/ai/test', {
              targetId: testTarget.id,
              testFeature,
            })
          "
        >
          测试此模型</button
        ><AiTaskProgress
          :run="task.run.value"
          :busy="task.busy.value"
          :connection="task.connection.value" />
        <AdminModelTestResult
          :run="task.run.value"
          :detail="testDetail"
          :detail-error="testDetailError" />
        <AiRunMeta :run="task.run.value"
      /></template>
    </AppDialog>
    <ModelPriceEditor
      :open="dialog === 'prices'"
      :model="priceTarget?.model"
      :legacy-policy="pool.policy"
      :busy="busy"
      :error="formError"
      @close="close"
      @save="savePrices"
    />
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

<style scoped>
.ai-model-filters {
  margin-top: 18px;
  gap: 12px;
}
.ai-model-filters > * {
  flex: 1;
  min-width: 180px;
}
.ai-model-price-summary {
  display: grid;
  gap: 9px;
  font-size: 12px;
  padding: 14px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.ai-model-price-summary span {
  overflow-wrap: anywhere;
}
.ai-model-price-summary strong {
  margin-right: 10px;
}
.ai-model-summary .section-line {
  flex-wrap: wrap;
  gap: 12px;
}
.ai-model-pricing-fields {
  border: 0;
  border-top: 1px solid var(--line);
  padding: 18px 0 0;
  margin: 8px 0 0;
  min-width: 0;
}
.ai-model-pricing-fields legend {
  padding-right: 10px;
  font-size: 14px;
  font-weight: 600;
}
.ai-model-pricing-fields .ai-admin-grid {
  margin-top: 16px;
}
</style>
