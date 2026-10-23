import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./helpers/ai.mjs";
import {
  micro,
  points,
  usageCharge,
  procurementCost,
} from "../server/ai/amounts.mjs";
const policy = (mode = "exempt", patch = {}) => ({
  mode,
  freeDays: 30,
  dailyBudget: null,
  note: "用于验证用户计费资格",
  operationId: randomUUID(),
  ...patch,
});
async function gift(f, amount, validDays = null) {
  const r = await f.admin.api("/admin/ai/credits", "POST", {
    userId: f.user.user.id,
    amount,
    validDays,
    note: "批次额度测试发放",
    operationId: randomUUID(),
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
async function run(f, extra = "") {
  const r = await f.user.api("/ai/grade", "POST", {
    ...f.input(),
    answer: f.input().answer + extra,
  });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  return f.settled(f.user, r.data.run.id);
}
const product = () => ({
  code: "starter",
  name: "学习资源包",
  price: "9.90",
  credits: "500",
  bonus: "50",
  validDays: 180,
  description: "用于 AI 学习辅助",
  tag: "体验",
  sort: 0,
  note: "资源包首个配置版本",
});
async function publish(f, input = product()) {
  const saved = await f.admin.api("/admin/ai/products", "POST", input);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/products/" + saved.data.id + "/publish",
        "POST",
        { revision: saved.data.revision, publish: true },
      )
    ).status,
    200,
  );
  return (await f.admin.api("/admin/ai/products")).data.rows.find(
    (p) => p.id === saved.data.id,
  );
}
function invariant(lots) {
  for (const l of lots)
    assert.equal(
      micro(l.granted),
      ["available", "reserved", "consumed", "expired", "revoked"].reduce(
        (v, k) => v + micro(l[k]),
        0n,
      ),
      l.id,
    );
}

test("额度与人民币采购价精确计算，缓存和推理不重复计数", () => {
  assert.equal(
    points(
      usageCharge(
        { input: 1000, cached: 0, output: 500 },
        { inputRate: 1, cachedRate: 1, outputRate: 3 },
      ),
    ),
    "2.5",
  );
  assert.equal(
    procurementCost(
      { input: 1000000, cached: 200000, output: 500000 },
      { input: "2.5", cached: "1", output: "10" },
    ),
    "7.2",
  );
  assert.equal(
    points(micro("0.000001") + micro("999999999.999999")),
    "1000000000",
  );
  for (const x of ["0.0000001", "NaN", "-1", "1e3", "1000000001"])
    assert.throws(() => micro(x));
});
test("免费用户余额为零可使用，免扣仍记应扣、用量、资格期限与独立审计", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const publicStatus = (await f.user.api("/ai/status")).data;
  assert.equal(publicStatus.tariff.inputRate, 1);
  assert.equal(publicStatus.tariff.outputRate, 3);
  assert.equal(publicStatus.budgets.maxTaskPoints, "90");
  assert(!JSON.stringify(publicStatus).includes("apiKey"));
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/users/" + f.user.user.id + "/billing-policy",
        "PUT",
        policy(),
      )
    ).status,
    200,
  );
  const r = await run(f);
  assert.equal(r.status, "succeeded");
  assert.equal(r.billingMode, "exempt");
  assert.equal(r.chargedPoints, "0");
  assert.equal(r.waivedPoints, "0.7");
  assert.equal(r.duePoints, "0.7");
  const d = (await f.user.api("/ai/credits")).data;
  assert.equal(d.account.available, "0");
  assert.equal(d.account.reserved, "0");
  assert.equal(d.lots.length, 0);
  assert(d.rows.some((x) => x.kind === "waive"));
  assert.equal((await f.user.api("/bootstrap")).data.state.attempts.length, 1);
});
test("免费资格修改与到期仅影响新调用，预占期间赠送不会改写当次身份", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.admin.api(
    "/admin/ai/users/" + f.user.user.id + "/billing-policy",
    "PUT",
    policy("exempt", { freeDays: 1 }),
  );
  f.setDelay(150);
  const start = await f.user.api("/ai/grade", "POST", f.input());
  assert.equal(start.status, 202);
  await f.admin.api(
    "/admin/ai/users/" + f.user.user.id + "/billing-policy",
    "PUT",
    policy("paid"),
  );
  assert.equal((await f.settled(f.user, start.data.run.id)).chargedPoints, "0");
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...f.input(),
        answer: f.input().answer + "新的调用恢复普通计费",
      })
    ).status,
    402,
  );
  await f.admin.api(
    "/admin/ai/users/" + f.user.user.id + "/billing-policy",
    "PUT",
    policy("exempt", { freeDays: 1 }),
  );
  f.ai.billing.clock = () => Date.now() + 2 * 86400000;
  assert.equal((await f.user.api("/ai/status")).data.account.exempt, false);
});
test("免费仍受预算、封禁与频率限制；未知用量不冻结个人账户", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.admin.api(
    "/admin/ai/users/" + f.user.user.id + "/billing-policy",
    "PUT",
    policy("exempt", { dailyBudget: "1" }),
  );
  assert.equal((await f.user.api("/ai/grade", "POST", f.input())).status, 429);
  await f.admin.api(
    "/admin/ai/users/" + f.user.user.id + "/billing-policy",
    "PUT",
    policy(),
  );
  f.setBehavior("unknown");
  const r = await run(f);
  assert.equal(r.status, "succeeded");
  assert.equal(r.billingStatus, "waived");
  assert.equal(r.duePoints, null);
  assert.equal((await f.user.api("/ai/status")).data.available, true);
  await f.admin.api("/admin/ai/users/" + f.user.user.id + "/block", "POST", {
    blocked: true,
  });
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...f.input(),
        answer: f.input().answer + "被封禁的免费用户也不能使用",
      })
    ).status,
    403,
  );
});
test("发放幂等、精度校验、身份与 CSRF 边界，不能伪造付费发放", async (t) => {
  const f = await fixture(t);
  const body = {
    userId: f.user.user.id,
    amount: "10.125001",
    validDays: 3,
    note: "精确额度批次发放",
    operationId: randomUUID(),
  };
  const replies = await Promise.all([
    f.admin.api("/admin/ai/credits", "POST", body),
    f.admin.api("/admin/ai/credits", "POST", body),
  ]);
  assert(replies.every((r) => r.status === 200));
  const d = (await f.user.api("/ai/credits")).data;
  assert.equal(d.account.available, "10.125001");
  assert.equal(d.lots.length, 1);
  invariant(d.lots);
  assert.equal(
    (await f.admin.api("/admin/ai/credits", "POST", { ...body, amount: "11" }))
      .status,
    409,
  );
  assert.equal(
    (
      await f.admin.api("/admin/ai/credits", "POST", {
        ...body,
        amount: "0.0000001",
        operationId: randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.user.api("/admin/ai/credits", "POST", body)).status,
    403,
  );
  assert.equal(
    (
      await f.admin.api("/admin/ai/credits", "POST", body, {
        "X-CSRF-Token": "bad",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.admin.api("/admin/ai/credits", "POST", {
        ...body,
        source: "purchase",
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.other.api("/admin/ai/users/" + f.user.user.id + "/credits"))
      .status,
    403,
  );
});
test("商品草稿与发布版本隔离，按旧版本发放保持额度与到期快照", async (t) => {
  const f = await fixture(t),
    first = await publish(f);
  const version = first.published.versionId;
  assert.equal(first.published.priceFen, "990");
  const catalog = (await f.user.api("/ai/products")).data.rows;
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].published.note, undefined);
  assert.equal(catalog[0].published.priceFen, undefined);
  const edited = await f.admin.api("/admin/ai/products", "POST", {
    ...product(),
    id: first.id,
    revision: first.revision,
    credits: "800",
    validDays: 90,
  });
  assert.equal(edited.status, 200);
  let current = (await f.admin.api("/admin/ai/products")).data.rows[0];
  assert.equal(current.published.credits, "500");
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/products/" + current.id + "/publish",
        "POST",
        { revision: current.revision, publish: true },
      )
    ).status,
    200,
  );
  const granted = await f.admin.api("/admin/ai/credits", "POST", {
    userId: f.user.user.id,
    productVersionId: version,
    note: "按旧版资源包发放",
    operationId: randomUUID(),
  });
  assert.equal(granted.status, 200);
  let d = (await f.user.api("/ai/credits")).data;
  assert.equal(d.account.available, "550");
  assert.equal(d.lots.length, 2);
  assert.equal(d.lots[0].data.actorId, undefined);
  assert.equal(d.lots[0].data.product.note, undefined);
  assert(
    d.lots.every(
      (l) => l.data.product.version === 1 && l.data.product.validDays === 180,
    ),
  );
  invariant(d.lots);
  current = (await f.admin.api("/admin/ai/products")).data.rows[0];
  assert.equal(current.published.version, 2);
  await f.admin.api("/admin/ai/products/" + current.id + "/publish", "POST", {
    revision: current.revision,
    publish: false,
  });
  assert.equal((await f.user.api("/ai/products")).data.rows.length, 0);
  assert.equal((await f.user.api("/ai/credits")).data.account.available, "550");
});
test("即将过期优先与跨包扣费，分摊不重复计算用量，一次冲正回到原批次", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await gift(f, "0.3", 1);
  await gift(f, "0.4", 2);
  await gift(f, "50");
  const r = await run(f);
  assert.equal(r.chargedPoints, "0.7");
  let d = (await f.user.api("/ai/credits")).data;
  assert.equal(d.account.available, "50");
  assert.equal(d.lots[0].consumed, "0.3");
  assert.equal(d.lots[1].consumed, "0.4");
  const settlement = d.rows.find((x) => x.kind === "settle");
  assert.equal(
    settlement.allocations.filter((a) => Number(a.charged) > 0).length,
    2,
  );
  invariant(d.lots);
  const reverse = { note: "已核实结果需要人工退款", operationId: randomUUID() };
  assert.equal(
    (await f.admin.api("/admin/ai/runs/" + r.id + "/reverse", "POST", reverse))
      .status,
    200,
  );
  assert.equal(
    (await f.admin.api("/admin/ai/runs/" + r.id + "/reverse", "POST", reverse))
      .status,
    200,
  );
  assert.equal(
    (
      await f.admin.api("/admin/ai/runs/" + r.id + "/reverse", "POST", {
        ...reverse,
        operationId: randomUUID(),
      })
    ).status,
    409,
  );
  d = (await f.user.api("/ai/credits")).data;
  assert.equal(d.account.available, "50.7");
  assert.equal(d.lots[0].consumed, "0");
  invariant(d.lots);
});
test("调用中跨过批次到期：实际消费可核销，释放差额进入过期而非重新可用", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const start = Date.now();
  f.ai.billing.clock = () => start;
  await gift(f, "20", 1);
  f.ai.billing.clock = () => start + 86400000 - 10;
  f.setDelay(100);
  const submitted = await f.user.api("/ai/grade", "POST", f.input());
  assert.equal(submitted.status, 202);
  f.ai.billing.clock = () => start + 86400000 + 10;
  const r = await f.settled(f.user, submitted.data.run.id);
  assert.equal(r.chargedPoints, "0.7");
  const d = (await f.user.api("/ai/credits")).data;
  assert.equal(d.account.available, "0");
  assert.equal(d.lots[0].expired, "19.3");
  assert.equal(d.lots[0].consumed, "0.7");
  invariant(d.lots);
  await f.admin.api("/admin/ai/runs/" + r.id + "/reverse", "POST", {
    note: "到期后核对的消费冲正",
    operationId: randomUUID(),
  });
  const after = (await f.user.api("/ai/credits")).data;
  assert.equal(after.account.available, "0");
  assert.equal(after.lots[0].expired, "20");
  invariant(after.lots);
});
test("有效结果未知用量：保留预占但记学习结果，核对超时自动释放且不延长有效期", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await gift(f, "20", 1);
  f.setBehavior("unknown");
  const r = await run(f);
  assert.equal(r.status, "succeeded");
  assert.equal(r.billingStatus, "pending");
  assert.equal((await f.user.api("/bootstrap")).data.state.attempts.length, 1);
  assert.equal((await f.user.api("/ai/status")).data.available, false);
  f.ai.billing.clock = () => Date.now() + 25 * 3600000;
  await f.ai.billing.recovery();
  const d = (await f.user.api("/ai/credits")).data;
  assert.equal(d.account.reserved, "0");
  assert.equal(d.account.available, "0");
  assert.equal(d.lots[0].expired, "20");
  invariant(d.lots);
  assert.equal(
    (await f.user.api("/ai/runs/" + r.id)).data.billingStatus,
    "released",
  );
  const released = (await f.user.api("/ai/runs/" + r.id)).data;
  assert.equal(released.status, "succeeded");
  assert.equal(released.duePoints, null);
  assert.equal(released.chargedPoints, "0");
  assert.match(d.rows.find((x) => x.kind === "release").note, /核对超时/);
});
for (const recovery of ["manual", "timeout"]) {
  test(`进程中断的面试任务${recovery === "manual" ? "人工释放" : "核对超时"}后允许重试当前轮次`, async (t) => {
    const f = await fixture(t);
    await f.configure();
    await gift(f, "20");
    const started = await f.user.api("/ai/interviews", "POST", {
      mode: "practice",
      difficulty: "进阶",
      count: 2,
      moduleId: "",
    });
    assert.equal(started.status, 200);
    const id = randomUUID();
    // Reconstruct the committed pre-call state left by a killed process.
    // No provider call is made for this interrupted request.
    await f.ai.repo.transaction(async (db) => {
      const session = await f.ai.repo.sessionRaw(
        started.data.id,
        f.user.user.id,
        db,
      );
      const { targets, ...config } = await f.ai.pool.snapshot(db, "interview");
      const run = {
        id,
        userId: f.user.user.id,
        requestKey: randomUUID(),
        fingerprint: randomUUID(),
        feature: "interview",
        status: "running",
        sessionId: session.id,
        questionId: session.currentQuestionId,
        lessonId: session.currentLessonId,
        input: { answer: "用于验证进程恢复的面试回答" },
        config,
        createdAt: new Date(Date.now() - 180000).toISOString(),
      };
      Object.assign(
        run,
        await f.ai.billing.reserve(db, run, config, [
          { role: "user", content: "面试" },
        ]),
      );
      await f.ai.repo.insertRun(db, run);
      session.activeRunId = id;
      await f.ai.repo.saveSession(db, session);
    });
    await f.ai.repo.recoverExpired();
    if (recovery === "manual") {
      const response = await f.admin.api(
        "/admin/ai/runs/" + id + "/reconcile",
        "POST",
        {
          points: "0",
          note: "进程中断未交付结果，释放本次预占",
        },
      );
      assert.equal(response.status, 200, JSON.stringify(response.data));
    } else {
      f.ai.billing.clock = () => Date.now() + 25 * 3600000;
      await f.ai.billing.recovery();
      f.ai.billing.clock = Date.now;
    }
    const session = await f.ai.repo.read((db) =>
      f.ai.repo.sessionRaw(started.data.id, f.user.user.id, db),
    );
    assert.equal(session.activeRunId, "");
    assert.equal(session.turns.length, 0);
    assert.equal(
      (await f.user.api("/ai/credits")).data.account.available,
      "20",
    );
    const retry = await f.user.api(
      "/ai/interviews/" + session.id + "/turns",
      "POST",
      {
        answer:
          "我会先明确事务边界与外部副作用，再使用唯一操作标识验证重复提交是否幂等。",
        turn: 0,
        requestId: randomUUID(),
      },
    );
    assert.equal(retry.status, 202, JSON.stringify(retry.data));
    await f.settled(f.user, retry.data.run.id);
  });
}
test("预占不能被并发赠送或收回破坏，撤回仅针对有效可用部分", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await gift(f, "20");
  const lot = (await f.user.api("/ai/credits")).data.lots[0];
  f.setDelay(150);
  const started = await f.user.api("/ai/grade", "POST", f.input());
  assert.equal(started.status, 202);
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/users/" + f.user.user.id + "/credits/" + lot.id + "/revoke",
        "POST",
        {
          amount: "20",
          note: "不能撤回已预占的额度",
          operationId: randomUUID(),
        },
      )
    ).status,
    400,
  );
  await f.settled(f.user, started.data.run.id);
  const action = {
    amount: "2.3",
    note: "撤回未使用额度测试",
    operationId: randomUUID(),
  };
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/users/" + f.user.user.id + "/credits/" + lot.id + "/revoke",
        "POST",
        action,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/users/" + f.user.user.id + "/credits/" + lot.id + "/revoke",
        "POST",
        action,
      )
    ).status,
    200,
  );
  const d = (await f.user.api("/ai/credits")).data;
  assert.equal(d.account.available, "17");
  assert.equal(d.lots[0].revoked, "2.3");
  invariant(d.lots);
});
test("历史余额与未核对预占迁移保持权益，重复查询不会重复发放", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const userId = f.user.user.id;
  await f.ai.repo.transaction(async (db) => {
    await f.ai.repo.account(db, userId, true);
    await db.run(
      "UPDATE ai_accounts SET balance=?,reserved=? WHERE userId=?",
      100,
      10,
      userId,
    );
    await f.ai.repo.insertRun(db, {
      id: randomUUID(),
      userId,
      requestKey: randomUUID(),
      fingerprint: "legacy",
      feature: "grade",
      status: "pending",
      createdAt: new Date().toISOString(),
      reservedPoints: 10,
      config: { inputRate: 1, cachedRate: 1, outputRate: 3 },
      input: {},
      result: null,
    });
  });
  const first = (await f.user.api("/ai/credits")).data;
  assert.equal(first.account.available, "90");
  assert.equal(first.account.reserved, "10");
  assert.equal(first.lots.length, 1);
  assert.equal(first.lots[0].expiresAt, "");
  invariant(first.lots);
  const second = (await f.user.api("/ai/credits")).data;
  assert.equal(second.lots.length, 1);
  assert.equal(second.rows.filter((x) => x.kind === "migration").length, 1);
});
test("超额上游用量按预占封顶，所有失败不扣费但仍消耗防滥用预算", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await gift(f, "100");
  const generate = f.provider.generate;
  f.provider.generate = async (...args) => ({
    ...(await generate(...args)),
    usage: {
      input: 100000,
      cached: 0,
      output: 100000,
      total: 200000,
      reasoning: 0,
    },
  });
  const r = await run(f);
  assert.equal(r.chargeCapped, true);
  assert.equal(r.chargedPoints, r.quotedPoints);
  assert.equal((await f.user.api("/ai/status")).data.account.reserved, "0");
});

test("技术失败不扣用户额度，但仍占用反滥用预算和题目调用次数", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await gift(f, "100");
  f.setBehavior("bad");
  const r = await run(f);
  assert.equal(r.status, "released");
  assert.equal(r.chargedPoints, "0");
  const unit = await f.ai.repo.read((db) => f.ai.billing.unit(db, r.id));
  assert(BigInt(unit.budgetUsed) > 0n);
  assert.equal((await f.user.api("/ai/status")).data.account.available, "100");
  const setting = await f.admin.api("/admin/ai/billing-settings");
  assert.equal(
    (
      await f.admin.api("/admin/ai/billing-settings", "PUT", {
        ...setting.data,
        dailyBudget: "1",
      })
    ).status,
    200,
  );
  const p = await f.ai.pool.admin();
  await f.ai.pool.reset(f.admin.user.id, p.providers[0].id);
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...f.input(),
        answer: f.input().answer + "新的失败请求仍受预算限制",
      })
    ).status,
    429,
  );
});

test("资源包发布提示价格倒挂，采购价快照和实际账单核对保持独立", async (t) => {
  const f = await fixture(t);
  await publish(f, {
    ...product(),
    credits: "1000",
    bonus: "0",
    price: "9.90",
  });
  const x = await f.admin.api("/admin/ai/products", "POST", {
    ...product(),
    code: "larger",
    credits: "2000",
    bonus: "0",
    price: "30",
  });
  const pub = await f.admin.api(
    "/admin/ai/products/" + x.data.id + "/publish",
    "POST",
    { revision: x.data.revision, publish: true },
  );
  assert.equal(pub.status, 200);
  assert(pub.data.warnings.length >= 1);
  await f.configure();
  let p = (await f.admin.api("/admin/ai/pool")).data.pool;
  const providers = p.providers.map(({ hasKey, ...provider }) => ({
    ...provider,
    models: provider.models.map((m) => ({
      ...m,
      procurement: { input: "2", cached: "1", output: "8" },
    })),
  }));
  assert.equal(
    (
      await f.admin.api("/admin/ai/pool", "PUT", {
        revision: p.revision,
        policy: p.policy,
        providers,
      })
    ).status,
    200,
  );
  await gift(f, "100");
  const r = await run(f),
    raw = (await f.admin.api("/admin/ai/runs/" + r.id)).data;
  assert.equal(raw.estimatedCostCny, "0.00178");
  assert.equal(raw.costIncomplete, false);
  const reviewed = await f.admin.api(
    "/admin/ai/runs/" + r.id + "/cost-review",
    "POST",
    { note: "按真实账单核对采购成本", costCny: "0.0017" },
  );
  assert.equal(reviewed.status, 200);
  assert.equal(
    (await f.admin.api("/admin/ai/runs/" + r.id)).data.upstreamCostReview
      .actualCostCny,
    "0.0017",
  );
  assert.equal((await f.user.api("/ai/status")).data.account.available, "99.3");
});
