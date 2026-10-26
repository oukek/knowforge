<script setup>
import { computed, onMounted, ref } from "vue";
import { request, toast, dateLabel } from "../store.js";
import AppDialog from "./AppDialog.vue";
import AppField from "./AppField.vue";
import AppSelect from "./AppSelect.vue";
import AppChoice from "./AppChoice.vue";
import AppDisclosure from "./AppDisclosure.vue";
import Icon from "./Icon.vue";
import UsageMixControls from "./UsageMixControls.vue";
import PackUsageBreakdown from "./PackUsageBreakdown.vue";
import {
  PRICING_SIMULATION_DEFAULTS,
  normalizePackPricing,
  calculateBlendedPackPricing,
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
const savedPlan = ref(""),
  busy = ref(false),
  ready = ref(false),
  error = ref(""),
  formError = ref("");
const dialog = ref(""),
  source = ref("published"),
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
const costName = computed(() =>
  Number(plan.value.extraCostPercent) ? "测算成本" : "采购成本",
);
const dirty = computed(() => JSON.stringify(plan.value) !== savedPlan.value);
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
    return calculateBlendedPackPricing(plan.value, packages.value);
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
    plan.value = normalizePackPricing(data.plan);
    savedPlan.value = JSON.stringify(plan.value);
    revision.value = data.revision;
    updatedAt.value = data.updatedAt;
    liveRates.value = data.liveRates;
    examplePlan.value = data.examplePlan;
    modelOptions.value = data.models || [];
    products.value = rows.rows;
    ready.value = true;
    dialog.value = "";
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
    plan.value = normalizePackPricing(draft.value);
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
  const hasOriginal = m.costDiscount != null && !!m.pricing;
  Object.assign(draft.value, {
    kind: m.kind,
    modelName: m.providerName + " · " + m.model,
    costDiscount: hasOriginal ? m.costDiscount : "1",
    directCosts: !hasOriginal,
    useCache: !image,
    usageMix: { ...PRICING_SIMULATION_DEFAULTS.usageMix, ...m.usageMix },
  });
  if (image)
    Object.assign(draft.value, {
      imagePrice: hasOriginal ? m.pricing.perImage : "0",
      imageCost: m.imageProcurement ?? "",
      imageRate: m.imageCredits,
    });
  else
    for (const k of ["input", "cached", "output"]) {
      draft.value[k + "Price"] = hasOriginal ? m.pricing[k] : "0";
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
              : "可选择模型载入其原价、上游优惠倍率与扣费额度；初始倍率为 1。"
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
          <span class="tiny muted"
            >{{ result.rows.length }} 档 · 含赠送额度</span
          >
        </div>
        <p class="info-banner">
          {{
            isImage
              ? "按当前规格计算可用整张图片。"
              : `按总输入∶输出＝${plan.usageMix.inputRatio}∶${plan.usageMix.outputRatio}、输入缓存命中率 ${plan.usageMix.cacheHitPercent}% 加权估算。`
          }}实际任务仍按真实用量结算。
        </p>
        <p v-if="lossCount" class="pricing-loss-note" role="status">
          {{ lossCount }} 档资源包的综合实收低于{{
            costName
          }}，请查看对应项的成本与毛利。
        </p>
        <PackUsageBreakdown
          v-for="row in result.rows"
          :key="row.id"
          :row="row"
          :image="isImage"
          :has-original="!plan.directCosts"
          :cost-label="costName"
        >
          <template #actions
            ><button
              v-if="!row.error"
              class="text-btn"
              :aria-label="'查看' + row.name + '测算明细'"
              @click="
                detailId = row.id;
                dialog = 'detail';
              "
            >
              查看计算<Icon name="ArrowUpRight" :size="14" /></button
          ></template>
        </PackUsageBreakdown>
        <div v-if="!result.rows.length" class="ai-empty">
          当前范围暂无资源包，可切换版本或先到“资源包与预算”配置。
        </div>
        <AppDisclosure title="计算口径与边界"
          ><div class="pricing-formulas">
            <p>每额度价格＝资源包人民币售价 ÷（基础额度＋赠送额度）。</p>
            <p>
              先根据总输入∶输出比例与缓存命中率，计算普通输入、缓存、输出的
              Token 占比；再按各自每千 Token 扣费加权，换算整包预计可用
              Token。缓存属于总输入，不能重复计入总量。
            </p>
            <p>
              综合原价＝普通输入预计数量 × 普通输入原价＋缓存预计数量 ×
              缓存原价＋输出预计数量 × 输出原价，Token
              价格按每百万换算。实收＝资源包售价；优惠率＝（综合原价－实收）÷
              综合原价。采购成本使用同一组数量计算。
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
              综合毛利＝资源包实收－预计总采购成本；毛利率＝毛利 ÷
              收费。零收入不计算毛利率，零成本不显示无穷倍数。
            </p>
            <p>
              普通输入与缓存输入分别列出。实际调用时，缓存是总输入的子集，不重复收费；推理
              Token 若已计入输出，也不再累加。
            </p>
            <p>
              成本与毛利按每项实际可用的整数
              Token／整张图片分别计算；剩余额度不计入已用数量，毛利不包含其他运营费用。
            </p>
            <p>
              额度计算与正式账本一样，每次只向上取整到百万分之一额度；其他运算使用精确分数，显示时再四舍五入。未扣服务器、支付手续费、税费等费用。
            </p>
            <p>
              原价表示同等用量在未优惠时本应支付的费用；实际采购成本＝原价 ×
              上游优惠倍率。
              倍率只影响采购成本，不改变用户优惠率。用量比例是可调整的估算假设，不是用户的真实用量或扣费标准。
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
            label="载入已配置模型原价与费率"
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
            载入模型原价与费率
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
          <legend>原价与采购成本</legend>
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
              >上游优惠倍率 · 默认 1，0.15 表示支付原价的 15%<AppField
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
        <UsageMixControls
          v-if="draft.kind !== 'image'"
          v-model="draft.usageMix"
          :cache-enabled="draft.useCache"
        />
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
        <p v-if="!isImage" class="info-banner">
          总输入∶输出＝{{ plan.usageMix.inputRatio }}∶{{
            plan.usageMix.outputRatio
          }}，缓存命中率
          {{ plan.usageMix.cacheHitPercent }}%。缓存是输入子集，不额外增加总
          Token。
        </p>
        <PackUsageBreakdown
          :row="detail"
          :image="isImage"
          :has-original="!plan.directCosts"
          :cost-label="costName"
        />
        <p class="tiny muted">
          原价和采购成本均按预计普通输入、缓存输入和输出数量加总，再与资源包实收比较。此处是估算，不影响用户真实扣费。
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
.pricing-loss-note {
  background: #fff0e9;
  border: 1px solid #eac3b4;
  border-radius: 8px;
  color: #98462c;
  padding: 12px 16px;
  font-size: 12px;
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
@media (max-width: 700px) {
  .pricing-model-import {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
