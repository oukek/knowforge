// Admin-only planning arithmetic. Fractions keep product discounts and bonuses
// exact; only presentation is rounded. This module never settles real charges.
const SCALE = 1000000n;
const fraction = (n, d = 1n) => ({ n, d });
const add = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => fraction(a.n * b.n, a.d * b.d);
const div = (a, b) => (b.n === 0n ? null : fraction(a.n * b.d, a.d * b.n));
const zero = fraction(0n);
const one = fraction(1n);
const hundred = fraction(100n);
const thousand = fraction(1000n);
const sign = (v) => (v.n < 0n ? "loss" : v.n > 0n ? "profit" : "even");

export function formatPricingNumber(value, digits = 4, group = true) {
  if (value === null || value === undefined) return "—";
  const text = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return "—";
  const negative = text.startsWith("-");
  const [whole, dec = ""] = text.replace(/^-/, "").split(".");
  const base = 10n ** BigInt(digits);
  let units =
    BigInt(whole) * base +
    BigInt((dec + "0".repeat(digits)).slice(0, digits) || "0");
  if (Number(dec[digits] || 0) >= 5) units++;
  if (units === 0n && /[1-9]/.test(text))
    return (
      (negative ? ">−" : "<") +
      (digits ? "0." + "0".repeat(digits - 1) + "1" : "1")
    );
  const integer = String(units / base);
  const tail = digits
    ? String(units % base)
        .padStart(digits, "0")
        .replace(/0+$/, "")
    : "";
  return (
    (negative && units ? "−" : "") +
    (group ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : integer) +
    (tail ? "." + tail : "")
  );
}
function decimal(v, digits = 18) {
  if (v === null) return null;
  const negative = v.n < 0n;
  const n = negative ? -v.n : v.n;
  const base = 10n ** BigInt(digits);
  const units = (n * base + v.d / 2n) / v.d;
  const tail = String(units % base)
    .padStart(digits, "0")
    .replace(/0+$/, "");
  return (
    (negative && units ? "-" : "") +
    String(units / base) +
    (tail ? "." + tail : "")
  );
}
function parseDecimal(value, label, max = 1000000n) {
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error(`${label}须为数字`);
  const text = String(value ?? "").trim();
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(text))
    throw new Error(`${label}须为非负数，最多六位小数`);
  const [whole, dec = ""] = text.split(".");
  const scaled = BigInt(whole) * SCALE + BigInt(dec.padEnd(6, "0"));
  if (scaled > max * SCALE) throw new Error(`${label}不能超过 ${max}`);
  return fraction(scaled, SCALE);
}
function parseTokens(value, label) {
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error(`${label}须为数字`);
  const text = String(value ?? "").trim();
  if (!/^\d{1,9}$/.test(text) || BigInt(text) > 100000000n)
    throw new Error(`${label}须为 0～100000000 的整数`);
  return String(BigInt(text));
}
export const PRICING_SIMULATION_DEFAULTS = Object.freeze({
  modelName: "未命名测算方案",
  inputPrice: "0",
  cachedPrice: null,
  outputPrice: "0",
  costDiscount: "1",
  inputRate: "1",
  cachedRate: "1",
  outputRate: "3",
  inputTokens: "8000",
  cachedTokens: "0",
  outputTokens: "2000",
  useCache: false,
  extraCostPercent: "0",
});
export function normalizePricingSimulation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("测算参数格式错误");
  const keys = Object.keys(PRICING_SIMULATION_DEFAULTS);
  if (Object.keys(input).some((key) => !keys.includes(key)))
    throw new Error("测算参数包含未知字段");
  const x = { ...PRICING_SIMULATION_DEFAULTS, ...input };
  if (
    typeof x.modelName !== "string" ||
    !x.modelName.trim() ||
    x.modelName.trim().length > 80
  )
    throw new Error("方案名称须为 1～80 个字符");
  x.modelName = x.modelName.trim();
  if (typeof x.useCache !== "boolean") throw new Error("缓存开关格式错误");
  for (const [key, label, max] of [
    ["inputPrice", "输入原价"],
    ["outputPrice", "输出原价"],
    ["costDiscount", "采购倍率", 1n],
    ["inputRate", "输入扣费额度"],
    ["cachedRate", "缓存扣费额度"],
    ["outputRate", "输出扣费额度"],
    ["extraCostPercent", "额外模型成本比例", 1000n],
  ])
    x[key] = decimal(parseDecimal(x[key], label, max), 6);
  x.cachedPrice = x.useCache
    ? decimal(parseDecimal(x.cachedPrice, "缓存原价"), 6)
    : null;
  x.inputTokens = parseTokens(x.inputTokens, "输入 Token");
  x.outputTokens = parseTokens(x.outputTokens, "输出 Token");
  x.cachedTokens = x.useCache
    ? parseTokens(x.cachedTokens, "缓存命中 Token")
    : "0";
  if (BigInt(x.cachedTokens) > BigInt(x.inputTokens))
    throw new Error("缓存命中 Token 不能超过总输入 Token");
  if (BigInt(x.inputTokens) + BigInt(x.outputTokens) === 0n)
    throw new Error("样例输入和输出不能同时为 0");
  return x;
}
const ratio = (a, b) => decimal(div(a, b));
function metrics(revenue, cost, original) {
  const profit = sub(revenue, cost);
  const margin = div(profit, revenue);
  return {
    revenue: decimal(revenue),
    cost: decimal(cost),
    profit: decimal(profit),
    marginPercent: margin ? decimal(mul(margin, hundred)) : null,
    hasRevenue: revenue.n > 0n,
    originalPercent: original.n
      ? decimal(mul(div(revenue, original), hundred))
      : null,
    costMultiple: ratio(revenue, cost),
    zeroCost: cost.n === 0n,
    state: sign(profit),
  };
}
export function calculatePricingSimulation(input, products) {
  const x = normalizePricingSimulation(input);
  const discount = parseDecimal(x.costDiscount, "采购倍率", 1n);
  const overhead = add(
    one,
    div(parseDecimal(x.extraCostPercent, "额外成本比例", 1000n), hundred),
  );
  const channels = ["input", ...(x.useCache ? ["cached"] : []), "output"].map(
    (key) => {
      const original = parseDecimal(x[key + "Price"], "原价");
      const cost = mul(original, discount);
      return {
        key,
        original,
        baseCost: cost,
        cost: mul(cost, overhead),
        rate: parseDecimal(x[key + "Rate"], "客户扣费"),
      };
    },
  );
  const tokens = {
    input: BigInt(x.inputTokens) - BigInt(x.cachedTokens),
    cached: BigInt(x.cachedTokens),
    output: BigInt(x.outputTokens),
  };
  let original = zero,
    baseCost = zero,
    cost = zero,
    spent = zero;
  for (const channel of channels) {
    const volume = fraction(tokens[channel.key], SCALE);
    original = add(original, mul(volume, channel.original));
    baseCost = add(baseCost, mul(volume, channel.baseCost));
    cost = add(cost, mul(volume, channel.cost));
    spent = add(spent, mul(fraction(tokens[channel.key], 1000n), channel.rate));
  }
  // Match the real ledger: one rounding up to a microcredit per logical call.
  const spentMicro = (spent.n * SCALE + spent.d - 1n) / spent.d;
  spent = fraction(spentMicro, SCALE);
  const rows = products.map((product) => {
    try {
      const price = parseDecimal(product.price, "资源包售价");
      const credits = add(
        parseDecimal(product.credits, "基础额度", 1000000000n),
        parseDecimal(product.bonus ?? "0", "赠送额度", 1000000000n),
      );
      if (credits.n === 0n) throw new Error("总额度必须大于零");
      const unit = div(price, credits);
      const channelViews = Object.fromEntries(
        channels.map((channel) => [
          channel.key,
          {
            ...metrics(
              mul(mul(channel.rate, thousand), unit),
              channel.cost,
              channel.original,
            ),
            breakEvenRate: unit.n
              ? decimal(div(channel.cost, mul(unit, thousand)))
              : null,
          },
        ]),
      );
      const sample = metrics(mul(spent, unit), cost, original);
      let fullPack = null;
      if (spent.n) {
        const runs = div(credits, spent);
        fullPack = {
          ...metrics(price, mul(cost, runs), mul(original, runs)),
          estimatedRuns: decimal(runs),
        };
      }
      return {
        id: product.id,
        name: product.name,
        price: decimal(price),
        totalCredits: decimal(credits),
        bonus: String(product.bonus ?? "0"),
        version: product.version,
        validDays: product.validDays,
        unitPrice: decimal(unit),
        channels: channelViews,
        sample,
        fullPack,
        hasLoss: Object.values(channelViews).some(
          (view) => view.state === "loss",
        ),
        aboveOriginal: Object.values(channelViews).some(
          (view) =>
            view.originalPercent !== null && Number(view.originalPercent) > 100,
        ),
      };
    } catch (error) {
      return { id: product.id, name: product.name, error: error.message };
    }
  });
  return {
    config: x,
    rows,
    channels: Object.fromEntries(
      channels.map((channel) => [
        channel.key,
        {
          original: decimal(channel.original),
          baseCost: decimal(channel.baseCost),
          cost: decimal(channel.cost),
        },
      ]),
    ),
    sample: {
      points: decimal(spent),
      original: decimal(original),
      baseCost: decimal(baseCost),
      cost: decimal(cost),
    },
  };
}
