import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./helpers/ai.mjs";
import { AiError } from "../server/ai/policy.mjs";
import { quote, points } from "../server/ai/amounts.mjs";
import { AiPool } from "../server/ai/pool.mjs";
import { eligibleModels } from "../server/ai/model-policy.mjs";
const url = "/admin/ai/pool";
const body = (p) => ({
  revision: p.revision,
  policy: p.policy,
  providers: p.providers.map(({ hasKey, ...v }) => v),
});
async function setup(t, overrides = [{}]) {
  const f = await fixture(t);
  await f.configure();
  const pool = (await f.admin.api(url)).data.pool;
  const base = pool.providers[0],
    original = base.models[0];
  pool.providers = overrides.map((patch, index) => ({
    ...base,
    id: index ? randomUUID() : base.id,
    name: "测试服务 " + index,
    ...(index ? { apiKey: "server-only-key" } : {}),
    models: [
      {
        ...original,
        id: index ? randomUUID() : original.id,
        model: "model-" + index,
        priority: index,
        policy: { ...pool.policy, ...(patch.policy || {}) },
        ...Object.fromEntries(
          Object.entries(patch).filter(([k]) => k !== "policy"),
        ),
      },
    ],
  }));
  const response = await f.admin.api(url, "PUT", body(pool));
  assert.equal(response.status, 200, JSON.stringify(response));
  await f.grant(f.user, 100);
  return { f, pool: response.data.pool };
}
function fail() {
  const e = new AiError(502, "模拟服务异常", "AI_UPSTREAM");
  e.upstreamStatus = 503;
  e.noCharge = true;
  return e;
}

test("模型小数费率独立保存，公开各模型费率，非法费用不改变配置", async (t) => {
  const { f, pool } = await setup(t, [
    { policy: { inputRate: "0.125", cachedRate: "0.05", outputRate: "0.75" } },
    { policy: { inputRate: "2", cachedRate: "1", outputRate: "6" } },
  ]);
  assert.equal(pool.policy.inputRate, 1);
  assert.equal(pool.providers[0].models[0].policy.inputRate, "0.125");
  const status = (await f.user.api("/ai/status")).data;
  assert.equal(status.tariff, null);
  assert.equal(status.tariffs.length, 2);
  assert.equal(status.tariffs[0].inputRate, "0.125");
  assert(!JSON.stringify(status.tariffs).includes("procurement"));
  assert(!JSON.stringify(status.tariffs).includes("apiKey"));
  for (const rate of ["0", "-1", "1001", "0.0000001", "1e2"]) {
    const next = structuredClone(pool);
    next.providers[0].models[0].policy.inputRate = rate;
    assert.equal((await f.admin.api(url, "PUT", body(next))).status, 400);
  }
  assert.equal((await f.admin.api(url)).data.pool.revision, pool.revision);
  assert.equal(f.calls(), 0);
});

test("切换模型按最高预计费用预占，按成功模型费率结算一次，使用各自输出上限", async (t) => {
  const { f, pool } = await setup(t, [
    {
      policy: {
        inputRate: "0.125",
        cachedRate: "0.05",
        outputRate: "0.75",
        outputLimit: 1024,
      },
    },
    {
      policy: {
        inputRate: "2",
        cachedRate: "1",
        outputRate: "6",
        outputLimit: 3072,
      },
    },
  ]);
  const generate = f.provider.generate,
    seen = [];
  f.provider.generate = async (config, ...args) => {
    seen.push([config.model, config.outputLimit]);
    if (config.model === "model-0") throw fail();
    return generate(config, ...args);
  };
  const start = await f.user.api("/ai/grade", "POST", f.input());
  assert.equal(start.status, 202, JSON.stringify(start));
  const result = await f.settled(f.user, start.data.run.id);
  assert.equal(result.status, "succeeded");
  assert.equal(result.chargedPoints, "1.38");
  assert.deepEqual(result.actualRates, {
    inputRate: "2",
    cachedRate: "1",
    outputRate: "6",
  });
  const detail = (await f.admin.api("/admin/ai/runs/" + result.id)).data;
  assert.equal(detail.config.model, "自动调度");
  assert.equal(detail.config.inputRate, "0.125");
  const quotes = pool.providers.map((p) =>
    quote(detail.messages, p.models[0].policy, "grade"),
  );
  assert.equal(
    result.quotedPoints,
    points(quotes.reduce((a, b) => (a > b ? a : b))),
  );
  assert.deepEqual(seen, [
    ["model-0", 1024],
    ["model-1", 3072],
  ]);
  assert.equal(detail.attempts[1].estimatedPoints, "1.38");
  assert.equal(
    (await f.user.api("/ai/status")).data.account.available,
    "98.62",
  );
  const events = await f.store.session(() =>
    f.store.all(
      "SELECT * FROM ai_credit_events WHERE runId=? AND kind=?",
      result.id,
      "settle",
    ),
  );
  assert.equal(events.length, 1);
  assert.equal(
    (
      await f.user.api(
        "/ai/grade",
        "POST",
        JSON.parse(JSON.stringify(detail.input)),
      )
    ).data.reused,
    true,
  );
  assert.equal(seen.length, 2);
});

test("调用过程中改价仍按启动时的模型快照收费，后续任务才使用新费率", async (t) => {
  const { f } = await setup(t, [
    { policy: { inputRate: "0.125", cachedRate: "0.05", outputRate: "0.75" } },
  ]);
  let release, enter;
  const gate = new Promise((r) => (release = r)),
    entered = new Promise((r) => (enter = r)),
    generate = f.provider.generate;
  f.provider.generate = async (...args) => {
    enter();
    await gate;
    return generate(...args);
  };
  t.after(() => release());
  const start = await f.user.api("/ai/grade", "POST", f.input());
  await entered;
  const pool = (await f.admin.api(url)).data.pool;
  Object.assign(pool.providers[0].models[0].policy, {
    inputRate: "2",
    cachedRate: "1",
    outputRate: "6",
  });
  assert.equal((await f.admin.api(url, "PUT", body(pool))).status, 200);
  release();
  const result = await f.settled(f.user, start.data.run.id);
  assert.equal(result.chargedPoints, "0.161");
  assert.equal(result.actualRates.inputRate, "0.125");
  const next = await f.user.api("/ai/grade", "POST", {
    ...f.input(),
    answer: f.input().answer + "补充一个边界来验证新费用",
  });
  assert.equal(next.status, 202, JSON.stringify(next));
  const later = await f.settled(f.user, next.data.run.id);
  assert.equal(later.chargedPoints, "1.38");
  assert.equal(later.actualRates.inputRate, "2");
});

test("每模型调用上限单独计数，达到上限自动避让，重建服务池不清空次数", async (t) => {
  const { f, pool } = await setup(t, [
    { policy: { dailyRuns: 1, perQuestionRuns: 1 } },
    { policy: { dailyRuns: 5, perQuestionRuns: 5 } },
  ]);
  const a = await f.user.api("/ai/grade", "POST", f.input());
  const first = await f.settled(f.user, a.data.run.id);
  assert.equal(first.status, "succeeded");
  const b = await f.user.api("/ai/grade", "POST", {
    ...f.input(),
    answer: f.input().answer + "第二个回答内容",
  });
  const second = await f.settled(f.user, b.data.run.id);
  assert.equal(
    (await f.admin.api("/admin/ai/runs/" + second.id)).data.attempts[0].model,
    "model-1",
  );
  const restored = new AiPool(f.ai.repo, f.provider, "a".repeat(64));
  await restored.init();
  const candidates = await f.ai.repo.read((db) =>
    restored.snapshot(db, "grade"),
  );
  const available = await f.ai.repo.read((db) =>
    eligibleModels(
      db,
      candidates.targets,
      f.user.user.id,
      f.question.id,
      "grade",
    ),
  );
  assert.deepEqual(
    available.map((t) => t.id),
    [pool.providers[1].models[0].id],
  );
  const counts = await f.store.session(() =>
    f.store.all(
      "SELECT modelId,COUNT(*) AS n FROM ai_model_invocations GROUP BY modelId",
    ),
  );
  assert.equal(counts.length, 2);
  assert(counts.every((c) => Number(c.n) === 1));
});

test("切换成功但用量未知时冻结成功模型费率，模型后续改价不影响待核对单", async (t) => {
  const { f } = await setup(t, [
    { policy: { inputRate: "0.1", cachedRate: "0.05", outputRate: "0.3" } },
    { policy: { inputRate: "2", cachedRate: "1", outputRate: "6" } },
  ]);
  const generate = f.provider.generate;
  f.setBehavior("unknown");
  f.provider.generate = async (config, ...args) => {
    if (config.model === "model-0") throw fail();
    return generate(config, ...args);
  };
  const start = await f.user.api("/ai/grade", "POST", f.input());
  const result = await f.settled(f.user, start.data.run.id);
  assert.equal(result.billingStatus, "pending");
  assert.equal(result.actualRates.outputRate, "6");
  const p = (await f.admin.api(url)).data.pool;
  p.providers[1].models[0].policy.outputRate = "9";
  assert.equal((await f.admin.api(url, "PUT", body(p))).status, 200);
  const unit = await f.ai.repo.read((db) => f.ai.billing.unit(db, result.id));
  assert.equal(unit.rates.outputRate, "6");
  assert.equal(unit.tariffs[1].rates.outputRate, "6");
});

test("旧历史计数用独立列还原身份，重复初始化不覆盖额度、不重复计数", async (t) => {
  const { f } = await setup(t);
  const started = await f.user.api("/ai/grade", "POST", f.input());
  const run = await f.settled(f.user, started.data.run.id);
  const balance = (await f.user.api("/ai/status")).data.account.available;
  await f.ai.repo.transaction(async (db) => {
    const row = await db.get("SELECT data FROM ai_runs WHERE id=?", run.id),
      data = JSON.parse(row.data);
    delete data.id;
    delete data.userId;
    delete data.questionId;
    delete data.feature;
    delete data.createdAt;
    await db.run(
      "UPDATE ai_runs SET data=? WHERE id=?",
      JSON.stringify(data),
      run.id,
    );
    await db.run("DELETE FROM ai_model_invocations WHERE runId=?", run.id);
    await db.run("DELETE FROM ai_config WHERE id=?", "model-policy-counts-1");
  });
  const restored = new AiPool(f.ai.repo, f.provider, "a".repeat(64));
  await restored.init();
  await restored.init();
  const slots = await f.ai.repo.read((db) =>
    db.all("SELECT * FROM ai_model_invocations WHERE runId=?", run.id),
  );
  assert.equal(slots.length, 1);
  assert.equal(slots[0].userId, f.user.user.id);
  assert.equal(slots[0].questionId, f.question.id);
  assert.equal(slots[0].feature, "grade");
  assert.equal(
    (await f.user.api("/ai/status")).data.account.available,
    balance,
  );
});

test("切换模型的数据库事务失败时释放并发名额，不发送未记账的上游请求", async (t) => {
  const { f } = await setup(t, [{}, {}]);
  const generate = f.provider.generate,
    seen = [];
  f.provider.generate = async (config, ...args) => {
    seen.push(config.model);
    if (config.model === "model-0") throw fail();
    return generate(config, ...args);
  };
  const transaction = f.ai.repo.transaction.bind(f.ai.repo);
  t.after(() => (f.ai.repo.transaction = transaction));
  f.ai.repo.transaction = (callback) =>
    transaction(async (db) => {
      const result = await callback(db);
      if (result?.target?.model === "model-1")
        throw Error("模拟并发名额获取后的事务提交失败");
      return result;
    });
  const start = await f.user.api("/ai/grade", "POST", f.input());
  const result = await f.settled(f.user, start.data.run.id);
  assert.equal(result.status, "released");
  assert.equal(result.chargedPoints, "0");
  assert.deepEqual(seen, ["model-0"]);
  assert.equal(f.ai.pool.active.size, 0);
  const slots = await f.ai.repo.read((db) =>
    db.all("SELECT * FROM ai_model_invocations"),
  );
  assert.equal(slots.length, 1);
});
