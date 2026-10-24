<script setup>
import { computed, ref, watch, useId } from "vue";
import { request } from "../store.js";
import AppDialog from "./AppDialog.vue";
import AppField from "./AppField.vue";
import AppChoice from "./AppChoice.vue";
import ModelPricePreview from "./ModelPricePreview.vue";
import {
  PRICING_SIMULATION_DEFAULTS as defaults,
  normalizePricingSimulation,
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
  listEnabled = ref(false),
  costEnabled = ref(false),
  list = ref({}),
  cost = ref({}),
  usage = ref({});
let generation = 0;
const image = computed(() => draft.value.kind === "image");
const channels = [
  ["input", "普通输入"],
  ["cached", "缓存输入"],
  ["output", "输出"],
];
const plan = computed(() => ({
  ...defaults,
  kind: draft.value.kind || "text",
  modelName: draft.value.model || "当前模型",
  directCosts: true,
  useCache: !image.value,
  inputPrice: listEnabled.value ? list.value.input : "0",
  cachedPrice: listEnabled.value ? list.value.cached : "0",
  outputPrice: listEnabled.value ? list.value.output : "0",
  inputCost: costEnabled.value ? cost.value.input : "0",
  cachedCost: costEnabled.value ? cost.value.cached : "0",
  outputCost: costEnabled.value ? cost.value.output : "0",
  imagePrice: listEnabled.value ? list.value.perImage : "0",
  imageCost: costEnabled.value ? cost.value.perImage : "0",
  imageRate: draft.value.imageCredits || "",
  inputRate: draft.value.policy?.inputRate ?? "",
  cachedRate: draft.value.policy?.cachedRate ?? "",
  outputRate: draft.value.policy?.outputRate ?? "",
  ...usage.value,
}));
const validation = computed(() => {
  try {
    const normalized = normalizePricingSimulation(plan.value);
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
    listEnabled.value = !!model.pricing;
    costEnabled.value =
      model.kind === "image"
        ? model.imageProcurement !== null &&
          model.imageProcurement !== undefined
        : !!model.procurement;
    list.value = {
      input: "",
      cached: "",
      output: "",
      perImage: "",
      specification: "",
      ...model.pricing,
    };
    cost.value = {
      input: "",
      cached: "",
      output: "",
      perImage: "",
      ...model.procurement,
      ...(model.imageProcurement !== null &&
      model.imageProcurement !== undefined
        ? { perImage: model.imageProcurement }
        : {}),
    };
    usage.value = {
      inputTokens: "8000",
      cachedTokens: "0",
      outputTokens: "2000",
      imageCount: "1",
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
  model.pricing = !listEnabled.value
    ? null
    : image.value
      ? {
          unit: "image",
          perImage: p.imagePrice,
          specification: (list.value.specification || "").trim(),
        }
      : {
          unit: "token",
          input: p.inputPrice,
          cached: p.cachedPrice,
          output: p.outputPrice,
        };
  model.procurement =
    costEnabled.value && !image.value
      ? { input: p.inputCost, cached: p.cachedCost, output: p.outputCost }
      : null;
  model.imageProcurement =
    costEnabled.value && image.value ? p.imageCost : null;
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
    description="人民币标价、实际采购成本与扣费额度分别配置。实时预览随输入更新，保存后只影响当前模型的新任务。"
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
          <legend>模型标价 · {{ image ? "元／张" : "元／百万 Token" }}</legend>
          <AppChoice v-model="listEnabled">配置人民币标价</AppChoice>
          <div v-if="listEnabled" class="price-input-grid">
            <template v-if="!image"
              ><label v-for="[key, label] in channels" :key="key"
                >{{ label }}标价<AppField
                  v-model="list[key]"
                  inputmode="decimal"
                  maxlength="20" /></label></template
            ><template v-else
              ><label
                >每张图片标价（元）<AppField
                  v-model="list.perImage"
                  inputmode="decimal"
                  maxlength="20" /></label
              ><label
                >适用图片规格<AppField
                  v-model="list.specification"
                  maxlength="120"
                  placeholder="例如 1024 × 1024，标准质量" /></label
            ></template>
          </div>
          <p class="tiny muted">
            用于和用户实际单价比较、反推充值应得额度。手填标价不自动代表官方报价。
          </p>
        </fieldset>
        <fieldset :disabled="busy">
          <legend>
            实际采购成本 · {{ image ? "元／张" : "元／百万 Token" }}
          </legend>
          <AppChoice v-model="costEnabled">配置折扣后实际成本</AppChoice>
          <div v-if="costEnabled" class="price-input-grid">
            <template v-if="!image"
              ><label v-for="[key, label] in channels" :key="key"
                >{{ label }}实际成本<AppField
                  v-model="cost[key]"
                  inputmode="decimal"
                  maxlength="20" /></label></template
            ><label v-else
              >每张图片实际成本（元）<AppField
                v-model="cost.perImage"
                inputmode="decimal"
                maxlength="20"
            /></label>
          </div>
          <p class="tiny muted">
            填写实际采购金额，不再重复乘折扣。未配置成本时，预览不计算毛利。
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
        <fieldset :disabled="busy">
          <legend>预览样例 · 不随模型价格保存</legend>
          <div class="price-input-grid">
            <template v-if="!image"
              ><label
                >总输入 Token<AppField
                  v-model="usage.inputTokens"
                  inputmode="numeric" /></label
              ><label
                >其中缓存 Token<AppField
                  v-model="usage.cachedTokens"
                  inputmode="numeric" /></label
              ><label
                >输出 Token<AppField
                  v-model="usage.outputTokens"
                  inputmode="numeric" /></label></template
            ><label v-else
              >图片数量<AppField v-model="usage.imageCount" inputmode="numeric"
            /></label>
          </div>
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
          :has-cost="costEnabled"
          :has-list-price="listEnabled"
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
