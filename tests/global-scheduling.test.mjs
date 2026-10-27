import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./helpers/ai.mjs";
import { AiError } from "../server/ai/policy.mjs";
import { effectivePolicy } from "../server/ai/model-policy.mjs";

const scheduling = (revision, patch = {}) => ({
  revision,
  maxAttempts: 2,
  attemptTimeoutMs: 25000,
  totalTimeoutMs: 80000,
  ...patch,
});

test("模型残留的超时和尝试次数不覆盖全局策略；修改保留模型费率和旧字段", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const pool = (await f.admin.api("/admin/ai/pool")).data.pool;
  const provider = pool.providers[0],
    model = provider.models[0];
  await f.ai.repo.transaction(async (db) => {
    const raw = await f.ai.pool.raw(db);
    raw.providers[0].models[0].policy = {
      ...raw.policy,
      inputRate: "0.125",
      outputLimit: 1024,
      maxAttempts: 1,
      attemptTimeoutMs: 60000,
      totalTimeoutMs: 90000,
    };
    await f.ai.pool.put(db, "pool", raw);
  });
  const old = (await f.admin.api("/admin/ai/pool")).data.pool;
  assert.equal(old.providers[0].models[0].policy.inputRate, "0.125");
  for (const key of ["maxAttempts", "attemptTimeoutMs", "totalTimeoutMs"])
    assert.equal(old.providers[0].models[0].policy[key], undefined);
  const changed = await f.admin.api(
    "/admin/ai/scheduling",
    "PUT",
    scheduling(old.revision),
  );
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.pool.policy.maxAttempts, 2);
  assert.equal(
    changed.data.pool.providers[0].models[0].policy.outputLimit,
    1024,
  );
  assert.equal(
    changed.data.pool.providers[0].models[0].policy.inputRate,
    "0.125",
  );
  const raw = await f.ai.repo.read((db) => f.ai.pool.raw(db));
  assert.equal(raw.providers[0].models[0].policy.maxAttempts, 1); // no destructive migration
  const effective = effectivePolicy(raw.providers[0].models[0], raw.policy);
  assert.equal(effective.maxAttempts, 2);
  assert.equal(effective.attemptTimeoutMs, 25000);
  assert.equal(effective.totalTimeoutMs, 80000);
  assert.equal(effective.outputLimit, 1024);
  const oldClient = await f.admin.api("/admin/ai/pool", "PUT", {
    revision: changed.data.pool.revision,
    policy: changed.data.pool.policy,
    providers: [
      {
        ...provider,
        hasKey: undefined,
        models: [{ ...model, policy: raw.providers[0].models[0].policy }],
      },
    ],
  });
  assert.equal(oldClient.status, 200, JSON.stringify(oldClient.data));
  assert.equal(
    oldClient.data.pool.providers[0].models[0].policy.maxAttempts,
    undefined,
  );
  assert.equal(
    oldClient.data.pool.providers[0].models[0].policy.inputRate,
    "0.125",
  );
});

test("统一设置只允许管理员和有效 CSRF，校验范围、冲突、审计，不重置健康状态", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const pool = (await f.admin.api("/admin/ai/pool")).data.pool;
  const id = pool.providers[0].id;
  const failure = new AiError(502, "限流", "AI_PROVIDER_HTTP");
  failure.upstreamStatus = 429;
  const target = (await f.ai.repo.read((db) => f.ai.pool.snapshot(db, "grade")))
    .targets[0];
  await f.ai.pool.outcome(target, failure);
  assert.equal(f.ai.pool.health.get(id).reason, "服务商限流");
  assert.equal(
    (await f.user.api("/admin/ai/scheduling", "PUT", scheduling(pool.revision)))
      .status,
    403,
  );
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/scheduling",
        "PUT",
        scheduling(pool.revision),
        { "X-CSRF-Token": "invalid" },
      )
    ).status,
    403,
  );
  for (const invalid of [
    { maxAttempts: 0 },
    { maxAttempts: 4 },
    { attemptTimeoutMs: 9999 },
    { totalTimeoutMs: 90001 },
    { attemptTimeoutMs: 30000, totalTimeoutMs: 20000 },
    { maxAttempts: "2" },
    { unexpected: true },
  ])
    assert.equal(
      (
        await f.admin.api(
          "/admin/ai/scheduling",
          "PUT",
          scheduling(pool.revision, invalid),
        )
      ).status,
      400,
    );
  const saved = await f.admin.api(
    "/admin/ai/scheduling",
    "PUT",
    scheduling(pool.revision),
  );
  assert.equal(saved.status, 200);
  assert.equal(f.ai.pool.health.get(id).reason, "服务商限流");
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/scheduling",
        "PUT",
        scheduling(pool.revision),
      )
    ).status,
    409,
  );
  const audits = await f.ai.repo.read((db) =>
    db.all("SELECT * FROM admin_audit WHERE action=?", "ai.scheduling.save"),
  );
  assert.equal(audits.length, 1);
  assert(!JSON.stringify(audits).includes("server-only-key"));
});

test("进行中的任务在切换模型时继续使用启动时的统一配置，后续任务使用新配置", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  let pool = (await f.admin.api("/admin/ai/pool")).data.pool;
  const first = pool.providers[0];
  pool.providers.push({
    ...first,
    id: randomUUID(),
    name: "备用服务商",
    apiKey: "server-only-key",
    models: [
      {
        ...first.models[0],
        id: randomUUID(),
        model: "second-model",
        priority: 1,
      },
    ],
  });
  const saved = await f.admin.api("/admin/ai/pool", "PUT", {
    revision: pool.revision,
    policy: pool.policy,
    providers: pool.providers.map(({ hasKey, ...p }) => p),
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  pool = saved.data.pool;
  const oldGlobal = await f.admin.api(
    "/admin/ai/scheduling",
    "PUT",
    scheduling(pool.revision),
  );
  assert.equal(oldGlobal.status, 200);
  let release, entered;
  const gate = new Promise((resolve) => (release = resolve));
  const started = new Promise((resolve) => (entered = resolve));
  t.after(() => release());
  const generate = f.provider.generate,
    calls = [];
  f.provider.generate = async (config, ...args) => {
    calls.push({
      model: config.model,
      timeout: config.timeoutMs,
      maxAttempts: config.maxAttempts,
      totalTimeoutMs: config.totalTimeoutMs,
    });
    if (calls.length === 1) {
      entered();
      await gate;
      const e = new AiError(502, "临时失败", "AI_PROVIDER_HTTP");
      e.upstreamStatus = 503;
      e.noCharge = true;
      throw e;
    }
    return generate(config, ...args);
  };
  const call = await f.user.api("/ai/grade", "POST", f.input());
  assert.equal(call.status, 202);
  await started;
  const edited = await f.admin.api(
    "/admin/ai/scheduling",
    "PUT",
    scheduling(oldGlobal.data.pool.revision, {
      maxAttempts: 1,
      attemptTimeoutMs: 10000,
      totalTimeoutMs: 20000,
    }),
  );
  assert.equal(edited.status, 200);
  release();
  const finished = await f.settled(f.user, call.data.run.id);
  assert.equal(finished.status, "succeeded", JSON.stringify(finished));
  assert.equal(calls.length, 2);
  for (const attempt of calls) {
    assert.equal(attempt.maxAttempts, 2);
    assert.equal(attempt.totalTimeoutMs, 80000);
    assert(attempt.timeout <= 25000 && attempt.timeout > 20000);
  }
  const detail = (await f.admin.api("/admin/ai/runs/" + call.data.run.id)).data;
  assert.equal(detail.config.maxAttempts, 2);
  assert.equal(detail.config.attemptTimeoutMs, 25000);
  for (const p of edited.data.pool.providers)
    await f.ai.pool.reset(f.admin.user.id, p.id);
  const after = [];
  f.provider.generate = async (config) => {
    after.push(config);
    const e = new AiError(502, "临时失败", "AI_PROVIDER_HTTP");
    e.upstreamStatus = 503;
    e.noCharge = true;
    throw e;
  };
  const next = await f.user.api("/ai/grade", "POST", {
    ...f.input(),
    answer: f.input().answer + "再补充一个不同的边界。",
  });
  assert.equal(next.status, 202);
  await f.settled(f.user, next.data.run.id);
  assert.equal(after.length, 1);
  assert.equal(after[0].maxAttempts, 1);
  assert.equal(after[0].totalTimeoutMs, 20000);
  assert(after[0].timeoutMs <= 10000);
});
