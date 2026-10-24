<script setup>
import { reactive, ref, onMounted } from "vue";
import { request, toast } from "../store.js";
import AppField from "./AppField.vue";
import AppSelect from "./AppSelect.vue";
import AppDialog from "./AppDialog.vue";
const dialog = ref("");
const versionProduct = ref(null);
const publishTarget = ref(null);
const rows = ref([]),
  busy = ref(false),
  error = ref(""),
  warnings = ref([]),
  validity = ref("days");
const defaults = () => ({
  id: undefined,
  revision: undefined,
  code: "",
  name: "",
  price: "9.90",
  credits: "500",
  bonus: "0",
  validDays: 180,
  description: "",
  tag: "",
  sort: 0,
  note: "资源包配置",
});
const form = reactive(defaults());
const budgetDraft = reactive({});
function openBudget() {
  Object.assign(budgetDraft, settings);
  error.value = "";
  dialog.value = "budget";
}
const settings = reactive({
  maxTaskPoints: "90",
  dailyBudget: "1000",
  pendingHours: 24,
  revision: undefined,
});
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
  rows.value = (await request("/admin/ai/products")).rows;
}
function edit(p) {
  Object.assign(form, defaults(), p.draft, { id: p.id, revision: p.revision });
  validity.value = p.draft.validDays === null ? "permanent" : "days";
  error.value = "";
  dialog.value = "product";
}
function fresh() {
  for (const key of Object.keys(form)) delete form[key];
  Object.assign(form, defaults());
  validity.value = "days";
  error.value = "";
  dialog.value = "product";
}
async function save() {
  await act(async () => {
    const body = Object.fromEntries(
      Object.keys(defaults()).map((k) => [k, form[k]]),
    );
    body.validDays =
      validity.value === "permanent" ? null : Number(form.validDays);
    body.sort = Number(form.sort);
    const result = await request("/admin/ai/products", "POST", body);
    await load();
    edit(rows.value.find((p) => p.id === result.id));
    dialog.value = "";
    toast("草稿已保存，发布后才影响新发放模板");
  });
}
async function publish(p, state) {
  await act(async () => {
    const result = await request(
      "/admin/ai/products/" + p.id + "/publish",
      "POST",
      { revision: p.revision, publish: state },
    );
    warnings.value = result.warnings || [];
    await load();
    dialog.value = "";
    toast(state ? "新版本已发布，已有批次不变" : "资源包已下架，已有权益不变");
  });
}
async function saveSettings() {
  await act(async () => {
    const data = await request("/admin/ai/billing-settings", "PUT", {
      maxTaskPoints: budgetDraft.maxTaskPoints,
      dailyBudget: budgetDraft.dailyBudget,
      pendingHours: Number(budgetDraft.pendingHours),
      revision: budgetDraft.revision,
    });
    Object.assign(settings, data);
    dialog.value = "";
    toast("调用预算已保存，仅影响新调用");
  });
}
onMounted(
  () =>
    void act(async () => {
      await Promise.all([
        load(),
        (async () =>
          Object.assign(
            settings,
            await request("/admin/ai/billing-settings"),
          ))(),
      ]);
    }),
);
</script>
<template>
  <div class="ai-products-admin">
    <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    <p v-for="warning in warnings" :key="warning" class="info-banner">
      {{ warning }}
    </p>
    <p class="info-banner">
      资源包用于定义额度与有效期，当前由管理员发放，尚未接入在线支付。售价与 AI
      消耗费率独立，保存草稿不会修改已发布版本或已有用户权益。
    </p>
    <div class="section-line">
      <h2>资源包商品 · {{ rows.length }} 档</h2>
      <div class="row wrap">
        <button class="btn small" :disabled="busy" @click="openBudget">
          配置调用预算</button
        ><button class="btn primary small" :disabled="busy" @click="fresh">
          新增资源包
        </button>
      </div>
    </div>
    <p class="tiny muted">
      单次预算 {{ settings.maxTaskPoints }} 额度 · 近 24 小时默认预算
      {{ settings.dailyBudget }} 额度 · 未知用量核对期
      {{ settings.pendingHours }} 小时
    </p>
    <div class="ai-record-list">
      <article v-for="p in rows" :key="p.id" class="ai-record-row">
        <div>
          <strong
            >{{ p.draft.name }}
            <span class="tiny muted">{{
              { draft: "草稿", published: "已上架", archived: "已下架" }[
                p.status
              ]
            }}</span></strong
          ><span class="tiny muted"
            >{{ p.code }} ·
            {{ p.published ? "已发布 v" + p.published.version : "尚未发布" }} ·
            草稿 ¥{{ p.draft.price }} / {{ p.draft.credits }} +
            {{ p.draft.bonus }} 额度 ·
            {{
              p.draft.validDays === null ? "永久" : p.draft.validDays + " 天"
            }}</span
          >
        </div>
        <div class="row wrap">
          <button
            v-if="p.published"
            class="text-btn"
            :disabled="busy"
            @click="
              versionProduct = p;
              dialog = 'versions';
            "
          >
            查看版本
          </button>
          <button class="btn small" :disabled="busy" @click="edit(p)">
            编辑草稿</button
          ><button
            class="btn small"
            :disabled="busy"
            @click="
              publishTarget = p;
              dialog = 'publish';
              error = '';
            "
          >
            发布已保存草稿</button
          ><button
            v-if="p.status === 'published'"
            class="text-btn"
            :disabled="busy"
            @click="publish(p, false)"
          >
            下架
          </button>
        </div>
      </article>
    </div>
    <AppDialog
      :open="dialog === 'product'"
      :title="form.id ? '编辑资源包草稿' : '新增资源包'"
      :busy="busy"
      @close="dialog = ''"
    >
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
      <form class="ai-admin-form" novalidate @submit.prevent="save">
        <div class="ai-admin-grid">
          <label
            >商品名称<AppField
              v-model="form.name"
              maxlength="80"
              required /></label
          ><label
            >商品编码 · 创建后固定<AppField
              v-model="form.code"
              maxlength="40"
              :disabled="!!form.id"
              placeholder="例如 starter"
              pattern="[a-z0-9_-]+"
              required
          /></label>
          <label
            >人民币售价<AppField
              v-model="form.price"
              inputmode="decimal"
              required /></label
          ><label
            >基础额度<AppField
              v-model="form.credits"
              inputmode="decimal"
              required /></label
          ><label
            >附赠额度<AppField
              v-model="form.bonus"
              inputmode="decimal"
              required
          /></label>
          <label
            >资源包有效期<AppSelect
              v-model="validity"
              label="资源包有效期"
              :options="[
                { value: 'days', label: '发放后指定天数' },
                { value: 'permanent', label: '永久有效' },
              ]" /></label
          ><label v-if="validity === 'days'"
            >有效天数<AppField
              v-model="form.validDays"
              type="number"
              min="1"
              max="3650"
              required
          /></label>
          <label>展示标签<AppField v-model="form.tag" maxlength="30" /></label
          ><label
            >排序 · 小数值优先<AppField
              v-model="form.sort"
              type="number"
              min="0"
              max="10000" /></label
          ><label class="ai-wide"
            >商品说明<AppField
              v-model="form.description"
              multiline
              maxlength="500" /></label
          ><label class="ai-wide"
            >版本修改说明<AppField
              v-model="form.note"
              minlength="3"
              maxlength="300"
              required
          /></label>
        </div>
        <button class="btn primary small" :disabled="busy">
          保存资源包草稿
        </button>
      </form>
    </AppDialog>
    <AppDialog
      :open="dialog === 'versions'"
      title="资源包发布版本"
      @close="dialog = ''"
    >
      <p class="tiny muted">
        已发放批次继续使用当时快照，新草稿不影响已有权益。
      </p>
      <pre class="ai-json">{{
        JSON.stringify(versionProduct?.versions, null, 2)
      }}</pre>
    </AppDialog>
    <AppDialog
      :open="dialog === 'publish'"
      title="发布资源包草稿"
      :busy="busy"
      @close="dialog = ''"
    >
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
      <p v-if="publishTarget">
        发布“{{ publishTarget.draft.name }}”的新版本：¥{{
          publishTarget.draft.price
        }}
        / {{ publishTarget.draft.credits }} +
        {{ publishTarget.draft.bonus }} 额度？已有批次保持原权益。
      </p>
      <button
        class="btn primary"
        :disabled="busy"
        @click="publish(publishTarget, true)"
      >
        确认发布已保存草稿
      </button>
    </AppDialog>
    <AppDialog
      :open="dialog === 'budget'"
      title="AI 调用预算"
      :busy="busy"
      @close="dialog = ''"
    >
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
      <form class="ai-admin-form" novalidate @submit.prevent="saveSettings">
        <p class="tiny muted">
          免费、失败和免扣调用同样受预算限制。任务按保守输入估算及最大输出预占；已有任务使用启动时的规则。
        </p>
        <div class="ai-admin-grid">
          <label
            >单次任务额度预算上限<AppField
              v-model="budgetDraft.maxTaskPoints"
              inputmode="decimal"
              required /></label
          ><label
            >每用户近 24 小时默认预算<AppField
              v-model="budgetDraft.dailyBudget"
              inputmode="decimal"
              required /></label
          ><label
            >未知用量核对期限（小时）<AppField
              v-model="budgetDraft.pendingHours"
              type="number"
              min="1"
              max="48"
              required
          /></label>
        </div>
        <button class="btn primary small" :disabled="busy">保存调用预算</button>
      </form>
    </AppDialog>
  </div>
</template>
