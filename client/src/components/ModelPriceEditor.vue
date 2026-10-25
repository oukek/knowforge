<script setup>
import { computed, ref, watch, useId } from "vue";
import { request } from "../store.js";
import AppDialog from "./AppDialog.vue";
import AppField from "./AppField.vue";
import AppChoice from "./AppChoice.vue";
import ModelPricePreview from "./ModelPricePreview.vue";
import {
  derivedProcurement,
  discountedPrice,
} from "../../../shared/model-cost.mjs";
import {
  PRICING_SIMULATION_DEFAULTS as defaults,
  normalizePackPricing,
} from "../../../shared/pricing-simulation.mjs";
const props = defineProps({
  open: Boolean,
  model: Object,
  legacyPolicy: Object,
  busy: Boolean,
  error: String,
});
const emit = defineEmits(["close", "save"]);
const formId = useId(),
  localError = ref(""),
  loading = ref(false),
  loadError = ref(""),
  products = ref([]),
  pane = ref("edit");
const draft = ref({}),
  costEnabled = ref(false),
  original = ref({}),
  costDiscount = ref("1");
let generation = 0;
const image = computed(() => draft.value.kind === "image");
const legacyCost = computed(
  () =>
    props.model?.costDiscount == null &&
    (image.value
      ? props.model?.imageProcurement != null
      : !!props.model?.procurement),
);
const channels = [
  ["input", "普通输入"],
  ["cached", "缓存输入"],
  ["output", "输出"],
];
const plan = computed(() => ({
  ...defaults,
  kind: draft.value.kind || "text",
  modelName: draft.value.model || "当前模型",
  directCosts: !costEnabled.value,
  useCache: !image.value,
  inputPrice: costEnabled.value ? original.value.input : "0",
  cachedPrice: costEnabled.value ? original.value.cached : "0",
  outputPrice: costEnabled.value ? original.value.output : "0",
  imagePrice: costEnabled.value ? original.value.perImage : "0",
  costDiscount: costEnabled.value ? costDiscount.value : "1",
  inputCost: legacyCost.value ? (props.model.procurement?.input ?? "0") : "0",
  cachedCost: legacyCost.value ? (props.model.procurement?.cached ?? "0") : "0",
  outputCost: legacyCost.value ? (props.model.procurement?.output ?? "0") : "0",
  imageCost: legacyCost.value ? (props.model.imageProcurement ?? "0") : "0",
  imageRate: draft.value.imageCredits || "",
  inputRate: draft.value.policy?.inputRate ?? "",
  cachedRate: draft.value.policy?.cachedRate ?? "",
  outputRate: draft.value.policy?.outputRate ?? "",
}));
const validation = computed(() => {
  try {
    const normalized = normalizePackPricing(plan.value);
    if (image.value) {
      if (Number(normalized.imageRate) <= 0)
        throw Error("每张图片扣费额度必须大于 0");
    } else
      for (const key of ["inputRate", "cachedRate", "outputRate"])
        if (Number(normalized[key]) <= 0 || Number(normalized[key]) > 1000)
          throw Error("每千 Token 扣费须大于 0 且不超过 1000，最多六位小数");
    return { normalized };
  } catch (e) {
    return { error: e.message };
  }
});
const netCosts = computed(() => {
  if (!costEnabled.value || validation.value.error) return [];
  const p = validation.value.normalized;
  return (image.value ? [["image", "每张图片"]] : channels).map(
    ([key, label]) => ({
      label,
      value: discountedPrice(p[key + "Price"], p.costDiscount),
    }),
  );
});
const legacyCostText = computed(() =>
  image.value
    ? `¥${props.model?.imageProcurement}／张`
    : channels
        .map(([key, label]) => `${label} ${props.model?.procurement?.[key]}`)
        .join(" / ") + " 元／百万 Token",
);
async function loadProducts() {
  const current = ++generation;
  loading.value = true;
  loadError.value = "";
  try {
    const data = await request("/admin/ai/products");
    if (current === generation) products.value = data.rows;
  } catch (e) {
    if (current === generation) loadError.value = e.message;
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(
  () => props.open,
  (open) => {
    if (!open) {
      generation++;
      return;
    }
    const model = JSON.parse(JSON.stringify(props.model));
    draft.value = {
      ...model,
      policy: { ...props.legacyPolicy, ...(model.policy || {}) },
    };
    costEnabled.value = model.costDiscount != null && !!model.pricing;
    costDiscount.value = costEnabled.value ? model.costDiscount : "1";
    original.value = {
      input: "",
      cached: "",
      output: "",
      perImage: "",
      specification: model.pricing?.specification || "",
      ...(costEnabled.value ? model.pricing : {}),
    };
    pane.value = "edit";
    localError.value = "";
    products.value = [];
    void loadProducts();
  },
  { immediate: true },
);
function save() {
  localError.value = validation.value.error || "";
  if (localError.value || props.busy || loading.value || loadError.value)
    return;
  const p = validation.value.normalized,
    model = JSON.parse(JSON.stringify(draft.value));
  if (costEnabled.value) {
    model.costDiscount = p.costDiscount;
    model.pricing = image.value
      ? {
          unit: "image",
          perImage: p.imagePrice,
          specification: original.value.specification.trim(),
        }
      : {
          unit: "token",
          input: p.inputPrice,
          cached: p.cachedPrice,
          output: p.outputPrice,
        };
    Object.assign(model, derivedProcurement(model));
  } else if (!legacyCost.value) {
    model.pricing = null;
    model.costDiscount = null;
    model.procurement = null;
    model.imageProcurement = null;
  }
  if (image.value) model.imageCredits = p.imageRate;
  else
    for (const key of ["inputRate", "cachedRate", "outputRate"])
      model.policy[key] = p[key];
  emit("save", model);
}
</script>
<template>
  <AppDialog
    :open="open"
    :title="(model?.model || '模型') + ' · 配置价格'"
    description="填写原价和上游优惠倍率，自动计算采购成本；结合扣费额度与资源包价格，比较用户实际收费和优惠。"
    :busy="busy"
    :width="1320"
    @close="emit('close')"
  >
    <p v-if="error || localError" class="ai-error" role="alert">
      {{ error || localError }}
    </p>
    <p v-if="loadError" class="ai-error" role="alert">
      资源包读取失败：{{ loadError }}
      <button class="text-btn" type="button" @click="loadProducts">
        重新读取
      </button>
    </p>
    <div class="price-mobile-tabs" role="group" aria-label="价格配置与实时预览">
      <button
        type="button"
        :class="{ active: pane === 'edit' }"
        :aria-pressed="pane === 'edit'"
        @click="pane = 'edit'"
      >
        参数配置</button
      ><button
        type="button"
        :class="{ active: pane === 'preview' }"
        :aria-pressed="pane === 'preview'"
        @click="pane = 'preview'"
      >
        实时预览
      </button>
    </div>
    <p
      v-if="validation.error && pane === 'preview'"
      class="info-banner"
      role="status"
    >
      {{ validation.error }}
    </p>
    <div class="model-price-columns">
      <form
        :id="formId"
        class="model-price-form price-pane"
        :class="{ 'price-mobile-hidden': pane !== 'edit' }"
        novalidate
        @submit.prevent="save"
      >
        <fieldset :disabled="busy">
          <legend>
            原价与采购成本 · {{ image ? "元／张" : "元／百万 Token" }}
          </legend>
          <AppChoice v-model="costEnabled">配置原价与上游优惠倍率</AppChoice>
          <div v-if="costEnabled" class="price-input-grid">
            <template v-if="!image"
              ><label v-for="[key, label] in channels" :key="key"
                >{{ label }}原价<AppField
                  v-model="original[key]"
                  inputmode="decimal"
                  maxlength="20" /></label></template
            ><template v-else
              ><label
                >每张图片原价（元）<AppField
                  v-model="original.perImage"
                  inputmode="decimal"
                  maxlength="20" /></label
              ><label
                >适用图片规格<AppField
                  v-model="original.specification"
                  maxlength="120"
                  placeholder="例如 1024 × 1024，标准质量" /></label
            ></template>
            <label
              >上游优惠倍率<AppField
                v-model="costDiscount"
                inputmode="decimal"
                maxlength="10"
            /></label>
          </div>
          <p v-if="costEnabled" class="tiny muted">
            倍率默认 1；0.15 表示采购成本＝原价 × 0.15，即支付原价的
            15%。此倍率仅影响采购成本。
          </p>
          <div v-if="netCosts.length" class="price-net-costs" role="status">
            <strong>实际采购成本</strong
            ><span v-for="item in netCosts" :key="item.label"
              >{{ item.label }}：¥{{ item.value }}／{{
                image ? "张" : "百万 Token"
              }}</span
            >
          </div>
          <p v-if="legacyCost && !costEnabled" class="info-banner">
            现有折后成本：{{
              legacyCostText
            }}。旧数据无法可靠推断原价与倍率，补填后可比较优惠；未补填时保留现有成本。
          </p>
          <p class="tiny muted">
            原价用于计算同等用量本应支付的费用；用户实收价由资源包和扣费额度换算。未配置原价时不比较优惠；未记录成本时不计算毛利。
          </p>
        </fieldset>
        <fieldset :disabled="busy">
          <legend>扣客户的额度 · {{ image ? "每张" : "每千 Token" }}</legend>
          <div class="price-input-grid">
            <template v-if="!image"
              ><label v-for="[key, label] in channels" :key="key"
                >{{ label }}扣费额度<AppField
                  v-model="draft.policy[key + 'Rate']"
                  inputmode="decimal"
                  maxlength="20" /></label></template
            ><label v-else
              >每张图片扣费额度<AppField
                v-model="draft.imageCredits"
                inputmode="decimal"
                maxlength="20"
            /></label>
          </div>
          <p class="tiny muted">
            最多六位小数。{{
              image
                ? "图片当前用于定价管理与测算。"
                : "保存后作为此模型的正式费率；技术失败不扣用户额度。"
            }}
          </p>
        </fieldset>
        <p v-if="validation.error" class="info-banner" role="status">
          {{ validation.error }}
        </p>
      </form>
      <div
        class="price-preview-pane price-pane"
        :class="{ 'price-mobile-hidden': pane !== 'preview' }"
      >
        <p v-if="loading" class="muted" role="status">正在读取资源包…</p>
        <ModelPricePreview
          v-else
          :plan="plan"
          :products="products"
          :has-cost="costEnabled || legacyCost"
          :has-original="costEnabled"
        />
      </div>
    </div>
    <template #footer
      ><button class="btn" :disabled="busy" @click="emit('close')">取消</button
      ><button
        class="btn primary"
        :form="formId"
        type="submit"
        :disabled="busy || loading || !!loadError || !!validation.error"
      >
        保存当前模型价格
      </button></template
    >
  </AppDialog>
</template>
<style scoped>
.model-price-columns {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 24px;
  min-width: 0;
}
.price-pane {
  min-width: 0;
  max-height: 65dvh;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0 10px 4px 0;
}
.price-preview-pane {
  border-left: 1px solid var(--line);
  padding-left: 24px;
}
.model-price-form fieldset {
  border: 0;
  border-top: 1px solid var(--line);
  padding: 16px 0 0;
  margin: 0 0 24px;
  min-width: 0;
}
.model-price-form legend {
  font-size: 14px;
  font-weight: 600;
  padding-right: 10px;
}
.price-input-grid {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
.price-input-grid label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: #536b5c;
  font-size: 12px;
}
.price-mobile-tabs {
  display: none;
}
.price-net-costs {
  display: grid;
  gap: 6px;
  padding: 12px;
  margin-top: 12px;
  border-radius: 8px;
  background: #eaf2ec;
  color: #176b58;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.model-price-form .tiny {
  line-height: 1.8;
}
@media (max-width: 950px) {
  .model-price-columns {
    display: block;
  }
  .price-pane {
    max-height: none;
    overflow: visible;
    padding: 0;
  }
  .price-preview-pane {
    border: 0;
  }
  .price-mobile-tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 20px;
  }
  .price-mobile-tabs button {
    flex: 1;
    padding: 10px;
    border-bottom: 2px solid transparent;
    font-size: 13px;
  }
  .price-mobile-tabs .active {
    border-color: #176b58;
    color: #176b58;
    font-weight: 600;
  }
  .price-mobile-hidden {
    display: none;
  }
  .price-input-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 500px) {
  .price-input-grid {
    grid-template-columns: 1fr;
  }
}
</style>
