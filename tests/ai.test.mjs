import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.mjs";
import {
  encrypt,
  decrypt,
  normalizeUsage,
  charge,
  dimensions,
  AiError,
} from "../server/ai/policy.mjs";
import { AiPool, failurePolicy } from "../server/ai/pool.mjs";
import { publicAddress } from "../server/ai/provider.mjs";
import { mysqlFixture } from "./helpers/mysql.mjs";

const good = (answer) => ({
  relevance: "on_topic",
  summary: "结论正确，需要补充可验证的边界条件。",
  dimensions: dimensions.map((name) => ({
    name,
    score: 80,
    note: "能解释主要机制和边界。",
  })),
  covered: ["主要机制"],
  missing: ["具体反例"],
  errors: [],
  suggestions: ["补一个失败场景"],
  evidence: [answer.slice(0, 10)],
  followUp: "如果并发请求失败，应如何验证这个结论？",
});
const settings = {
  name: "测试服务",
  baseUrl: "https://api.example.com/v1",
  protocol: "chat",
  model: "mock-model",
  gradingModel: "",
  interviewModel: "",
  variantsModel: "",
  apiKey: "server-only-key",
  format: "schema",
  outputLimit: 2048,
  inputRate: 1,
  cachedRate: 1,
  outputRate: 3,
  dailyRuns: 100,
  siteDailyRuns: 1000,
  perQuestionRuns: 10,
};
async function fixture(t) {
  let calls = 0,
    delay = 0,
    behavior = "good";
  const provider = {
    async validate() {},
    async models() {
      return ["mock-model", "mock-model-2"];
    },
    async generate(config, key, messages, schema, signal, onSend) {
      assert.equal(key, "server-only-key");
      calls++;
      onSend();
      if (delay)
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delay);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              const e = Error("abort");
              e.sent = true;
              reject(e);
            },
            { once: true },
          );
        });
      const user =
        messages.length > 1 ? JSON.parse(messages.at(-1).content) : {};
      let value = good(user.candidateAnswer || "测试标准回答内容符合要求");
      if (messages[0].content.includes("全新场景迁移题"))
        value = {
          questions: Array.from({ length: 1 }, (_, i) => ({
            prompt:
              "一个独立服务在并发更新时出现重复处理，请设计可验证的幂等方案并分析失败边界。" +
              i,
            answer:
              "先定义操作标识和唯一约束，在事务内检查并写入结果，明确首次执行与重放的行为。对于外部副作用，需要幂等键、状态确认和补偿流程，不能把本地事务提交等同于外部动作完成。",
            rubric: [
              "解释业务操作标识",
              "说明事务及唯一约束",
              "区分外部副作用与本地提交",
            ],
            keywords: ["幂等", "事务"],
          })),
        };
      if (messages[0].content.includes("当前面试回答"))
        value = {
          evaluation: value,
          action: "followup",
          followUp: "若同一操作重试，你会如何检查它是否已成功？",
        };
      if (messages.length === 1) value = { ok: true };
      return {
        text:
          behavior === "bad"
            ? '{"arbitrary":"不应接受"}'
            : JSON.stringify(value),
        complete: true,
        actualModel: "mock-actual",
        requestId: "upstream-id",
        usage:
          behavior === "unknown"
            ? null
            : {
                input: 100,
                output: 200,
                cached: 20,
                reasoning: 30,
                total: 300,
              },
      };
    },
  };
  const mysql = process.env.TEST_MYSQL === "1" ? await mysqlFixture() : null;
  const built = await createApp({
    ...(mysql ? { store: mysql.store } : { dbPath: ":memory:" }),
    aiOptions: { encryptionKey: "a".repeat(64), provider },
  });
  const server = built.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await built.ai.shutdown();
    await new Promise((r) => server.close(r));
    if (mysql) await mysql.cleanup();
    else await built.store.close();
  });
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  async function client(username) {
    let cookie = "",
      csrf = "";
    const api = async (path, method = "GET", body, headers = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (res.headers.get("set-cookie"))
        cookie = res.headers.get("set-cookie").split(";")[0];
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: res.status, data };
    };
    const user = (
      await api("/auth/register", "POST", {
        username,
        password: "test-password-123",
      })
    ).data.user;
    return { api, user };
  }
  const admin = await client("admin"),
    user = await client("learner"),
    other = await client("other");
  await built.store.session(() =>
    built.store.run(
      "INSERT INTO auth_roles(userId,role) VALUES(?,?)",
      admin.user.id,
      "admin",
    ),
  );
  async function configure() {
    assert.equal(
      (await admin.api("/admin/ai/config", "PUT", settings)).status,
      200,
    );
  }
  async function grant(target = user, amount = 10000) {
    return admin.api("/admin/ai/credits", "POST", {
      userId: target.user.id,
      amount,
      note: "测试额度发放",
      operationId: randomUUID(),
    });
  }
  async function settled(target, id) {
    for (let i = 0; i < 200; i++) {
      const run = (await target.api("/ai/runs/" + id)).data;
      if (run.status !== "running") return run;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw Error("task timeout");
  }
  const catalog = (await user.api("/bootstrap")).data.catalog;
  const question = catalog.questions.find((q) => q.type === "scenario");
  const input = () => ({
    questionId: question.id,
    answer:
      "我会先明确业务边界，再验证事件顺序与失败条件，避免把示例结果当成普遍保证。",
    requestId: randomUUID(),
  });
  return {
    ...built,
    admin,
    user,
    other,
    configure,
    grant,
    settled,
    input,
    question,
    provider,
    setBehavior: (x) => (behavior = x),
    setDelay: (n) => (delay = n),
    calls: () => calls,
  };
}

test("AI 凭据加密、用量分类及公网地址边界", () => {
  const key = "a".repeat(64),
    encoded = encrypt("secret-value", key);
  assert(!encoded.includes("secret-value"));
  assert.equal(decrypt(encoded, key), "secret-value");
  assert.throws(() => decrypt(encoded, "b".repeat(64)));
  assert.throws(() => encrypt("secret", ""));
  const usage = normalizeUsage(
    {
      prompt_tokens: 100,
      completion_tokens: 200,
      prompt_tokens_details: { cached_tokens: 20 },
      completion_tokens_details: { reasoning_tokens: 30 },
    },
    "chat",
  );
  assert.equal(usage.total, 300);
  assert.equal(
    charge(usage, { inputRate: 10, cachedRate: 1, outputRate: 20 }),
    5,
  );
  assert.equal(
    normalizeUsage(
      {
        prompt_tokens: 2,
        completion_tokens: 1,
        prompt_tokens_details: { cached_tokens: 3 },
      },
      "chat",
    ),
    null,
  );
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert(publicAddress("8.8.8.8"));
});
test("只有管理员能配置和发放额度，Key 不进入学习数据", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.user.api("/admin/ai/config")).status, 403);
  assert.equal(
    (await f.user.api("/admin/ai/config", "PUT", settings)).status,
    403,
  );
  await f.configure();
  const config = await f.admin.api("/admin/ai/config");
  assert(config.data.config.hasKey);
  assert(!JSON.stringify(config.data).includes("server-only-key"));
  for (const path of ["/bootstrap", "/export/backup", "/ai/status"])
    assert(
      !JSON.stringify((await f.user.api(path)).data).includes(
        "server-only-key",
      ),
    );
  assert.equal((await f.user.api("/ai/status")).data.account.available, 0);
  assert.equal((await f.user.api("/ai/grade", "POST", f.input())).status, 402);
  assert.equal(f.calls(), 0);
});
test("评阅计量、幂等、缓存、账号隔离及学习记录", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  const input = f.input();
  const first = await f.user.api("/ai/grade", "POST", input);
  assert.equal(first.status, 202, JSON.stringify(first.data));
  const run = await f.settled(f.user, first.data.run.id);
  assert.equal(run.status, "succeeded", JSON.stringify(run));
  assert.equal(run.result.score, 80);
  assert.equal(run.usage.total, 300);
  assert.equal(run.chargedPoints, 1);
  assert.equal((await f.user.api("/ai/status")).data.account.available, 9999);
  assert.equal(
    (await f.user.api("/ai/grade", "POST", input)).data.run.id,
    run.id,
  );
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...input,
        requestId: randomUUID(),
      })
    ).data.run.id,
    run.id,
  );
  assert.equal(f.calls(), 1);
  assert.equal((await f.other.api("/ai/runs/" + run.id)).status, 404);
  assert.equal((await f.other.api("/ai/runs")).data.total, 0);
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...input,
        answer: input.answer + "新内容",
      })
    ).status,
    409,
  );
  const attempts = (await f.user.api("/bootstrap")).data.state.attempts;
  assert.equal(attempts.filter((x) => x.kind === "ai").length, 1);
  const ledger = (await f.user.api("/ai/ledger")).data.rows;
  assert.equal(ledger.filter((x) => x.kind === "settle").length, 1);
  assert.equal(
    (await f.admin.api("/admin/ai/runs/" + run.id)).data.messages.length,
    2,
  );
});
test("额外参数、超长输入、并发及阻塞账号不会调用模型；慢请求不占数据库会话", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  f.setDelay(800);
  for (const extra of [
    { model: "evil" },
    { messages: [] },
    { answer: "a".repeat(3001) },
    { answer: "   " },
  ])
    assert.equal(
      (await f.user.api("/ai/grade", "POST", { ...f.input(), ...extra }))
        .status,
      400,
    );
  assert.equal(f.calls(), 0);
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...f.input(),
        answer: "a".repeat(25000),
      })
    ).status,
    413,
  );
  const run = (await f.user.api("/ai/grade", "POST", f.input())).data.run;
  const started = Date.now();
  assert.equal((await f.other.api("/bootstrap")).status, 200);
  assert(
    Date.now() - started < 600,
    "database session held during model request",
  );
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...f.input(),
        answer: "另一份不同的长回答，用于验证并发任务不会重复消费资源。",
      })
    ).status,
    409,
  );
  await f.settled(f.user, run.id);
  await f.admin.api("/admin/ai/users/" + f.user.user.id + "/block", "POST", {
    blocked: true,
  });
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...f.input(),
        answer: "被暂停的账号不应该触发新的模型请求，此处用于验证限制。",
      })
    ).status,
    403,
  );
});
test("无效模型输出有用量也要记账，但不会成为零分作答；未知用量保留预占并支持一次结算", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  f.setBehavior("bad");
  let run = await f.settled(
    f.user,
    (await f.user.api("/ai/grade", "POST", f.input())).data.run.id,
  );
  assert.equal(run.status, "failed");
  assert.equal(run.chargedPoints, 1);
  assert.equal((await f.user.api("/bootstrap")).data.state.attempts.length, 0);
  f.setBehavior("unknown");
  const pool = await f.ai.pool.admin();
  await f.ai.pool.reset(f.admin.user.id, pool.providers[0].id);
  run = await f.settled(
    f.user,
    (
      await f.user.api("/ai/grade", "POST", {
        ...f.input(),
        answer: "这次验证服务商没有返回用量时，系统不会默认记为免费使用。",
      })
    ).data.run.id,
  );
  assert.equal(run.status, "pending");
  assert.equal(run.usage, null);
  assert((await f.user.api("/ai/status")).data.account.reserved > 0);
  const action = { points: 2, note: "根据服务商控制台核对实际用量" };
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/runs/" + run.id + "/reconcile",
        "POST",
        action,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.admin.api(
        "/admin/ai/runs/" + run.id + "/reconcile",
        "POST",
        action,
      )
    ).status,
    409,
  );
  assert.equal((await f.user.api("/ai/status")).data.account.reserved, 0);
  assert.equal((await f.user.api("/bootstrap")).data.state.attempts.length, 1);
});
test("额度调整幂等、并发预占和取消后的未知用量不会赠送免费调用", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const grant = {
    userId: f.user.user.id,
    amount: 1000,
    note: "可追溯的试用额度",
    operationId: randomUUID(),
  };
  const replies = await Promise.all([
    f.admin.api("/admin/ai/credits", "POST", grant),
    f.admin.api("/admin/ai/credits", "POST", grant),
  ]);
  assert(replies.every((x) => x.status === 200));
  assert.equal((await f.user.api("/ai/status")).data.account.balance, 1000);
  f.setDelay(500);
  const inputs = [
    f.input(),
    {
      ...f.input(),
      answer: "另一种独立的回答，验证同一账号不能并行调用多个模型任务。",
    },
  ];
  const results = await Promise.all(
    inputs.map((x) => f.user.api("/ai/grade", "POST", x)),
  );
  assert.deepEqual(results.map((x) => x.status).sort(), [202, 409]);
  const id = results.find((x) => x.status === 202).data.run.id;
  assert.equal(
    (await f.user.api("/ai/runs/" + id + "/cancel", "POST", {})).status,
    200,
  );
  const run = await f.settled(f.user, id);
  assert.equal(run.status, "pending");
  assert((await f.user.api("/ai/status")).data.account.reserved > 0);
  assert.equal((await f.user.api("/ai/status")).data.available, false);
  assert.equal(f.calls(), 1);
});
test("AI 接口保留 CSRF 和注册权限边界，每题次数限制在服务端执行", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  assert.equal(
    (await f.user.api("/ai/grade", "POST", f.input(), { "X-CSRF-Token": "" }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.user.api("/auth/register", "POST", {
        username: "inject_role",
        password: "test-password",
        role: "admin",
      })
    ).status,
    400,
  );
  await f.admin.api("/admin/ai/config", "PUT", {
    ...settings,
    perQuestionRuns: 1,
  });
  const first = await f.user.api("/ai/grade", "POST", f.input());
  await f.settled(f.user, first.data.run.id);
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...f.input(),
        answer: "修改回答再次请求，但服务端应该限制同题次数，不能绕过页面。",
      })
    ).status,
    429,
  );
  assert.equal(f.calls(), 1);
});
test("连接测试每次实际调用，备份不能伪造题目或恢复资源点", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant(f.admin);
  for (let i = 0; i < 2; i++) {
    const response = await f.admin.api("/admin/ai/test", "POST", {
      requestId: randomUUID(),
    });
    assert.equal(response.status, 202);
    assert.equal(
      (await f.settled(f.admin, response.data.run.id)).status,
      "succeeded",
    );
  }
  assert.equal(f.calls(), 2);
  assert.equal((await f.admin.api("/ai/status")).data.account.balance, 9998);
  const backup = (await f.user.api("/export/backup")).data;
  backup.state.attempts.push({
    questionId: "ai-" + randomUUID(),
    kind: "ai",
    answer: "伪造的题目不能进入模型上下文",
    score: 100,
    passed: true,
    createdAt: new Date().toISOString(),
  });
  assert.equal((await f.user.api("/import", "POST", backup)).status, 400);
  assert.equal((await f.user.api("/ai/status")).data.account.balance, 0);
});
test("结果持久化短暂失败只重试数据库，不重复调用模型或扣减", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  const finish = f.ai.finish.bind(f.ai);
  let writes = 0;
  f.ai.finish = async (...args) => {
    if (++writes === 1) throw Error("temporary persistence failure");
    return finish(...args);
  };
  const response = await f.user.api("/ai/grade", "POST", f.input());
  const run = await f.settled(f.user, response.data.run.id);
  assert.equal(run.status, "succeeded");
  assert.equal(f.calls(), 1);
  assert.equal(writes, 2);
  assert.equal((await f.user.api("/ai/status")).data.account.balance, 9999);
  assert.equal((await f.user.api("/bootstrap")).data.state.attempts.length, 1);
});
test("生成题为用户私有，能继续答题、收藏和记录；面试按状态追问并在结束后公开评分", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  const generated = await f.user.api("/ai/variants", "POST", {
    lessonId: f.question.lessonId,
    questionId: f.question.id,
    count: 1,
    direction: "改变约束",
    difficulty: "进阶",
    requestId: randomUUID(),
  });
  const run = await f.settled(f.user, generated.data.run.id);
  assert.equal(run.status, "succeeded", JSON.stringify(run));
  const question = run.result.questions[0];
  assert.equal((await f.other.api("/ai/questions/" + question.id)).status, 404);
  assert.equal(
    (
      await f.user.api("/attempts/" + question.id, "POST", {
        answer: "自评回答",
        selfRating: 2,
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.user.api("/bookmarks/" + question.id, "PUT", { active: true }))
      .status,
    200,
  );
  const session = (
    await f.user.api("/ai/interviews", "POST", {
      mode: "interview",
      difficulty: "进阶",
      count: 2,
      moduleId: "",
    })
  ).data;
  const input = { answer: f.input().answer, turn: 0, requestId: randomUUID() };
  const first = await f.user.api(
    "/ai/interviews/" + session.id + "/turns",
    "POST",
    input,
  );
  const turn = await f.settled(f.user, first.data.run.id);
  assert.equal(turn.result, null);
  assert.equal(
    (await f.user.api("/ai/interviews/" + session.id)).data.turns[0].evaluation,
    null,
  );
  assert.equal(
    (await f.user.api("/ai/interviews/" + session.id + "/turns", "POST", input))
      .data.run.id,
    turn.id,
  );
  const ended = (
    await f.user.api("/ai/interviews/" + session.id + "/end", "POST", {})
  ).data;
  assert.equal(ended.status, "completed");
  assert.equal(ended.report.covered, 1);
  assert.equal(ended.turns[0].evaluation.score, 80);
});

async function configurePool(f, specs = [{}, {}]) {
  const current = (await f.admin.api("/admin/ai/pool")).data.pool;
  const providers = specs.map((spec, i) => ({
    id: randomUUID(),
    name: "服务商 " + i,
    baseUrl: "https://provider" + i + ".example.com/v1",
    protocol: "chat",
    enabled: true,
    maxConcurrent: 3,
    apiKey: "secret-" + i,
    models: [
      {
        id: randomUUID(),
        model: "model-" + i,
        enabled: true,
        features: ["grade", "variants", "interview"],
        priority: i,
        weight: 1,
        maxConcurrent: 3,
        format: "schema",
        tokenParameter: "max_tokens",
        ...(spec.model || {}),
      },
    ],
    ...(spec.provider || {}),
  }));
  const result = await f.admin.api("/admin/ai/pool", "PUT", {
    revision: current.revision,
    policy: current.policy,
    providers,
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { ...result.data.pool, providers };
}
const modelResponse = (messages, patch = {}) => ({
  text: JSON.stringify(
    messages.length === 1
      ? { ok: true }
      : good(JSON.parse(messages.at(-1).content).candidateAnswer),
  ),
  complete: true,
  actualModel: "actual-fallback",
  requestId: "provider-request",
  usage: { input: 100, output: 200, cached: 20, reasoning: 30, total: 300 },
  ...patch,
});
const upstreamError = (status, code = "rate_limit", sent = true) => {
  const error = new AiError(
    502,
    "服务商返回 HTTP " + status,
    "AI_PROVIDER_HTTP",
  );
  Object.assign(error, {
    upstreamStatus: status,
    upstreamCode: code,
    sent,
    noCharge: [400, 401, 403, 404, 405, 422, 429].includes(status),
    retryAfterMs: 120000,
  });
  return error;
};

test("服务池多服务商与多模型配置、密钥隔离、版本冲突和专用模型测试", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.user.api("/admin/ai/pool")).status, 403);
  const pool = await configurePool(f, [
    {},
    { model: { features: ["variants"] } },
  ]);
  const returned = (await f.admin.api("/admin/ai/pool")).data;
  assert.equal(returned.pool.providers.length, 2);
  assert(returned.pool.providers.every((p) => p.hasKey && !p.apiKey));
  assert(!JSON.stringify(returned).includes("secret-"));
  assert.equal(
    (
      await f.admin.api("/admin/ai/pool", "PUT", {
        revision: randomUUID(),
        policy: pool.policy,
        providers: pool.providers,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.admin.api("/admin/ai/pool", "PUT", {
        revision: pool.revision,
        policy: pool.policy,
        providers: [pool.providers[0], pool.providers[0]],
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.admin.api("/admin/ai/config", "PUT", settings)).status,
    409,
  );
  let keySeen;
  f.provider.models = async (_, key) => {
    keySeen = key;
    return ["one", "two"];
  };
  assert.equal(
    (
      await f.admin.api("/admin/ai/models", "POST", {
        providerId: pool.providers[1].id,
      })
    ).status,
    200,
  );
  assert.equal(keySeen, "secret-1");
  await f.grant(f.admin);
  const calls = [];
  f.provider.generate = async (
    config,
    key,
    messages,
    schema,
    signal,
    onSend,
  ) => {
    calls.push({ config, key });
    onSend();
    return modelResponse(messages);
  };
  const started = await f.admin.api("/admin/ai/test", "POST", {
    targetId: pool.providers[1].models[0].id,
    requestId: randomUUID(),
  });
  const run = await f.settled(f.admin, started.data.run.id);
  assert.equal(run.status, "succeeded");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.model, "model-1");
  assert.equal(calls[0].key, "secret-1");
  const log = await f.admin.api("/admin/ai/runs/" + run.id);
  assert(!JSON.stringify(log.data).includes("secret-"));
  const rows = await f.ai.repo.read((db) => db.all("SELECT * FROM ai_config"));
  assert(!JSON.stringify(rows).includes("secret-"));
});

test("429 额度不足会隔离整个服务商，自动切换后只扣一次并保持请求幂等", async (t) => {
  const f = await fixture(t),
    pool = await configurePool(f);
  await f.grant();
  const calls = [];
  f.provider.generate = async (
    config,
    key,
    messages,
    schema,
    signal,
    onSend,
  ) => {
    calls.push(key);
    onSend();
    if (key === "secret-0") throw upstreamError(429, "insufficient_quota");
    return modelResponse(messages);
  };
  const input = f.input();
  const first = await f.user.api("/ai/grade", "POST", input);
  assert.equal(first.status, 202);
  const run = await f.settled(f.user, first.data.run.id);
  assert.equal(run.status, "succeeded");
  assert.equal(run.failoverCount, 1);
  assert.equal(run.chargedPoints, 1);
  assert.deepEqual(calls, ["secret-0", "secret-1"]);
  assert.equal(
    (await f.user.api("/ai/grade", "POST", input)).data.run.id,
    run.id,
  );
  const log = (await f.admin.api("/admin/ai/runs/" + run.id)).data;
  assert.equal(log.attempts.length, 2);
  assert.equal(log.attempts[0].upstreamStatus, 429);
  assert.equal(log.attempts[0].usageUnknown, false);
  const health = (await f.ai.pool.admin()).health.find(
    (h) => h.id === pool.providers[0].id,
  );
  assert.equal(health.state, "cooldown");
  assert(health.until - Date.now() > 3500000);
  const second = await f.user.api("/ai/grade", "POST", {
    ...f.input(),
    answer: input.answer + "需要再补充失败后的恢复机制。",
  });
  assert.equal(
    (await f.settled(f.user, second.data.run.id)).status,
    "succeeded",
  );
  assert.deepEqual(calls, ["secret-0", "secret-1", "secret-1"]);
  const ledger = (await f.user.api("/ai/ledger")).data.rows;
  assert.equal(
    ledger.filter((x) => x.runId === run.id && x.kind === "settle").length,
    1,
  );
  assert.equal((await f.user.api("/ai/status")).data.account.reserved, 0);
});

test("超时后切换成功保留未知成本，失败重试不重复扣用户额度，成本核对独立审计", async (t) => {
  const f = await fixture(t);
  await configurePool(f);
  await f.grant();
  f.provider.generate = async (
    config,
    key,
    messages,
    schema,
    signal,
    onSend,
  ) => {
    onSend();
    if (key === "secret-0") {
      const e = new AiError(504, "上游响应超时", "AI_TIMEOUT");
      e.sent = true;
      throw e;
    }
    return modelResponse(messages);
  };
  const started = await f.user.api("/ai/grade", "POST", f.input());
  const run = await f.settled(f.user, started.data.run.id);
  assert.equal(run.status, "succeeded");
  assert.equal(run.chargedPoints, 1);
  assert.equal((await f.user.api("/ai/status")).data.account.available, 9999);
  let detail = (await f.admin.api("/admin/ai/runs/" + run.id)).data;
  assert.equal(detail.upstreamCostPending, true);
  assert.equal(detail.attempts[0].usageUnknown, true);
  assert.equal(detail.attempts[1].usage.total, 300);
  assert.equal(detail.upstreamUsage.total, 300);
  assert.equal(
    (
      await f.user.api("/admin/ai/runs/" + run.id + "/cost-review", "POST", {
        note: "检查服务商账单无额外费用",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.admin.api("/admin/ai/runs/" + run.id + "/cost-review", "POST", {
        note: "检查服务商账单无额外费用",
      })
    ).status,
    200,
  );
  detail = (await f.admin.api("/admin/ai/runs/" + run.id)).data;
  assert.equal(detail.upstreamCostPending, false);
  assert(detail.upstreamCostReview.note);
  assert.equal((await f.user.api("/ai/status")).data.account.available, 9999);
  assert.equal(
    (
      await f.admin.api("/admin/ai/runs/" + run.id + "/cost-review", "POST", {
        note: "不能重复确认同一上游成本",
      })
    ).status,
    409,
  );
});

test("所有候选均失败：明确拒绝释放预占，存在未知消耗保留预占，冷却期间不发新请求", async (t) => {
  const f = await fixture(t),
    pool = await configurePool(f);
  await f.grant();
  let calls = 0;
  f.provider.generate = async (
    config,
    key,
    messages,
    schema,
    signal,
    onSend,
  ) => {
    calls++;
    onSend();
    throw upstreamError(429);
  };
  let started = await f.user.api("/ai/grade", "POST", f.input());
  let run = await f.settled(f.user, started.data.run.id);
  assert.equal(run.status, "released");
  assert.equal(run.chargedPoints, 0);
  assert.equal(calls, 2);
  assert.equal((await f.user.api("/ai/status")).data.account.reserved, 0);
  assert.equal((await f.user.api("/ai/grade", "POST", f.input())).status, 503);
  assert.equal(calls, 2);
  for (const p of pool.providers) await f.ai.pool.reset(f.admin.user.id, p.id);
  f.provider.generate = async (
    config,
    key,
    messages,
    schema,
    signal,
    onSend,
  ) => {
    calls++;
    onSend();
    if (key === "secret-0") {
      const e = new AiError(502, "连接断开", "AI_PROVIDER_NETWORK");
      e.sent = true;
      throw e;
    }
    throw upstreamError(401);
  };
  started = await f.user.api("/ai/grade", "POST", f.input());
  run = await f.settled(f.user, started.data.run.id);
  assert.equal(run.status, "pending");
  assert.equal(run.chargedPoints, null);
  assert((await f.user.api("/ai/status")).data.account.reserved > 0);
  const health = (await f.ai.pool.admin()).health;
  assert.equal(
    health.find((h) => h.id === pool.providers[1].id).state,
    "disabled",
  );
});

test("失败的多个格式输出分别记消耗但不记作答成绩；用途和停用过滤发生在服务端", async (t) => {
  const f = await fixture(t);
  const pool = await configurePool(f, [
    {},
    {},
    { model: { features: ["variants"], priority: 0 } },
    { provider: { enabled: false } },
  ]);
  await f.grant();
  const calls = [];
  f.provider.generate = async (
    config,
    key,
    messages,
    schema,
    signal,
    onSend,
  ) => {
    calls.push(key);
    onSend();
    return modelResponse(messages, { text: '{"bad":true}' });
  };
  const started = await f.user.api("/ai/grade", "POST", f.input());
  const run = await f.settled(f.user, started.data.run.id);
  assert.equal(run.status, "failed");
  assert.deepEqual(calls, ["secret-0", "secret-1"]);
  assert.equal(run.chargedPoints, 2);
  const detail = (await f.admin.api("/admin/ai/runs/" + run.id)).data;
  assert.equal(detail.upstreamUsage.total, 600);
  assert.equal(detail.attempts.length, 2);
  assert.equal((await f.user.api("/bootstrap")).data.state.attempts.length, 0);
  assert.equal((await f.user.api("/ai/status")).data.account.reserved, 0);
  assert.equal(
    (
      await f.user.api("/ai/grade", "POST", {
        ...f.input(),
        targetId: pool.providers[2].models[0].id,
      })
    ).status,
    400,
  );
});

test("加权分配、并发溢出、恢复单探测与健康状态持久化", async (t) => {
  const f = await fixture(t);
  const pool = await configurePool(f, [
    { model: { weight: 3, maxConcurrent: 1 } },
    { model: { priority: 0, weight: 1, maxConcurrent: 1 } },
  ]);
  const snapshot = await f.ai.repo.read((db) =>
    f.ai.pool.snapshot(db, "grade"),
  );
  const counts = new Map();
  for (let i = 0; i < 40; i++) {
    const lease = f.ai.pool.acquire(snapshot.targets);
    counts.set(lease.target.id, (counts.get(lease.target.id) || 0) + 1);
    lease.release();
  }
  assert.equal(counts.get(pool.providers[0].models[0].id), 30);
  assert.equal(counts.get(pool.providers[1].models[0].id), 10);
  const first = f.ai.pool.acquire(snapshot.targets),
    second = f.ai.pool.acquire(snapshot.targets);
  assert.notEqual(first.target.id, second.target.id);
  assert.throws(() => f.ai.pool.acquire(snapshot.targets), /繁忙/);
  first.release();
  first.release();
  second.release();
  assert.equal(f.ai.pool.active.size, 0);
  const target = snapshot.targets[0];
  await f.ai.pool.outcome(target, upstreamError(429));
  const restored = new AiPool(f.ai.repo, f.provider, "a".repeat(64));
  await restored.init();
  assert.equal(restored.ready(target), false);
  restored.clock = () => Date.now() + 130000;
  assert.equal(restored.ready(target), true);
  const probe = restored.acquire([target]);
  assert.throws(() => restored.acquire([target]), /繁忙/);
  await restored.outcome(target, null, probe.observed);
  probe.release();
  assert.equal(restored.health.has(target.providerId), false);
  // A success that started before a concurrent 401 must not reopen the bad credential.
  const stale = restored.acquire([target]);
  await restored.outcome(target, upstreamError(401));
  await restored.outcome(target, null, stale.observed);
  stale.release();
  assert.equal(restored.ready(target), false);
  assert.equal(
    failurePolicy(upstreamError(429, "credit_balance_exhausted")).cooldown,
    3600000,
  );
});

test("旧单连接自动迁移用途与密钥；新配置保留未更换密钥并清理已移除连接", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const legacy = {
    ...settings,
    gradingModel: "grade-model",
    interviewModel: "interview-model",
  };
  assert.equal(
    (await f.admin.api("/admin/ai/config", "PUT", legacy)).status,
    200,
  );
  await f.ai.repo.transaction(async (db) => {
    const rows = await db.all("SELECT id FROM ai_config");
    for (const r of rows)
      if (r.id !== "main")
        await db.run("DELETE FROM ai_config WHERE id=?", r.id);
  });
  const restored = new AiPool(f.ai.repo, f.provider, "a".repeat(64));
  await restored.init();
  const migrated = await restored.admin();
  assert.equal(migrated.providers.length, 1);
  assert.equal(migrated.providers[0].models.length, 3);
  assert.deepEqual(
    migrated.providers[0].models.find((m) => m.model === "grade-model")
      .features,
    ["grade"],
  );
  const config = await f.ai.repo.read((db) =>
    restored.snapshot(db, "interview"),
  );
  assert.equal(config.targets[0].model, "interview-model");
  assert.equal(
    decrypt(config.targets[0].encryptedKey, "a".repeat(64)),
    settings.apiKey,
  );
  const fresh = await configurePool(f);
  const snapshot = await f.ai.repo.read((db) =>
    f.ai.pool.snapshot(db, "grade"),
  );
  await f.ai.pool.outcome(snapshot.targets[0], upstreamError(401));
  const save = await f.admin.api("/admin/ai/pool", "PUT", {
    revision: fresh.revision,
    policy: fresh.policy,
    providers: fresh.providers.slice(1).map(({ apiKey, ...p }) => p),
  });
  assert.equal(save.status, 200);
  assert.equal(f.ai.pool.health.has(fresh.providers[0].id), false);
  assert.equal(
    await f.ai.repo.read((db) =>
      db.get(
        "SELECT id FROM ai_config WHERE id=?",
        "provider:" + fresh.providers[0].id,
      ),
    ),
    undefined,
  );
  const key = await f.ai.repo.read((db) =>
    db.get(
      "SELECT encryptedKey FROM ai_config WHERE id=?",
      "provider:" + fresh.providers[1].id,
    ),
  );
  assert.equal(decrypt(key.encryptedKey, "a".repeat(64)), "secret-1");
});

test("尝试次数有硬上限，取消中途任务不触发后备调用，旧错误不能覆盖修复后的配置", async (t) => {
  const f = await fixture(t),
    pool = await configurePool(f, [{}, {}, {}]);
  await f.grant();
  let calls = 0;
  f.provider.generate = async (
    config,
    key,
    messages,
    schema,
    signal,
    onSend,
  ) => {
    calls++;
    onSend();
    throw upstreamError(503);
  };
  let current = await f.ai.pool.admin();
  assert.equal(
    (
      await f.admin.api("/admin/ai/pool", "PUT", {
        revision: current.revision,
        policy: { ...current.policy, maxAttempts: 2 },
        providers: pool.providers,
      })
    ).status,
    200,
  );
  let started = await f.user.api("/ai/grade", "POST", f.input());
  let run = await f.settled(f.user, started.data.run.id);
  assert.equal(run.status, "pending");
  assert.equal(calls, 2);
  assert.equal(f.ai.pool.active.size, 0);
  await f.admin.api("/admin/ai/runs/" + run.id + "/reconcile", "POST", {
    points: 1,
    note: "测试服务商账单核对完成",
  });
  for (const p of pool.providers) await f.ai.pool.reset(f.admin.user.id, p.id);
  f.provider.generate = async (
    config,
    key,
    messages,
    schema,
    signal,
    onSend,
  ) => {
    calls++;
    onSend();
    await new Promise((resolve, reject) => {
      if (signal.aborted)
        return reject(new AiError(499, "取消", "AI_CANCELLED"));
      signal.addEventListener(
        "abort",
        () => reject(new AiError(499, "取消", "AI_CANCELLED")),
        { once: true },
      );
    });
  };
  started = await f.user.api("/ai/grade", "POST", {
    ...f.input(),
    answer: f.input().answer + "测试取消后不要切换其他模型。",
  });
  for (let i = 0; calls < 3 && i < 100; i++)
    await new Promise((r) => setTimeout(r, 5));
  await f.user.api("/ai/runs/" + started.data.run.id + "/cancel", "POST", {});
  run = await f.settled(f.user, started.data.run.id);
  assert.equal(run.status, "pending");
  assert.equal(calls, 3);
  assert.equal(f.ai.pool.active.size, 0);
  const targets = await f.ai.repo.read((db) => f.ai.pool.snapshot(db, "grade"));
  const lease = f.ai.pool.acquire([targets.targets[0]]);
  await f.ai.pool.reset(f.admin.user.id, lease.target.providerId);
  await f.ai.pool.outcome(lease.target, upstreamError(401), lease.observed);
  lease.release();
  assert(!f.ai.pool.health.has(lease.target.providerId));
  await f.ai.pool.outcome(lease.target, upstreamError(401));
  await f.ai.pool.outcome(lease.target, upstreamError(503));
  assert(f.ai.pool.health.get(lease.target.providerId).manual);
});

test("新版服务池保存后不依赖旧 main 配置，也可正常创建模拟面试", async (t) => {
  const f = await fixture(t);
  await configurePool(f);
  await f.grant();
  assert.equal(
    await f.ai.repo.read((db) => f.ai.repo.configRaw(db)),
    undefined,
  );
  const session = await f.ai.startInterview(f.user.user.id, {
    mode: "practice",
    difficulty: "进阶",
    count: 2,
    moduleId: "",
  });
  assert.equal(session.status, "active");
  assert.equal(session.questionIds.length, 2);
});
