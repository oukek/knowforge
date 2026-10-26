import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./helpers/ai.mjs";
import { procurementCost } from "../server/ai/amounts.mjs";

const endpoint = "/admin/ai/pool";
const body = (pool) => ({
  revision: pool.revision,
  policy: pool.policy,
  providers: pool.providers.map(({ hasKey, ...p }) => p),
});
async function configured(t) {
  const f = await fixture(t);
  await f.configure();
  const pool = (await f.admin.api(endpoint)).data.pool;
  return { f, pool, p: pool.providers[0], m: pool.providers[0].models[0] };
}
const tokenPrice = { unit: "token", input: "5", cached: "1", output: "30" };
const actual = { input: "0.75", cached: "0.15", output: "4.5" };
const image = (m) => ({
  ...m,
  id: randomUUID(),
  model: "qa-image",
  kind: "image",
  features: [],
  procurement: null,
  imageProcurement: "0.1",
  imageCredits: "10",
  pricing: {
    unit: "image",
    perImage: "0.5",
    specification: "1024 × 1024 · 标准",
  },
});

test("服务商编辑保留多个模型的独立标价和采购成本，不传出密钥，冲突不覆盖", async (t) => {
  const { f, pool, p, m } = await configured(t);
  p.models = [
    { ...m, kind: "text", pricing: tokenPrice, procurement: actual },
    {
      ...m,
      id: randomUUID(),
      model: "second-model",
      pricing: { unit: "token", input: "2", cached: "0.5", output: "10" },
      procurement: { input: "0.3", cached: "0.075", output: "1.5" },
    },
    image(m),
  ];
  const r = await f.admin.api(endpoint, "PUT", body(pool));
  assert.equal(r.status, 200, JSON.stringify(r));
  const saved = r.data.pool;
  saved.providers[0].name = "单独修改服务商名称";
  const again = await f.admin.api(endpoint, "PUT", body(saved));
  assert.equal(again.status, 200);
  assert.deepEqual(
    again.data.pool.providers[0].models,
    saved.providers[0].models,
  );
  assert.equal(again.data.pool.providers[0].hasKey, true);
  assert(!JSON.stringify(again.data).includes("server-only-key"));
  assert.equal((await f.admin.api(endpoint, "PUT", body(saved))).status, 409);
  const pricing = (await f.admin.api("/admin/ai/pricing-simulation")).data;
  assert.equal(pricing.models.length, 3);
  assert.equal(pricing.models[0].pricing, null);
  assert.deepEqual(pricing.models[1].procurement, {
    input: "0.3",
    cached: "0.075",
    output: "1.5",
  });
  assert.equal(pricing.models[2].imageCredits, "10");
  assert.equal(pricing.models[2].imageProcurement, "0.1");
  assert(!JSON.stringify(pricing.models).includes("baseUrl"));
  assert.equal(f.calls(), 0);
});

test("每模型独立保存综合估算比例，管理员测算可载入；比例不影响真实任务扣费", async (t) => {
  const { f, pool, p, m } = await configured(t);
  const mix = { inputRatio: "1", outputRatio: "3", cacheHitPercent: "30" };
  p.models = [{ ...m, usageMix: mix }];
  const saved = await f.admin.api(endpoint, "PUT", body(pool));
  assert.equal(saved.status, 200, JSON.stringify(saved));
  assert.deepEqual(saved.data.pool.providers[0].models[0].usageMix, mix);
  assert.deepEqual(
    (await f.admin.api("/admin/ai/pricing-simulation")).data.models[0].usageMix,
    mix,
  );
  const bad = structuredClone(saved.data.pool);
  bad.providers[0].models[0].usageMix.cacheHitPercent = "101";
  assert.equal((await f.admin.api(endpoint, "PUT", body(bad))).status, 400);
  await f.grant();
  const started = await f.user.api("/ai/grade", "POST", f.input());
  assert.equal(started.status, 202);
  const run = await f.settled(f.user, started.data.run.id);
  assert.equal(run.status, "succeeded");
  assert.equal(run.chargedPoints, "0.7");
  assert(!JSON.stringify(run).includes("usageMix"));
});

test("图片与 Token 单位严格隔离，负价、混合单位、图片用途和无效单张额度拒绝保存", async (t) => {
  const { f, pool, p, m } = await configured(t);
  for (const invalid of [
    { ...m, kind: "text", pricing: { unit: "image", perImage: "1" } },
    { ...image(m), features: ["grade"] },
    { ...image(m), pricing: tokenPrice },
    { ...image(m), imageCredits: "0" },
    { ...image(m), imageProcurement: "-0.1" },
    { ...image(m), procurement: actual },
    { ...m, pricing: { ...tokenPrice, input: "-1" } },
    { ...m, pricing: { ...tokenPrice, input: "1e3" } },
    { ...m, pricing: { ...tokenPrice, perImage: "0.1" } },
  ]) {
    p.models = [invalid];
    const r = await f.admin.api(endpoint, "PUT", body(pool));
    assert.equal(r.status, 400, JSON.stringify(r));
  }
  assert.equal((await f.user.api(endpoint, "PUT", body(pool))).status, 403);
  assert.equal(
    (await f.admin.api(endpoint, "PUT", body(pool), { "X-CSRF-Token": "bad" }))
      .status,
    403,
  );
  assert.equal(f.calls(), 0);
});

test("图片配置不会让文本 AI 显示可用或进入文本测试与付费调度", async (t) => {
  const { f, pool, p, m } = await configured(t);
  p.models = [image(m)];
  assert.equal((await f.admin.api(endpoint, "PUT", body(pool))).status, 200);
  await f.grant(f.user, 10);
  const status = (await f.user.api("/ai/status")).data;
  assert.equal(status.configured, false);
  assert.equal(status.available, false);
  assert.equal(
    (
      await f.admin.api("/admin/ai/test", "POST", {
        requestId: randomUUID(),
        targetId: p.models[0].id,
      })
    ).status,
    503,
  );
  assert.equal((await f.user.api("/ai/grade", "POST", f.input())).status, 503);
  assert.equal(f.calls(), 0);
  const after = (await f.user.api("/ai/status")).data.account;
  assert.equal(after.available, "10");
  assert.equal(after.reserved, "0");
});

test("文本调度跳过图片；采购成本快照独立于标价，用户结果不暴露内部价格", async (t) => {
  const { f, pool, p, m } = await configured(t);
  p.models = [image(m), { ...m, pricing: tokenPrice, procurement: actual }];
  assert.equal((await f.admin.api(endpoint, "PUT", body(pool))).status, 200);
  await f.grant();
  const started = await f.user.api("/ai/grade", "POST", f.input());
  assert.equal(started.status, 202, JSON.stringify(started));
  const run = await f.settled(f.user, started.data.run.id);
  assert.equal(run.status, "succeeded");
  const detail = (await f.admin.api("/admin/ai/runs/" + run.id)).data;
  assert.equal(detail.attempts[0].model, m.model);
  assert.deepEqual(detail.attempts[0].costBasis, actual);
  assert.equal(detail.attempts[0].estimatedCostCny, "0.000963");
  for (const value of [
    run,
    (await f.user.api("/ai/status")).data,
    (await f.user.api("/export/backup")).data,
  ]) {
    const text = JSON.stringify(value);
    assert(!text.includes("imageProcurement"));
    assert(!text.includes("procurement"));
    assert(!text.includes("perImage"));
  }
  const fresh = (await f.admin.api(endpoint)).data.pool;
  fresh.providers[0].models[1].procurement = {
    input: "8",
    cached: "4",
    output: "20",
  };
  assert.equal((await f.admin.api(endpoint, "PUT", body(fresh))).status, 200);
  assert.deepEqual(
    (await f.admin.api("/admin/ai/runs/" + run.id)).data.attempts[0].costBasis,
    actual,
  );
  assert.equal(f.calls(), 1);
});

test("原价乘上游倍率在后端计算成本，覆盖客户端伪造成本；修改倍率不改扣费和已有成本快照", async (t) => {
  const { f, pool, p, m } = await configured(t);
  p.models = [
    {
      ...m,
      pricing: tokenPrice,
      costDiscount: "0.15",
      procurement: { input: "0", cached: "0", output: "0" },
    },
  ];
  const saved = await f.admin.api(endpoint, "PUT", body(pool));
  assert.equal(saved.status, 200, JSON.stringify(saved));
  const model = saved.data.pool.providers[0].models[0];
  assert.deepEqual(model.procurement, actual);
  assert.equal(model.costDiscount, "0.15");
  const metadata = (await f.admin.api("/admin/ai/pricing-simulation")).data
    .models[0];
  assert.deepEqual(metadata.pricing, tokenPrice);
  assert.equal(metadata.costDiscount, "0.15");
  await f.grant();
  f.setDelay(150);
  const started = await f.user.api("/ai/grade", "POST", f.input());
  assert.equal(started.status, 202);
  const fresh = (await f.admin.api(endpoint)).data.pool;
  fresh.providers[0].models[0].costDiscount = "1";
  const changed = await f.admin.api(endpoint, "PUT", body(fresh));
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.data.pool.providers[0].models[0].procurement, {
    input: "5",
    cached: "1",
    output: "30",
  });
  assert.deepEqual(
    changed.data.pool.providers[0].models[0].policy,
    model.policy,
  );
  const run = await f.settled(f.user, started.data.run.id);
  assert.equal(run.status, "succeeded");
  const detail = (await f.admin.api("/admin/ai/runs/" + run.id)).data;
  assert.deepEqual(detail.attempts[0].costBasis, actual);
  assert.equal(detail.attempts[0].estimatedCostCny, "0.000963");
  assert.equal(run.chargedPoints, "0.7");
  for (const value of [
    run,
    (await f.user.api("/ai/status")).data,
    (await f.user.api("/export/backup")).data,
  ]) {
    assert(!JSON.stringify(value).includes("costDiscount"));
    assert(!JSON.stringify(value).includes("procurement"));
  }
});

test("文本和图片成本保存精确保留乘法小数，零倍率允许，非法倍率或缺原价拒绝且不改配置", async (t) => {
  const { f, pool, p, m } = await configured(t);
  p.models = [
    {
      ...m,
      pricing: {
        unit: "token",
        input: "0.123456",
        cached: "0.000001",
        output: "0",
      },
      costDiscount: "0.123456",
    },
    { ...image(m), costDiscount: "0.2" },
  ];
  const saved = await f.admin.api(endpoint, "PUT", body(pool));
  assert.equal(saved.status, 200, JSON.stringify(saved));
  assert.deepEqual(saved.data.pool.providers[0].models[0].procurement, {
    input: "0.015241383936",
    cached: "0.000000123456",
    output: "0",
  });
  assert.equal(saved.data.pool.providers[0].models[1].imageProcurement, "0.1");
  assert.equal(
    procurementCost(
      { input: 1000000, cached: 0, output: 0 },
      saved.data.pool.providers[0].models[0].procurement,
    ),
    "0.015242",
  );
  const again = await f.admin.api(endpoint, "PUT", body(saved.data.pool));
  assert.equal(again.status, 200, JSON.stringify(again));
  for (const invalid of ["-0.15", "1.000001", "15", "0.0000001", "NaN"]) {
    const current = structuredClone(again.data.pool);
    current.providers[0].models[0].costDiscount = invalid;
    assert.equal(
      (await f.admin.api(endpoint, "PUT", body(current))).status,
      400,
    );
  }
  const missing = structuredClone(again.data.pool);
  missing.providers[0].models[0].pricing = null;
  assert.equal((await f.admin.api(endpoint, "PUT", body(missing))).status, 400);
  const free = structuredClone(again.data.pool);
  free.providers[0].models[0].costDiscount = "0";
  const zero = await f.admin.api(endpoint, "PUT", body(free));
  assert.equal(zero.status, 200, JSON.stringify(zero));
  assert.deepEqual(zero.data.pool.providers[0].models[0].procurement, {
    input: "0",
    cached: "0",
    output: "0",
  });
  assert.equal(f.calls(), 0);
});
