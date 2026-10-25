import test from "node:test";
import assert from "node:assert/strict";
import {
  PRICING_SIMULATION_DEFAULTS as defaults,
  calculatePricingSimulation,
  calculatePackPricing,
  normalizePackPricing,
  normalizePricingSimulation,
  formatPricingNumber,
} from "../shared/pricing-simulation.mjs";
import { usageCharge } from "../server/ai/amounts.mjs";
import { fixture } from "./helpers/ai.mjs";
import { PricingSimulation } from "../server/ai/pricing-simulation.mjs";
const plan = (patch) => ({
  ...defaults,
  inputPrice: "5",
  outputPrice: "30",
  costDiscount: "0.15",
  inputRate: "0.125",
  outputRate: "0.75",
  ...patch,
});
const lite = {
  id: "lite",
  name: "轻量",
  price: "9.90",
  credits: "500",
  bonus: "0",
  version: 1,
  validDays: 180,
};
const flagship = {
  id: "flagship",
  name: "旗舰",
  price: "699",
  credits: "50000",
  bonus: "0",
};

test("资源包直接换算：9.9 元的 500 额度分别得到输入和输出 Token，再用这些数量算原价", () => {
  const r = calculatePackPricing(
    plan({ useCache: true, cachedPrice: "1", cachedRate: "0.05" }),
    [lite],
  );
  const row = r.rows[0];
  assert.equal(row.channels.input.capacity, "4000000");
  assert.equal(row.channels.input.wholePack.original, "20");
  assert.equal(row.channels.input.wholePack.revenue, "9.9");
  assert.equal(row.channels.input.wholePack.discountPercent, "50.5");
  assert.equal(row.channels.input.wholePack.cost, "3");
  assert.equal(row.channels.output.capacity, "666666");
  assert.equal(row.channels.output.wholePack.original, "19.99998");
  assert.equal(row.channels.output.wholePack.cost, "2.999997");
  assert.equal(row.channels.cached.capacity, "10000000");
  assert.equal(row.channels.cached.wholePack.original, "10");
  assert.equal(row.channels.cached.wholePack.discountPercent, "1");
  assert(!Object.hasOwn(row, "sample"));
  assert(!Object.hasOwn(row, "fullPack"));
});

test("资源包结果完全不依赖旧样例：不同样例比例、零用量和无效旧样例均不影响计算或配置保存", () => {
  const expected = calculatePackPricing(plan(), [lite]);
  for (const patch of [
    { inputTokens: "1000000", outputTokens: "0", cachedTokens: "0" },
    { inputTokens: "0", outputTokens: "1000000", cachedTokens: "0" },
    { inputTokens: "0", outputTokens: "0" },
    {
      inputTokens: "bad",
      outputTokens: "-1",
      cachedTokens: "999999999",
      imageCount: "invalid",
    },
  ])
    assert.deepEqual(calculatePackPricing(plan(patch), [lite]), expected);
  assert.equal(
    normalizePackPricing(plan({ inputTokens: "bad" })).inputPrice,
    "5",
  );
  assert.throws(() => normalizePackPricing(null));
  assert.throws(() => normalizePackPricing([]));
  assert.throws(() => normalizePackPricing(plan({ inputRate: "bad" })));
});

test("每项独立计算赠送、采购折扣、负优惠和整数数量，不把多个用途的原价相加", () => {
  const base = plan({ inputRate: "1", outputRate: "3" });
  const a = calculatePackPricing(base, [lite]).rows[0];
  assert.equal(a.channels.input.wholePack.original, "2.5");
  assert.equal(a.channels.input.wholePack.discountPercent, "-296");
  assert.equal(a.channels.output.wholePack.original, "4.99998");
  const gift = calculatePackPricing({ ...base, costDiscount: "0.5" }, [
    { ...lite, bonus: "500" },
  ]).rows[0];
  assert.equal(gift.channels.input.capacity, "1000000");
  assert.equal(gift.channels.input.wholePack.original, "5");
  assert.equal(gift.channels.input.wholePack.cost, "2.5");
  const noCost = calculatePackPricing({ ...base, costDiscount: "0" }, [lite])
    .rows[0];
  assert.equal(
    noCost.channels.input.wholePack.discountPercent,
    a.channels.input.wholePack.discountPercent,
  );
  assert.equal(noCost.channels.input.wholePack.cost, "0");
});

test("资源包按可用整张图片算原价；零费率、零原价、免费商品和不足一张时各有明确定义", () => {
  const x = plan({
    kind: "image",
    imagePrice: "0.5",
    imageRate: "3",
    costDiscount: "0.2",
  });
  const a = calculatePackPricing(x, [lite]).rows[0];
  assert.equal(a.channels.image.capacity, "166");
  assert.equal(a.channels.image.wholePack.original, "83");
  assert.equal(a.channels.image.wholePack.cost, "16.6");
  assert(a.hasLoss);
  const tiny = calculatePackPricing(x, [{ ...lite, credits: "1" }]).rows[0];
  assert.equal(tiny.channels.image.capacity, "0");
  assert.equal(tiny.channels.image.wholePack, null);
  const zeroRate = calculatePackPricing({ ...x, imageRate: "0" }, [lite])
    .rows[0];
  assert.equal(zeroRate.channels.image.capacity, null);
  assert.equal(zeroRate.channels.image.wholePack, null);
  const zeroOriginal = calculatePackPricing({ ...x, imagePrice: "0" }, [lite])
    .rows[0];
  assert.equal(zeroOriginal.channels.image.wholePack.discountPercent, null);
  const free = calculatePackPricing(x, [{ ...lite, price: "0" }]).rows[0];
  assert.equal(free.channels.image.wholePack.discountPercent, "100");
  assert.equal(free.channels.image.wholePack.marginPercent, null);
});

test("截图人民币成本与小数费率：一组收费、八档折扣和整包毛利不混淆", () => {
  const r = calculatePricingSimulation(plan(), [lite, flagship]);
  assert.equal(r.channels.input.baseCost, "0.75");
  assert.equal(r.channels.output.baseCost, "4.5");
  assert.equal(r.sample.points, "2.5");
  assert.equal(r.sample.cost, "0.015");
  const [a, b] = r.rows;
  assert.equal(a.channels.input.revenue, "2.475");
  assert.equal(a.channels.output.revenue, "14.85");
  assert.equal(a.channels.input.originalPercent, "49.5");
  assert.equal(a.channels.output.costMultiple, "3.3");
  assert.equal(a.sample.revenue, "0.0495");
  assert.equal(a.sample.profit, "0.0345");
  assert.equal(a.fullPack.cost, "3");
  assert.equal(a.fullPack.profit, "6.9");
  assert.equal(a.fullPack.estimatedRuns, "200");
  assert.equal(b.channels.input.revenue, "1.7475");
  assert.equal(b.channels.output.revenue, "10.485");
  assert.equal(b.channels.input.originalPercent, "34.95");
  assert.equal(b.fullPack.cost, "300");
  assert.equal(b.fullPack.profit, "399");
  assert.equal(formatPricingNumber(b.fullPack.marginPercent, 2), "57.08");
  assert.notEqual(a.sample.marginPercent, "230"); // margin, not markup over cost
});
test("旧 1/3 费率下整包成本依赖输入输出比例，不擅自给统一毛利", () => {
  const input = calculatePricingSimulation(
    plan({
      inputRate: "1",
      outputRate: "3",
      inputTokens: "1000000",
      outputTokens: "0",
    }),
    [lite],
  ).rows[0];
  const output = calculatePricingSimulation(
    plan({
      inputRate: "1",
      outputRate: "3",
      inputTokens: "0",
      outputTokens: "1000000",
    }),
    [lite],
  ).rows[0];
  assert.equal(input.fullPack.cost, "0.375");
  assert.equal(output.fullPack.cost, "0.75");
  assert.equal(input.channels.input.revenue, "19.8");
  assert.equal(output.channels.output.revenue, "59.4");
  assert(input.aboveOriginal && output.aboveOriginal);
});
test("赠送额度降低有效单价，提高整包成本；免费商品不会除零或显示假毛利率", () => {
  const r = calculatePricingSimulation(plan(), [
    { ...lite, bonus: "500" },
    { ...lite, id: "gift", price: "0" },
  ]);
  assert.equal(r.rows[0].totalCredits, "1000");
  assert.equal(r.rows[0].channels.input.revenue, "1.2375");
  assert.equal(r.rows[0].fullPack.cost, "6");
  assert.equal(r.rows[0].fullPack.profit, "3.9");
  const free = r.rows[1];
  assert.equal(free.fullPack.profit, "-3");
  assert.equal(free.sample.marginPercent, null);
  assert.equal(free.fullPack.marginPercent, null);
  assert.equal(free.channels.input.breakEvenRate, null);
  assert(free.hasLoss);
});
test("缓存是输入子集，不重复收费；额外成本只增加成本不增加客户扣款", () => {
  const a = calculatePricingSimulation(
    plan({
      useCache: true,
      cachedPrice: "1",
      cachedRate: "0.02",
      cachedTokens: "4000",
    }),
    [lite],
  );
  // 4000 uncached + 4000 cached + 2000 output = .003 + .0006 + .009 CNY.
  assert.equal(a.sample.cost, "0.0126");
  assert.equal(a.sample.points, "2.08");
  const b = calculatePricingSimulation(
    { ...a.config, extraCostPercent: "50" },
    [lite],
  );
  assert.equal(b.sample.baseCost, "0.0126");
  assert.equal(b.sample.cost, "0.0189");
  assert.equal(b.rows[0].sample.revenue, a.rows[0].sample.revenue);
  assert.equal(b.channels.cached.baseCost, "0.15");
});
test("零采购价、零折扣、零收费及亏损保留各自含义", () => {
  const zeroCost = calculatePricingSimulation(plan({ costDiscount: "0" }), [
    lite,
  ]).rows[0];
  assert.equal(zeroCost.sample.marginPercent, "100");
  assert.equal(zeroCost.channels.input.costMultiple, null);
  assert(zeroCost.channels.input.zeroCost);
  const free = calculatePricingSimulation(
    plan({ inputRate: "0", outputRate: "0" }),
    [lite],
  );
  assert.equal(free.sample.points, "0");
  assert.equal(free.rows[0].fullPack, null);
  assert.equal(free.rows[0].channels.input.capacity, null);
  assert(free.rows[0].hasLoss);
  assert.equal(free.rows[0].sample.profit, "-0.015");
  const loss = calculatePricingSimulation(
    plan({ inputRate: "0.01", outputRate: "0.01" }),
    [flagship],
  ).rows[0];
  assert(loss.hasLoss);
  assert.equal(loss.sample.state, "loss");
  assert(Number(loss.sample.marginPercent) < 0);
  const noList = calculatePricingSimulation(plan({ inputPrice: "0" }), [lite]);
  assert.equal(noList.rows[0].channels.input.originalPercent, null);
});
test("微额度与正式账本保持同一次向上取整，分数单价不提前舍入", () => {
  const x = plan({
    inputRate: "0.000001",
    outputRate: "0.75",
    inputTokens: "1",
    outputTokens: "0",
  });
  const r = calculatePricingSimulation(x, [
    { ...lite, price: "1", credits: "3" },
  ]);
  assert.equal(r.sample.points, "0.000001");
  assert.equal(usageCharge({ input: 1, cached: 0, output: 0 }, x), 1n);
  assert.equal(r.rows[0].sample.revenue, "0.000000333333333333");
  assert.equal(r.rows[0].channels.output.revenue, "250");
  assert.equal(formatPricingNumber("0.0000004", 6), "<0.000001");
  assert.equal(formatPricingNumber("-0.0000004", 6), ">−0.000001");
  assert.equal(formatPricingNumber("1234567.995", 2), "1,234,568");
});
test("无效参数明确拒绝，损坏资源包不会让其余行失效", () => {
  for (const patch of [
    { costDiscount: "15" },
    { costDiscount: "-0.15" },
    { inputRate: "0.0000001" },
    { outputPrice: "NaN" },
    { inputRate: "1e3" },
    { inputPrice: ["5"] },
    { inputTokens: [8000] },
    { outputRate: true },
    { inputPrice: "1000001" },
    { inputTokens: "1.5" },
    { inputTokens: "100000001" },
    { inputTokens: "0", outputTokens: "0" },
    { useCache: true, cachedPrice: null },
    { useCache: true, cachedPrice: "1", cachedTokens: "8001" },
    { useCache: "true" },
    { apiKey: "should-never-store" },
  ])
    assert.throws(
      () => normalizePricingSimulation(plan(patch)),
      JSON.stringify(patch),
    );
  const r = calculatePricingSimulation(plan(), [
    { ...lite, id: "bad", credits: "0" },
    lite,
  ]);
  assert.match(r.rows[0].error, /总额度/);
  assert.equal(r.rows[1].fullPack.profit, "6.9");
});
test("当前费率下纯输入盈利但纯输出亏损时仍提示风险", () => {
  const r = calculatePricingSimulation(
    plan({
      inputRate: "1",
      outputRate: "0.1",
      inputTokens: "10000",
      outputTokens: "1",
    }),
    [lite],
  ).rows[0];
  assert.equal(r.sample.state, "profit");
  assert.equal(r.channels.output.state, "loss");
  assert(r.hasLoss);
});

test("500 额度按原价价值 20 元，实收 9.9 元即优惠 50.5%，上游折扣不改变用户优惠", () => {
  const row = calculatePricingSimulation(plan(), [lite]).rows[0];
  assert.equal(row.fullPack.original, "20");
  assert.equal(row.fullPack.revenue, "9.9");
  assert.equal(row.fullPack.savings, "10.1");
  assert.equal(row.fullPack.discountPercent, "50.5");
  assert.equal(row.fullPack.cost, "3");
  const changed = calculatePricingSimulation(plan({ costDiscount: "0.3" }), [
    lite,
  ]).rows[0];
  assert.equal(changed.fullPack.original, "20");
  assert.equal(changed.fullPack.discountPercent, "50.5");
  assert.equal(changed.fullPack.cost, "6");
  const gift = calculatePricingSimulation(plan(), [{ ...lite, bonus: "500" }])
    .rows[0];
  assert.equal(gift.fullPack.original, "40");
  assert.equal(gift.fullPack.discountPercent, "75.25");
});

test("整包原价按选定输入输出比例折算，实收高于原价时保留负优惠，不伪装优惠", () => {
  const input = calculatePricingSimulation(
    plan({
      inputRate: "1",
      outputRate: "3",
      inputTokens: "1000000",
      outputTokens: "0",
    }),
    [lite],
  ).rows[0];
  const output = calculatePricingSimulation(
    plan({
      inputRate: "1",
      outputRate: "3",
      inputTokens: "0",
      outputTokens: "1000000",
    }),
    [lite],
  ).rows[0];
  assert.equal(input.fullPack.original, "2.5");
  assert.equal(input.fullPack.discountPercent, "-296");
  assert.equal(output.fullPack.original, "5");
  assert.equal(output.fullPack.discountPercent, "-98");
  const zero = calculatePricingSimulation(
    plan({ inputPrice: "0", outputPrice: "0" }),
    [lite],
  ).rows[0];
  assert.equal(zero.fullPack.original, "0");
  assert.equal(zero.fullPack.discountPercent, null);
  const free = calculatePricingSimulation(plan(), [{ ...lite, price: "0" }])
    .rows[0];
  assert.equal(free.fullPack.discountPercent, "100");
  const cache = calculatePricingSimulation(
    plan({
      useCache: true,
      cachedPrice: "1",
      cachedRate: "0.05",
      cachedTokens: "4000",
    }),
    [lite],
  ).rows[0];
  assert.equal(cache.fullPack.original, "19.090909090909090909");
});

test("图片原价与上游倍率分开计算，整包用户优惠独立于采购倍率和样例张数", () => {
  const x = plan({
    kind: "image",
    imagePrice: "0.5",
    costDiscount: "0.2",
    imageRate: "10",
    imageCount: "2",
  });
  const row = calculatePricingSimulation(x, [lite]).rows[0];
  assert.equal(row.fullPack.original, "25");
  assert.equal(row.fullPack.discountPercent, "60.4");
  assert.equal(row.fullPack.cost, "5");
  const other = calculatePricingSimulation(
    { ...x, imageCount: "10", costDiscount: "1" },
    [lite],
  ).rows[0];
  assert.equal(other.fullPack.original, "25");
  assert.equal(other.fullPack.discountPercent, "60.4");
  assert.equal(other.fullPack.cost, "25");
});

test("测算接口仅管理员可用，遵守 CSRF，读取不写入配置", async (t) => {
  const f = await fixture(t),
    url = "/admin/ai/pricing-simulation";
  assert.equal((await f.user.api(url)).status, 403);
  assert.equal(
    (await f.user.api(url, "PUT", { revision: null, plan: plan() })).status,
    403,
  );
  assert.equal(
    (
      await f.admin.api(
        url,
        "PUT",
        { revision: null, plan: plan() },
        { "X-CSRF-Token": "invalid" },
      )
    ).status,
    403,
  );
  const current = await f.admin.api(url);
  assert.equal(current.status, 200);
  assert.equal(current.data.revision, null);
  assert.equal(current.data.plan.inputPrice, "5");
  assert.equal(current.data.plan.costDiscount, "1");
  assert.equal(current.data.examplePlan.costDiscount, "0.15");
  assert.equal(current.data.plan.inputRate, "1");
  assert.equal(current.data.examplePlan.inputRate, "0.125");
  assert.equal(
    await f.store.session(() =>
      f.store.get("SELECT id FROM ai_config WHERE id=?", "pricing-simulation"),
    ),
    undefined,
  );
  assert.equal(f.calls(), 0);
});
test("保存后重建服务仍可读取，版本冲突不覆盖，普通接口不暴露成本方案", async (t) => {
  const f = await fixture(t),
    url = "/admin/ai/pricing-simulation";
  const beforePool = (await f.admin.api("/admin/ai/pool")).data;
  const beforeProducts = (await f.admin.api("/admin/ai/products")).data;
  const beforeCredits = (await f.user.api("/ai/credits")).data;
  const saved = await f.admin.api(url, "PUT", {
    revision: null,
    plan: plan({ modelName: "私有定价方案" }),
  });
  assert.equal(saved.status, 200);
  assert.match(saved.data.revision, /^[a-f0-9-]{36}$/);
  const again = await new PricingSimulation(f.ai.repo, f.ai.pool).read();
  assert.deepEqual(again, saved.data);
  assert.equal(
    (
      await f.admin.api(url, "PUT", {
        revision: null,
        plan: plan({ modelName: "过期编辑" }),
      })
    ).status,
    409,
  );
  assert.equal((await f.admin.api(url)).data.plan.modelName, "私有定价方案");
  assert.deepEqual((await f.admin.api("/admin/ai/pool")).data, beforePool);
  assert.deepEqual(
    (await f.admin.api("/admin/ai/products")).data,
    beforeProducts,
  );
  assert.deepEqual((await f.user.api("/ai/credits")).data, beforeCredits);
  for (const path of ["/bootstrap", "/ai/status", "/export/backup"]) {
    const json = JSON.stringify((await f.user.api(path)).data);
    assert(!json.includes("私有定价方案"));
  }
  const audit = await f.store.session(() =>
    f.store.get(
      "SELECT * FROM admin_audit WHERE action=?",
      "pricing.simulation.save",
    ),
  );
  assert.equal(audit.userId, f.admin.user.id);
  assert.equal(f.calls(), 0);
});
test("无效测算保存返回 400 且不改变上次方案", async (t) => {
  const f = await fixture(t),
    url = "/admin/ai/pricing-simulation";
  const saved = (
    await f.admin.api(url, "PUT", { revision: null, plan: plan() })
  ).data;
  for (const patch of [
    { costDiscount: "15" },
    { useCache: true, cachedTokens: "99999", cachedPrice: "1" },
    { inputPrice: "-5" },
    { inputRate: "1.2345678" },
    { currency: "USD" },
  ]) {
    const r = await f.admin.api(url, "PUT", {
      revision: saved.revision,
      plan: plan(patch),
    });
    assert.equal(r.status, 400, JSON.stringify(r));
  }
  assert.deepEqual((await f.admin.api(url)).data, saved);
});

test("用户单价与整包用量仅由资源包及扣费额度换算，不依赖额外标价或采购折扣", () => {
  const x = plan({ inputRate: "1", outputRate: "3" });
  const r = calculatePricingSimulation(x, [lite]).rows[0];
  assert.equal(r.channels.input.capacity, "500000");
  assert.equal(r.channels.output.capacity, "166666");
  const other = calculatePricingSimulation(
    { ...x, inputPrice: "0", outputPrice: "0", costDiscount: "0.5" },
    [{ ...lite, bonus: "500" }],
  ).rows[0];
  assert.equal(other.channels.input.capacity, "1000000");
  assert.equal(other.channels.output.capacity, "333333");
  assert.equal(other.channels.input.revenue, "9.9");
  const low = calculatePricingSimulation(plan(), [lite]).rows[0];
  assert.equal(low.channels.input.capacity, "4000000");
  assert.equal(low.channels.output.capacity, "666666");
  const differentSale = calculatePricingSimulation(plan(), [
    { ...lite, price: "19.8" },
  ]).rows[0];
  assert.equal(differentSale.channels.input.revenue, "4.95");
  assert.equal(
    differentSale.channels.input.capacity,
    low.channels.input.capacity,
  );
  // Whole-unit floor: the remaining credits cannot cover one more output token.
  assert(
    usageCharge({ input: 0, output: 666666, cached: 0 }, plan()) <= 500000000n,
  );
  assert(
    usageCharge({ input: 0, output: 666667, cached: 0 }, plan()) > 500000000n,
  );
});

test("图片用户价格与可用张数直接按扣费额度换算，向下取整整张图片", () => {
  const r = calculatePricingSimulation(
    plan({
      kind: "image",
      imagePrice: "0.5",
      imageRate: "10",
      imageCount: "2",
      directCosts: true,
      imageCost: "0.1",
      useCache: true,
      cachedPrice: "1",
    }),
    [lite],
  );
  assert.deepEqual(Object.keys(r.channels), ["image"]);
  assert.equal(r.config.useCache, false);
  assert.equal(r.channels.image.baseCost, "0.1");
  assert.equal(r.sample.points, "20");
  assert.equal(r.sample.cost, "0.2");
  assert.equal(r.sample.original, "0");
  const a = r.rows[0];
  assert.equal(a.channels.image.revenue, "0.198");
  assert.equal(a.fullPack.cost, "5");
  assert.equal(a.fullPack.profit, "4.9");
  assert.equal(a.channels.image.capacity, "50");
  const many = calculatePricingSimulation({ ...r.config, imageCount: "10" }, [
    lite,
  ]).rows[0];
  assert.equal(many.channels.image.capacity, "50");
  assert.equal(many.fullPack.profit, "4.9");
  const fractional = calculatePricingSimulation(
    { ...r.config, imageRate: "3" },
    [lite],
  ).rows[0];
  assert.equal(fractional.channels.image.capacity, "166");
});

test("实际成本直接填入不会再次打折；不填原价仍可算出用户价格与毛利，旧版方案默认文本", () => {
  const r = calculatePricingSimulation(
    plan({
      directCosts: true,
      inputCost: "0.75",
      outputCost: "4.5",
      costDiscount: "0.15",
    }),
    [lite],
  );
  assert.equal(r.channels.input.baseCost, "0.75");
  assert.equal(r.channels.output.baseCost, "4.5");
  assert.equal(r.rows[0].fullPack.profit, "6.9");
  assert.equal(
    calculatePricingSimulation(
      plan({
        directCosts: true,
        inputCost: "0.75",
        outputCost: "4.5",
        inputPrice: "",
        outputPrice: "",
      }),
      [lite],
    ).rows[0].channels.input.revenue,
    "2.475",
  );
  assert.equal(
    normalizePricingSimulation({ modelName: "旧版方案" }).kind,
    "text",
  );
  for (const patch of [
    { kind: "video" },
    { directCosts: 1 },
    { kind: "image", imageCount: "0" },
    { kind: "image", imageCount: "10001" },
    { kind: "image", directCosts: true, imageCost: "-1" },
    { kind: "image", imageRate: "0.0000001" },
  ])
    assert.throws(() => normalizePricingSimulation(plan(patch)));
});

test("切换计价单位或采购模式清理隐藏字段，保留有效的当前参数", () => {
  const image = normalizePricingSimulation(
    plan({
      kind: "image",
      inputPrice: "",
      inputRate: "bad",
      inputTokens: "bad",
      imagePrice: "0.5",
      imageRate: "10",
      imageCount: "2",
      directCosts: true,
      costDiscount: "bad",
      imageCost: "0.1",
      inputCost: "",
    }),
  );
  assert.equal(image.costDiscount, "1");
  assert.equal(image.inputCost, "0");
  assert.equal(
    calculatePricingSimulation(image, [lite]).rows[0].channels.image.capacity,
    "50",
  );
  const text = normalizePricingSimulation(
    plan({
      imagePrice: "",
      imageCount: "bad",
      directCosts: false,
      inputCost: "",
      outputCost: "",
      cachedRate: "",
      useCache: false,
    }),
  );
  assert.equal(text.imageCount, "1");
  assert.equal(text.inputCost, "0");
  assert.equal(text.cachedRate, "1");
  assert.equal(
    calculatePricingSimulation(text, [lite]).rows[0].fullPack.profit,
    "6.9",
  );
});
