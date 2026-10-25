<script setup>
import { computed, onMounted, ref } from "vue";
import { request, toast, dateLabel } from "../store.js";
import AppDialog from "./AppDialog.vue";
import AppField from "./AppField.vue";
import AppSelect from "./AppSelect.vue";
import AppChoice from "./AppChoice.vue";
import AppDisclosure from "./AppDisclosure.vue";
import Icon from "./Icon.vue";
import {
  PRICING_SIMULATION_DEFAULTS,
  normalizePricingSimulation,
  calculatePricingSimulation,
  formatPricingNumber,
} from "../../../shared/pricing-simulation.mjs";

const plan = ref({ ...PRICING_SIMULATION_DEFAULTS }),
  draft = ref({});
const products = ref([]),
  liveRates = ref(null),
  revision = ref(null),
  updatedAt = ref(null);
const examplePlan = ref(null),
  modelOptions = ref([]),
  selectedModel = ref("");
const isImage = computed(() => plan.value.kind === "image");
const priceUnit = computed(() => (isImage.value ? "元／张" : "元／百万 Token"));
const savedPlan = ref(""),
  busy = ref(false),
  ready = ref(false),
  error = ref(""),
  formError = ref("");
const dialog = ref(""),
  source = ref("published"),
  basis = ref("sample"),
  detailId = ref(null);
const fmt = formatPricingNumber;
const money = (value, digits = 4) => {
  if (value === null || value === undefined) return "—";
  const text = fmt(value, digits);
  if (text.startsWith("<")) return "<¥" + text.slice(1);
  if (text.startsWith(">−")) return ">−¥" + text.slice(2);
  if (text.startsWith("−")) return "−¥" + text.slice(1);
  return "¥" + text;
};
const percent = (value) =>
  value === null || value === undefined ? "—" : fmt(value, 2) + "%";
const multiplier = (view) =>
  view.zeroCost
    ? costName.value + "为 0"
    : fmt(view.costMultiple, 2) + " 倍" + costName.value;
const costName = computed(() =>
  Number(plan.value.extraCostPercent) ? "测算成本" : "采购成本",
);
const dirty = computed(() => JSON.stringify(plan.value) !== savedPlan.value);
const scope = computed(() =>
  isImage.value
    ? "图片样例用量"
    : {
        sample: "样例用量",
        input: "每百万普通输入",
        output: "每百万输出",
        cached: "每百万缓存输入",
      }[basis.value],
);
const effective = computed(() => {
  const x = { ...plan.value };
  if (!isImage.value && basis.value !== "sample") {
    x.inputTokens = basis.value === "output" ? "0" : "1000000";
    x.cachedTokens = basis.value === "cached" ? "1000000" : "0";
    x.outputTokens = basis.value === "output" ? "1000000" : "0";
  }
  return x;
});
const packages = computed(() =>
  products.value
    .filter(
      (p) =>
        source.value === "draft" || (p.status === "published" && p.published),
    )
    .map((p) => ({
      ...(source.value === "draft" ? p.draft : p.published),
      id: p.id,
    }))
    .filter((p) => p.name),
);
const result = computed(() => {
  try {
    return calculatePricingSimulation(effective.value, packages.value);
  } catch (e) {
    return { error: e.message, rows: [] };
  }
});
const detail = computed(() =>
  result.value.rows.find((p) => p.id === detailId.value),
);
const goodRows = computed(() => result.value.rows.filter((p) => !p.error));
const lossCount = computed(
  () => goodRows.value.filter((p) => p.hasLoss).length,
);
const fields = computed(() =>
  isImage.value
    ? [["image", "图片"]]
    : [
        ["input", "普通输入"],
        ...(plan.value.useCache ? [["cached", "缓存输入"]] : []),
        ["output", "输出"],
      ],
);
const unconfiguredRates = computed(() =>
  fields.value.some(
    ([key]) =>
      String(plan.value[key + "Rate"]) !==
      String(liveRates.value?.[key + "Rate"]),
  ),
);
const formalCompatible = computed(() =>
  ["inputRate", "cachedRate", "outputRate"].every((key) => {
    const rate = Number(plan.value[key]);
    return rate > 0 && rate <= 1000;
  }),
);

async function act(fn) {
  if (busy.value) return;
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
  await act(async () => {
    const [data, rows] = await Promise.all([
      request("/admin/ai/pricing-simulation"),
      request("/admin/ai/products"),
    ]);
    plan.value = normalizePricingSimulation(data.plan);
    savedPlan.value = JSON.stringify(plan.value);
    revision.value = data.revision;
    updatedAt.value = data.updatedAt;
    liveRates.value = data.liveRates;
    examplePlan.value = data.examplePlan;
    modelOptions.value = data.models || [];
    products.value = rows.rows;
    ready.value = true;
    dialog.value = "";
    if (isImage.value || (!plan.value.useCache && basis.value === "cached"))
      basis.value = "sample";
  });
}
async function save() {
  await act(async () => {
    const data = await request("/admin/ai/pricing-simulation", "PUT", {
      revision: revision.value,
      plan: plan.value,
    });
    revision.value = data.revision;
    updatedAt.value = data.updatedAt;
    liveRates.value = data.liveRates;
    savedPlan.value = JSON.stringify(plan.value);
    toast("测算方案已保存，正式费率未变化");
  });
}
function edit() {
  selectedModel.value = "";
  draft.value = { ...plan.value, cachedPrice: plan.value.cachedPrice ?? "" };
  formError.value = "";
  dialog.value = "parameters";
}
function apply() {
  try {
    plan.value = normalizePricingSimulation(draft.value);
    if (isImage.value || (!plan.value.useCache && basis.value === "cached"))
      basis.value = "sample";
    dialog.value = "";
    formError.value = "";
  } catch (e) {
    formError.value = e.message;
  }
}
function example() {
  draft.value = {
    ...examplePlan.value,
    cachedPrice: examplePlan.value.cachedPrice ?? "",
  };
  formError.value = "";
}
function importModel() {
  const m = modelOptions.value.find((x) => x.id === selectedModel.value);
  if (!m) return;
  const image = m.kind === "image";
  const hasCost = image ? m.imageProcurement != null : !!m.procurement;
  Object.assign(draft.value, {
    kind: m.kind,
    modelName: m.providerName + " · " + m.model,
    costDiscount: "1",
    directCosts: true,
    useCache: !image,
  });
  if (image)
    Object.assign(draft.value, {
      imagePrice: "0",
      imageCost: m.imageProcurement ?? "",
      imageRate: m.imageCredits,
    });
  else
    for (const k of ["input", "cached", "output"]) {
      draft.value[k + "Price"] = "0";
      draft.value[k + "Cost"] = m.procurement?.[k] ?? "";
    }
  if (!image && m.rates) Object.assign(draft.value, m.rates);
  formError.value = hasCost
    ? ""
    : "已载入模型扣费额度。该模型未配置实际采购成本，请填写后再测算毛利。";
}
function importRates() {
  const selected = modelOptions.value.find((m) => m.id === selectedModel.value);
  if (selected?.kind === "image") draft.value.imageRate = selected.imageCredits;
  else if (selected?.rates) Object.assign(draft.value, selected.rates);
  formError.value = "";
}
function reload() {
  if (dirty.value) dialog.value = "reload";
  else void load();
}
function costLabel() {
  return Number(plan.value.extraCostPercent)
    ? "含额外成本的估算"
    : "仅模型采购成本";
}
onMounted(load);
</script>

<template>
  <section class="pricing-workbench" :aria-busy="busy">
    <div class="pricing-heading">
      <div>
        <div class="eyebrow">PRICE → CREDIT → MARGIN</div>
        <h2>把额度换成真实价格。</h2>
        <p class="muted">
          用同一份成本和费率，比较每档资源包。所有金额均为人民币。
        </p>
      </div>
      <div class="row wrap">
        <button class="btn small" :disabled="busy" @click="reload">
          重新载入
        </button>
        <button class="btn small" :disabled="busy || !ready" @click="edit">
          <Icon name="SlidersHorizontal" :size="15" />编辑测算参数
        </button>
        <button
          class="btn primary small"
          :disabled="busy || !ready || !!result.error || (!dirty && !!revision)"
          @click="save"
        >
          保存测算方案
        </button>
      </div>
    </div>
    <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    <p v-if="!ready && !error" class="muted" role="status">
      正在读取测算方案和资源包…
    </p>
    <template v-if="ready">
      <div class="pricing-plan-line">
        <strong>{{ plan.modelName }}</strong
        ><span class="badge subtle">{{
          dirty ? "有未保存修改" : revision ? "方案已保存" : "初始示例"
        }}</span
        ><span class="tiny muted">{{
          updatedAt
            ? (dirty ? "上次保存于 " : "保存于 ") + dateLabel(updatedAt)
            : dirty
              ? "本页方案尚未保存。"
              : "初始成本采用截图示例，可选择模型载入其实际采购成本及费率。"
        }}</span>
      </div>
      <div class="pricing-cost-strip">
        <article v-for="[key, label] in fields" :key="key">
          <span class="tiny muted"
            >{{ label }}采购成本／{{ isImage ? "张" : "百万 Token" }}</span
          >
          <div>
            <strong>{{ money(result.channels?.[key]?.baseCost) }}</strong
            ><span v-if="plan.directCosts">已配置实际采购成本</span
            ><span v-else
              >＝ {{ money(plan[key + "Price"]) }} ×
              {{ fmt(plan.costDiscount, 6) }}</span
            >
          </div>
        </article>
        <article>
          <span class="tiny muted">{{
            isImage ? "客户每张图片消耗额度" : "客户每千 Token 消耗额度"
          }}</span>
          <div class="pricing-rates">
            <span v-for="[key, label] in fields" :key="key"
              >{{ label }}
              <strong>{{ fmt(plan[key + "Rate"], 6) }}</strong></span
            >
          </div>
        </article>
      </div>
      <div class="pricing-use-note">
        <Icon name="BadgeInfo" :size="18" />
        <p>
          此页用于定价测算。保存方案仅供管理员下次继续比较，不会修改资源包、模型采购价、正式扣费或用户额度。{{
            isImage
              ? "图片额度仅用于本页测算。"
              : unconfiguredRates
                ? "请在模型卡片保存正式费率，本页只作比较。"
                : "正式扣费由各模型自己的费率决定。"
          }}
        </p>
      </div>
      <p v-if="!isImage && !formalCompatible" class="info-banner" role="status">
        当前方案含零费率或超出模型配置范围的费率。正式模型费率须大于 0 且不超过
        1000 额度／千 Token，支持最多六位小数。
      </p>
      <p v-if="isImage" class="info-banner">
        图片按所选规格的固定单张价格测算；当前学习功能尚未接入图片生成，保存此方案不启用图片调用。
      </p>
      <p v-if="result.error" class="ai-error" role="alert">
        {{ result.error }}
      </p>
      <template v-else>
        <div class="pricing-controls">
          <AppSelect
            v-model="source"
            label="资源包价格版本"
            :options="[
              { value: 'published', label: '当前上架的已发布版本' },
              { value: 'draft', label: '全部资源包草稿（含下架）' },
            ]"
          />
          <AppSelect
            v-if="!isImage"
            v-model="basis"
            label="毛利测算用量"
            :options="[
              { value: 'sample', label: '按样例输入输出比例' },
              { value: 'input', label: '按纯普通输入测算' },
              { value: 'output', label: '按纯输出测算' },
              ...(plan.useCache
                ? [{ value: 'cached', label: '按纯缓存输入测算' }]
                : []),
            ]"
          />
          <span class="tiny muted"
            >{{ result.rows.length }} 档 · 含赠送额度</span
          >
        </div>
        <div class="pricing-sample-banner">
          <div>
            <strong>{{ scope }}</strong>
            <p class="tiny muted">
              <template v-if="isImage"
                >{{ fmt(effective.imageCount, 0) }} 张图片</template
              ><template v-else
                >总输入 {{ fmt(effective.inputTokens, 0)
                }}<template v-if="plan.useCache"
                  >，其中缓存 {{ fmt(effective.cachedTokens, 0) }}</template
                >
                · 输出 {{ fmt(effective.outputTokens, 0) }} Token</template
              >
            </p>
          </div>
          <div>
            <span class="tiny muted">本组消耗</span
            ><strong>{{ fmt(result.sample.points, 6) }} 额度</strong>
          </div>
          <div>
            <span class="tiny muted">本组模型成本</span
            ><strong>{{ money(result.sample.cost, 6) }}</strong
            ><span v-if="Number(plan.extraCostPercent)" class="tiny muted"
              >包含 {{ fmt(plan.extraCostPercent, 2) }}% 额外模型成本</span
            >
          </div>
        </div>
        <p v-if="lossCount" class="pricing-loss-note" role="status">
          {{ lossCount }}
          档资源包在至少一种用量下低于{{ costName }}。{{
            isImage
              ? "请检查每张图片的扣费额度和成本。"
              : "请查看纯输入、纯输出或缓存视角。"
          }}负毛利保留显示。
        </p>
        <p class="tiny muted pricing-table-caption">
          用户单价单位：{{ priceUnit }}。整包毛利按“{{
            scope
          }}”的比例、全部额度用完测算，{{
            costLabel()
          }}，不计用户额度过期收益，不代表净利润。
        </p>
        <div
          v-if="result.rows.length"
          class="pricing-table-scroll"
          tabindex="0"
          role="region"
          aria-label="资源包定价测算对比表"
        >
          <table class="pricing-table">
            <thead>
              <tr>
                <th scope="col">资源包</th>
                <th scope="col">用户实际单价／{{ isImage ? "张" : "百万" }}</th>
                <th scope="col">用户价与{{ costName }}</th>
                <th scope="col">整包理论用量</th>
                <th scope="col">本组用量的收费与毛利</th>
                <th scope="col">整包用完的毛利</th>
                <th scope="col">明细</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in result.rows"
                :key="row.id"
                :class="{ 'pricing-row-loss': row.hasLoss }"
              >
                <td data-label="资源包">
                  <strong>{{ row.name }}</strong
                  ><template v-if="!row.error"
                    ><span
                      >{{ money(row.price, 2) }} /
                      {{ fmt(row.totalCredits, 6) }} 额度</span
                    ><small v-if="Number(row.bonus)"
                      >已计入赠送 {{ fmt(row.bonus, 6) }} 额度</small
                    ><small
                      >{{
                        source === "draft" ? "草稿" : "已发布 v" + row.version
                      }}
                      ·
                      {{
                        row.validDays === null ? "永久" : row.validDays + " 天"
                      }}</small
                    ></template
                  >
                </td>
                <td v-if="row.error" colspan="6">
                  <p class="ai-error">{{ row.error }}</p>
                </td>
                <template v-else>
                  <td
                    :data-label="'用户实际单价／' + (isImage ? '张' : '百万')"
                  >
                    <div
                      v-for="[key, label] in fields"
                      :key="key"
                      class="pricing-cell-channel"
                    >
                      <span
                        >{{ label }}
                        <strong>{{
                          money(row.channels[key].revenue, 4)
                        }}</strong></span
                      ><small v-if="!plan.directCosts">{{
                        row.channels[key].originalPercent === null
                          ? "上游原价为 0，无法比较"
                          : "相对上游原价 " +
                            percent(row.channels[key].originalPercent)
                      }}</small>
                    </div>
                  </td>
                  <td :data-label="'用户价与' + costName">
                    <div
                      v-for="[key, label] in fields"
                      :key="key"
                      class="pricing-cell-channel"
                    >
                      <span
                        :class="{
                          'pricing-negative':
                            row.channels[key].state === 'loss',
                        }"
                        >{{ label }} {{ multiplier(row.channels[key]) }}</span
                      >
                    </div>
                    <small v-if="row.hasLoss" class="pricing-negative"
                      >部分用量存在亏损</small
                    >
                  </td>
                  <td data-label="整包理论用量">
                    <div
                      v-for="[key, label] in fields"
                      :key="key"
                      class="pricing-quota-line"
                    >
                      <small
                        >{{ label }}单独换算：{{
                          row.channels[key].capacity === null
                            ? "零扣费，余额不限制此项"
                            : fmt(row.channels[key].capacity, 0) +
                              (isImage ? " 张" : " Token")
                        }}</small
                      >
                    </div>
                    <small v-if="!isImage">各项分别使用全部额度，不相加</small>
                  </td>
                  <td data-label="本组用量的收费与毛利">
                    <span
                      >收费
                      <strong>{{ money(row.sample.revenue, 6) }}</strong></span
                    ><span
                      :class="{
                        'pricing-negative': row.sample.state === 'loss',
                      }"
                      >毛利 {{ money(row.sample.profit, 6) }}</span
                    ><small>{{
                      row.sample.hasRevenue
                        ? "毛利率 " + percent(row.sample.marginPercent)
                        : "无收入，毛利率不适用"
                    }}</small>
                  </td>
                  <td data-label="整包用完的毛利">
                    <template v-if="row.fullPack"
                      ><strong
                        :class="{
                          'pricing-negative': row.fullPack.state === 'loss',
                        }"
                        >{{ money(row.fullPack.profit, 2) }}</strong
                      ><span>模型成本 {{ money(row.fullPack.cost, 2) }}</span
                      ><small>{{
                        row.fullPack.hasRevenue
                          ? "毛利率 " + percent(row.fullPack.marginPercent)
                          : "无收入，毛利率不适用"
                      }}</small
                      ><small
                        >约
                        {{ fmt(row.fullPack.estimatedRuns, 2) }}
                        组同等用量</small
                      ></template
                    ><span v-else>扣费为 0，无法推算整包次数和成本</span>
                  </td>
                  <td data-label="明细">
                    <button
                      class="text-btn"
                      :aria-label="'查看' + row.name + '测算明细'"
                      @click="
                        detailId = row.id;
                        dialog = 'detail';
                      "
                    >
                      查看计算<Icon name="ArrowUpRight" :size="14" />
                    </button>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ai-empty">
          当前没有{{
            source === "published" ? "已上架的已发布" : "可测算的草稿"
          }}资源包，可切换版本范围或先到“资源包与预算”配置。
        </div>
        <AppDisclosure title="计算口径与边界"
          ><div class="pricing-formulas">
            <p>每额度价格＝资源包人民币售价 ÷（基础额度＋赠送额度）。</p>
            <p>
              整包单项理论 Token 数＝总额度 ÷ 该项每千 Token 扣费额度 ×
              1000，向下取整。
              普通输入、缓存、输出分别假设全部额度只用于该项，不能相加。多次小额调用的取整可能减少可用
              Token。
            </p>
            <p>
              用户每张图片价格＝每张扣费额度 × 每额度价格；整包图片数＝总额度 ÷
              每张扣费额度，向下取整。规格、质量不同应分别测算。
            </p>
            <p>
              用户每百万 Token 单价＝每千 Token 扣费额度 × 1000 × 每额度价格。
            </p>
            <p>
              按折扣模式：采购成本＝原价 ×
              采购倍率；实际成本模式直接使用填写成本，不重复打折。额外模型成本按该成本同比例增加。0.15
              表示付原价的 15%，即 1.5 折。
            </p>
            <p>
              本组毛利＝本组收费－模型成本；毛利率＝毛利 ÷
              收费。零收入不计算毛利率，零成本不显示无穷倍数。
            </p>
            <p>
              总输入已包含缓存命中 Token，普通输入只计算扣除缓存后的部分。输出
              Token 应包含服务商计入输出用量的推理 Token，不再另外累加。
            </p>
            <p>
              整包成本与毛利依赖选定的输入输出比例；纯输入、纯输出可能不同。按同等用量折算的次数为理论值，不保证最后剩余额度恰好支持一次完整调用。
            </p>
            <p>
              额度计算与正式账本一样，每次只向上取整到百万分之一额度；其他运算使用精确分数，显示时再四舍五入。未扣服务器、支付手续费、税费等费用。
            </p>
            <p>
              上游原价仅用于采购折扣测算，不是另一套客户售价。用户人民币单价由资源包与模型扣费额度唯一确定。
            </p>
          </div></AppDisclosure
        >
      </template>
    </template>
    <AppDialog
      :open="dialog === 'parameters'"
      title="编辑定价测算参数"
      description="所有单价均为人民币。这里填写的是测算方案，不会改变正式扣费。"
      :width="840"
      @close="dialog = ''"
    >
      <form novalidate class="pricing-parameter-form" @submit.prevent="apply">
        <p v-if="formError" class="ai-error" role="alert">{{ formError }}</p>
        <div class="pricing-preset-row">
          <button type="button" class="btn small" @click="example">
            填入截图与建议费率示例</button
          ><button
            type="button"
            class="text-btn"
            :disabled="!selectedModel"
            @click="importRates"
          >
            载入所选模型费率
          </button>
        </div>
        <div class="pricing-model-import">
          <AppSelect
            v-model="selectedModel"
            label="载入已配置模型成本与费率"
            :options="[
              { value: '', label: '选择模型，或手动填写' },
              ...modelOptions.map((m) => ({
                value: m.id,
                label:
                  m.providerName +
                  ' · ' +
                  m.model +
                  (m.kind === 'image' ? ' · 图片' : ' · 文本'),
              })),
            ]"
          /><button
            type="button"
            class="btn small"
            :disabled="!selectedModel"
            @click="importModel"
          >
            载入模型成本与费率
          </button>
        </div>
        <label class="pricing-full-label"
          >计价类型<AppSelect
            v-model="draft.kind"
            label="测算计价类型"
            :options="[
              { value: 'text', label: '文本 · Token 计价' },
              { value: 'image', label: '图片 · 按张计价' },
            ]"
        /></label>
        <label class="pricing-full-label"
          >方案名称<AppField v-model="draft.modelName" maxlength="80"
        /></label>
        <fieldset>
          <legend>采购成本</legend>
          <AppChoice v-model="draft.directCosts"
            >直接填写折扣后实际采购成本</AppChoice
          >
          <div class="ai-admin-grid">
            <template v-if="!draft.directCosts && draft.kind !== 'image'"
              ><label
                >普通输入上游原价 · 元／百万 Token<AppField
                  v-model="draft.inputPrice"
                  inputmode="decimal"
                  maxlength="20" /></label
              ><label
                >输出上游原价 · 元／百万 Token<AppField
                  v-model="draft.outputPrice"
                  inputmode="decimal"
                  maxlength="20" /></label
            ></template>
            <label v-else-if="!draft.directCosts"
              >图片上游原价 · 元／张<AppField
                v-model="draft.imagePrice"
                inputmode="decimal"
                maxlength="20"
            /></label>
            <label v-if="!draft.directCosts"
              >采购倍率 · 0.15 表示支付原价的 15%<AppField
                v-model="draft.costDiscount"
                inputmode="decimal"
                maxlength="10"
            /></label>
            <label
              >额外模型成本 · %<AppField
                v-model="draft.extraCostPercent"
                inputmode="decimal"
                maxlength="12"
              /><small class="muted"
                >例如 20 表示成本再增加 20%，用于模拟失败重试；默认 0。</small
              ></label
            >
          </div>
          <template v-if="draft.kind !== 'image'"
            ><AppChoice v-model="draft.useCache">单独测算缓存输入</AppChoice
            ><label
              v-if="draft.useCache && !draft.directCosts"
              class="pricing-full-label"
              >缓存输入上游原价 · 元／百万 Token<AppField
                v-model="draft.cachedPrice"
                inputmode="decimal"
                maxlength="20" /></label
          ></template>
          <div v-if="draft.directCosts" class="ai-admin-grid">
            <template v-if="draft.kind !== 'image'"
              ><label
                >普通输入实际成本 · 元／百万 Token<AppField
                  v-model="draft.inputCost"
                  inputmode="decimal" /></label
              ><label v-if="draft.useCache"
                >缓存实际成本 · 元／百万 Token<AppField
                  v-model="draft.cachedCost"
                  inputmode="decimal" /></label
              ><label
                >输出实际成本 · 元／百万 Token<AppField
                  v-model="draft.outputCost"
                  inputmode="decimal" /></label></template
            ><label v-else
              >图片实际成本 · 元／张<AppField
                v-model="draft.imageCost"
                inputmode="decimal"
            /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>扣客户的额度</legend>
          <div class="ai-admin-grid">
            <label v-if="draft.kind === 'image'"
              >每张图片扣费额度<AppField
                v-model="draft.imageRate"
                inputmode="decimal"
                maxlength="20" /></label
            ><template v-else>
              <label
                >每千普通输入 Token 额度<AppField
                  v-model="draft.inputRate"
                  inputmode="decimal"
                  maxlength="20"
              /></label>
              <label
                >每千输出 Token 额度<AppField
                  v-model="draft.outputRate"
                  inputmode="decimal"
                  maxlength="20"
              /></label>
              <label v-if="draft.useCache"
                >每千缓存输入 Token 额度<AppField
                  v-model="draft.cachedRate"
                  inputmode="decimal"
                  maxlength="20"
              /></label>
            </template>
          </div>
          <p class="tiny muted">
            支持最多六位小数，例如
            0.125、0.75。扣费额度不是人民币，也不是采购折扣。
          </p>
        </fieldset>
        <fieldset>
          <legend>一组典型用量</legend>
          <div class="ai-admin-grid">
            <label v-if="draft.kind === 'image'"
              >图片数量<AppField
                v-model="draft.imageCount"
                inputmode="numeric"
                maxlength="5" /></label
            ><template v-else>
              <label
                >总输入 Token · 已含缓存<AppField
                  v-model="draft.inputTokens"
                  inputmode="numeric"
                  maxlength="9"
              /></label>
              <label
                >输出 Token<AppField
                  v-model="draft.outputTokens"
                  inputmode="numeric"
                  maxlength="9"
              /></label>
              <label v-if="draft.useCache"
                >其中缓存命中 Token<AppField
                  v-model="draft.cachedTokens"
                  inputmode="numeric"
                  maxlength="9"
              /></label>
            </template>
          </div>
        </fieldset>
        <div class="row wrap">
          <button type="button" class="btn" @click="dialog = ''">取消</button
          ><button class="btn primary">更新测算结果</button>
        </div>
      </form>
    </AppDialog>
    <AppDialog
      :open="dialog === 'reload'"
      title="重新载入测算方案"
      :busy="busy"
      @close="dialog = ''"
    >
      <p>重新读取后端保存的方案与资源包，会替换本页尚未保存的测算参数。</p>
      <div class="row wrap">
        <button class="btn" :disabled="busy" @click="dialog = ''">
          继续编辑</button
        ><button class="btn primary" :disabled="busy" @click="load">
          确认重新载入
        </button>
      </div>
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    </AppDialog>
    <AppDialog
      :open="dialog === 'detail'"
      :title="(detail?.name || '资源包') + ' · 测算明细'"
      :width="800"
      @close="dialog = ''"
    >
      <template v-if="detail && !detail.error"
        ><p>
          {{ money(detail.price, 2) }} ÷
          {{ fmt(detail.totalCredits, 6) }} 额度＝每额度
          {{ money(detail.unitPrice, 8) }}；已计入赠送额度。
        </p>
        <div
          v-for="[key, label] in fields"
          :key="key"
          class="pricing-detail-channel"
        >
          <h3>{{ label }} · {{ isImage ? "每张图片" : "每百万 Token" }}</h3>
          <dl>
            <div v-if="!plan.directCosts">
              <dt>上游原价</dt>
              <dd>{{ money(result.channels[key].original) }}</dd>
            </div>
            <div>
              <dt>
                {{ plan.directCosts ? "已配置实际采购成本" : "折扣后采购成本" }}
              </dt>
              <dd>{{ money(result.channels[key].baseCost, 6) }}</dd>
            </div>
            <div v-if="Number(plan.extraCostPercent)">
              <dt>加入额外成本后</dt>
              <dd>{{ money(result.channels[key].cost, 6) }}</dd>
            </div>
            <div>
              <dt>用户实际支付</dt>
              <dd>{{ money(detail.channels[key].revenue, 6) }}</dd>
            </div>
            <div v-if="!plan.directCosts">
              <dt>用户价／上游原价</dt>
              <dd>{{ percent(detail.channels[key].originalPercent) }}</dd>
            </div>
            <div>
              <dt>用户价／{{ costName }}</dt>
              <dd>{{ multiplier(detail.channels[key]) }}</dd>
            </div>
            <div>
              <dt>该用量的毛利率</dt>
              <dd>
                {{
                  detail.channels[key].hasRevenue
                    ? percent(detail.channels[key].marginPercent)
                    : "无收入，毛利率不适用"
                }}
              </dd>
            </div>
            <div>
              <dt>{{ isImage ? "每张图片" : "每千 Token" }}保本额度（约）</dt>
              <dd>
                {{
                  detail.channels[key].breakEvenRate === null
                    ? "资源包免费，无法反推"
                    : fmt(detail.channels[key].breakEvenRate, 6) + " 额度"
                }}
              </dd>
            </div>
          </dl>
        </div>
        <p class="tiny muted">
          保本仅覆盖当前测算中的模型成本，不含其他运营费用。
        </p>
      </template>
    </AppDialog>
  </section>
</template>

<style scoped>
.pricing-workbench {
  min-width: 0;
}
.pricing-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin: 22px 0;
}
.pricing-heading h2 {
  font-size: 25px;
  letter-spacing: -0.6px;
  margin: 6px 0;
}
.pricing-heading p {
  margin: 0;
  font-size: 12px;
}
.pricing-plan-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.pricing-cost-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid #d5e1da;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.pricing-cost-strip article {
  padding: 18px 20px;
  border-right: 1px solid #e5eae7;
  min-width: 0;
}
.pricing-cost-strip article:last-child {
  border-right: 0;
}
.pricing-cost-strip article > div {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-top: 6px;
}
.pricing-cost-strip article > div > strong {
  font-size: 25px;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
  color: #176b58;
}
.pricing-cost-strip article > div > span {
  font-size: 11px;
  color: #65786d;
  overflow-wrap: anywhere;
}
.pricing-cost-strip:has(article:nth-child(4)) {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.pricing-rates span {
  white-space: nowrap;
}
.pricing-rates strong {
  font-size: 16px;
  color: #253b34;
}
.pricing-use-note {
  display: flex;
  gap: 10px;
  color: #547060;
  margin: 16px 0 24px;
}
.pricing-use-note svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.pricing-use-note p {
  font-size: 12px;
  margin: 0;
}
.pricing-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.pricing-controls :deep(.app-select) {
  min-width: 220px;
}
.pricing-sample-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 18px 36px;
  align-items: center;
  padding: 16px 20px;
  border: 1px solid #d9e5dd;
  border-radius: 10px;
  background: #eaf2ec;
}
.pricing-sample-banner > div {
  display: flex;
  flex-direction: column;
}
.pricing-sample-banner p {
  margin: 4px 0 0;
}
.pricing-sample-banner strong {
  font-variant-numeric: tabular-nums;
}
.pricing-loss-note {
  background: #fff0e9;
  border: 1px solid #eac3b4;
  border-radius: 8px;
  color: #98462c;
  padding: 12px 16px;
  font-size: 12px;
}
.pricing-table-caption {
  margin: 16px 0 10px;
  line-height: 1.8;
}
.pricing-table-scroll {
  overflow: auto;
  border: 1px solid #d6e0d9;
  border-radius: 10px;
  margin-bottom: 20px;
  background: #fff;
}
.pricing-table-scroll:focus-visible {
  outline: 2px solid #176b58;
  outline-offset: 3px;
}
.pricing-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1130px;
  font-size: 12px;
}
.pricing-table th {
  text-align: left;
  padding: 13px 14px;
  background: #eaf0ec;
  color: #536c5e;
  font-size: 11px;
  font-weight: 600;
  border-right: 1px solid #d6e0d9;
}
.pricing-table td {
  padding: 15px 14px;
  border-top: 1px solid #dce5de;
  border-right: 1px solid #e5eae7;
  vertical-align: top;
  line-height: 1.9;
  font-variant-numeric: tabular-nums;
}
.pricing-table td:last-child,
.pricing-table th:last-child {
  border-right: 0;
}
.pricing-table td > span,
.pricing-table td > small,
.pricing-table td > strong {
  display: block;
}
.pricing-table small {
  font-size: 10px;
  color: #728278;
  display: block;
}
.pricing-table td:first-child > strong {
  font-size: 13px;
}
.pricing-table tr:nth-child(even) {
  background: #fafcfb;
}
.pricing-table .pricing-row-loss {
  background: #fff7f2;
}
.pricing-cell-channel + .pricing-cell-channel {
  margin-top: 7px;
}
.pricing-negative {
  color: #aa432c !important;
}
.pricing-table .text-btn {
  white-space: nowrap;
  font-size: 11px;
}
.pricing-formulas {
  color: #65786d;
  font-size: 12px;
}
.pricing-preset-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.pricing-full-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  margin: 16px 0;
}
.pricing-parameter-form fieldset {
  border: 0;
  border-top: 1px solid #e5eae7;
  padding: 18px 0 0;
  margin: 22px 0;
  min-width: 0;
}
.pricing-parameter-form legend {
  font-weight: 600;
  padding: 0 12px 0 0;
  font-size: 14px;
}
.pricing-parameter-form .ai-admin-grid > label {
  color: #536b5c;
}
.pricing-parameter-form small {
  font-size: 11px;
  line-height: 1.7;
}
.pricing-detail-channel {
  padding: 16px 0;
  border-top: 1px solid #e5eae7;
}
.pricing-detail-channel h3 {
  margin: 0 0 12px;
}
.pricing-detail-channel dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 18px;
  margin: 0;
}
.pricing-detail-channel dl > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}
.pricing-detail-channel dt {
  color: #65786d;
}
.pricing-detail-channel dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
@media (max-width: 1100px) {
  .pricing-cost-strip,
  .pricing-cost-strip:has(article:nth-child(4)) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pricing-cost-strip article {
    border-bottom: 1px solid #e5eae7;
  }
}
@media (max-width: 700px) {
  .pricing-heading h2 {
    font-size: 22px;
  }
  .pricing-heading .row {
    gap: 8px;
  }
  .pricing-cost-strip article {
    padding: 14px;
  }
  .pricing-cost-strip article > div > strong {
    font-size: 22px;
  }
  .pricing-controls :deep(.app-select) {
    width: 100%;
    min-width: 0;
  }
  .pricing-controls {
    gap: 8px;
  }
  .pricing-sample-banner {
    padding: 14px;
    gap: 14px 24px;
  }
  .pricing-table-scroll {
    border: 0;
    border-radius: 0;
    overflow: visible;
    background: transparent;
  }
  .pricing-table {
    display: block;
    min-width: 0;
  }
  .pricing-table thead {
    position: absolute;
    clip-path: inset(50%);
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  .pricing-table tbody {
    display: grid;
    gap: 14px;
  }
  .pricing-table tr {
    display: block;
    border: 1px solid #d6e0d9;
    border-radius: 10px;
    background: #fff;
    padding: 6px 14px;
    overflow: hidden;
  }
  .pricing-table td {
    display: block;
    padding: 10px 0;
    border-right: 0;
    border-top: 1px solid #e5eae7;
  }
  .pricing-table td:first-child {
    border: 0;
    padding-top: 12px;
  }
  .pricing-table td[data-label]:not(:first-child)::before {
    content: attr(data-label);
    display: block;
    font-size: 10px;
    color: #7e8c86;
    margin-bottom: 5px;
  }
  .pricing-table td:first-child > strong {
    font-size: 16px;
  }
  .pricing-table td:first-child > span {
    font-size: 12px;
  }
  .pricing-cell-channel {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }
  .pricing-cell-channel + .pricing-cell-channel {
    margin-top: 4px;
  }
  .pricing-table td:last-child {
    padding: 8px 0;
  }
  .pricing-table td:last-child::before {
    display: none !important;
  }
  .pricing-detail-channel dl {
    grid-template-columns: 1fr;
  }
}
</style>

<style scoped>
.pricing-model-import {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin: 16px 0;
}
.pricing-model-import :deep(.app-select) {
  min-width: 0;
  flex: 1;
}
.pricing-quota-line {
  margin-top: 6px;
}
@media (max-width: 700px) {
  .pricing-model-import {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
