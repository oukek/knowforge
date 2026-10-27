import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./helpers/ai.mjs";
import { AiError } from "../server/ai/policy.mjs";
import { failureSummary } from "../server/ai/diagnostics.mjs";
import { failurePolicy } from "../server/ai/pool.mjs";
import { quote } from "../server/ai/amounts.mjs";

const validQuestion = () => ({
  prompt:
    "在并发库存扣减场景中，如何通过操作标识和唯一约束确保重放请求不造成重复扣减？",
  answer:
    "使用稳定操作标识，在本地事务中结合唯一约束保存处理状态与结果，重复请求返回首次结果。外部副作用仍需单独定义幂等键、状态核查和补偿流程，不能将本地事务完成视为整个分布式调用完成。",
  rubric: ["稳定操作标识", "唯一约束与本地事务", "外部副作用幂等及补偿"],
  keywords: ["幂等", "事务"],
});
const output = (questions) => ({
  text: JSON.stringify({ questions }),
  complete: true,
  finishReason: "stop",
  requestId: "mock-request-id",
  usage: { input: 100, cached: 0, output: 200, reasoning: 0, total: 300 },
});
const variantsInput = (f) => ({
  lessonId: f.question.lessonId,
  count: 1,
  difficulty: "进阶",
  direction: "改变约束",
  requestId: randomUUID(),
});

test("用户可见失败分类区分鉴权、余额、限流、兼容、超时、截断和格式，排查建议不回显上游正文", () => {
  for (const [error, kind] of [
    [{ upstreamStatus: 401 }, "auth"],
    [{ upstreamStatus: 403 }, "auth"],
    [
      {
        upstreamStatus: 429,
        upstreamCode: "insufficient_quota",
        providerDetail: "private-note",
      },
      "quota",
    ],
    [{ upstreamStatus: 429, providerDetail: "private-note" }, "rate_limit"],
    [{ upstreamStatus: 400 }, "compatibility"],
    [{ upstreamStatus: 504 }, "timeout"],
    [{ code: "AI_OUTPUT_TRUNCATED" }, "truncated"],
    [{ code: "AI_INVALID_OUTPUT", outputIssue: "duplicate" }, "duplicate"],
    [{ code: "AI_PROVIDER_NETWORK" }, "network"],
    [{ code: "AI_PROVIDER_JSON" }, "protocol"],
    [{ upstreamStatus: 503 }, "upstream"],
  ]) {
    const result = failureSummary(error);
    assert.equal(result.kind, kind);
    assert(result.suggestion);
    assert(!JSON.stringify(result).includes("private-note"));
  }
  assert.equal(failurePolicy({ code: "AI_OUTPUT_TRUNCATED" }).scope, "model");
});

test("基础与举一反三模型测试分别验证真实结果，遵守模型输出上限，不发布题目或扣个人额度", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const generate = f.provider.generate;
  const limits = [];
  f.provider.generate = async (...args) => {
    limits.push(args[0].outputLimit);
    return generate(...args);
  };
  const pool = (await f.admin.api("/admin/ai/pool")).data.pool;
  const targetId = pool.providers[0].models[0].id;
  for (const testFeature of ["connection", "variants"]) {
    const started = await f.admin.api("/admin/ai/test", "POST", {
      requestId: randomUUID(),
      targetId,
      testFeature,
    });
    assert.equal(started.status, 202, JSON.stringify(started.data));
    const run = await f.settled(f.admin, started.data.run.id);
    assert.equal(run.status, "succeeded", JSON.stringify(run));
    assert.equal(run.testFeature, testFeature);
    assert.equal(run.failure, null);
    if (testFeature === "connection")
      assert.deepEqual(run.result, { ok: true });
    else assert.equal(run.result.questions.length, 1);
    assert.equal(run.billingMode, "platform");
    assert.equal(run.chargedPoints, "0");
    const privateRun = (await f.admin.api("/admin/ai/runs/" + run.id)).data;
    assert.equal(privateRun.attempts.length, 1);
    assert.equal(privateRun.attempts[0].outputLimit, 2048);
    assert.equal(
      (await f.admin.api("/ai/runs/" + run.id)).data.quotedPoints,
      privateRun.quotedPoints,
    );
    assert.equal(
      quote(privateRun.messages, privateRun.config, "test"),
      quote(privateRun.messages, privateRun.config, "variants"),
    );
  }
  assert.deepEqual(limits, [2048, 2048]);
  assert.equal(
    (await f.admin.api("/bootstrap")).data.generatedQuestions.length,
    0,
  );
  assert.equal((await f.admin.api("/ai/status")).data.account.balance, "0");
  assert.equal(
    (
      await f.user.api("/admin/ai/test", "POST", {
        requestId: randomUUID(),
        targetId,
        testFeature: "variants",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.admin.api("/admin/ai/test", "POST", {
        requestId: randomUUID(),
        targetId,
        testFeature: "chat",
      })
    ).status,
    400,
  );
});

test("举一反三按实际失败原因诊断，保留管理员字段明细，不污染题库、成绩与用户余额", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  const pool = (await f.admin.api("/admin/ai/pool")).data.pool;
  const scenarios = [
    ["json", () => ({ ...output([]), text: "model returned plain text" })],
    ["schema", () => output([{ ...validQuestion(), answer: "过短" }])],
    [
      "count",
      () =>
        output([
          validQuestion(),
          { ...validQuestion(), prompt: validQuestion().prompt + "另一个场景" },
        ]),
    ],
    [
      "duplicate",
      () => output([{ ...validQuestion(), prompt: f.question.prompt }]),
    ],
    [
      "truncated",
      () => ({
        ...output([]),
        text: '{"questions":[',
        complete: false,
        finishReason: "length",
      }),
    ],
    [
      "quota",
      () => {
        const e = new AiError(502, "服务商返回 HTTP 429", "AI_PROVIDER_HTTP");
        Object.assign(e, {
          upstreamStatus: 429,
          upstreamCode: "insufficient_quota",
          providerDetail: "private upstream billing note",
          requestId: "upstream-quota-request",
          noCharge: true,
        });
        throw e;
      },
    ],
  ];
  for (const [kind, response] of scenarios)
    await t.test(kind, async () => {
      for (const target of [pool.providers[0], ...pool.providers[0].models])
        await f.ai.pool.reset(f.admin.user.id, target.id);
      f.provider.generate = async (
        config,
        key,
        messages,
        schema,
        signal,
        onSend,
      ) => {
        onSend();
        return response();
      };
      const started = await f.user.api(
        "/ai/variants",
        "POST",
        variantsInput(f),
      );
      assert.equal(started.status, 202, JSON.stringify(started.data));
      const run = await f.settled(f.user, started.data.run.id);
      assert.equal(run.status, "released");
      assert.equal(run.failure.kind, kind, JSON.stringify(run));
      assert.equal(run.chargedPoints, "0");
      assert.equal(run.result, null);
      const serialized = JSON.stringify(run);
      for (const text of [
        "private upstream billing note",
        "server-only-key",
        "validationIssues",
        "responseText",
        "providerError",
      ])
        assert(!serialized.includes(text), text);
      const detail = (await f.admin.api("/admin/ai/runs/" + run.id)).data;
      assert.equal(detail.failure.kind, kind);
      if (kind === "schema") {
        const issue = detail.attempts[0].validationIssues.find(
          (i) => i.path === "questions.0.answer",
        );
        assert.equal(issue.code, "too_small");
        assert.match(issue.message, /50/);
      }
      if (kind === "truncated") {
        assert.equal(detail.attempts[0].finishReason, "length");
        assert.equal(detail.attempts[0].outputLimit, 2048);
      }
      if (kind === "quota") {
        assert.equal(detail.attempts[0].upstreamCode, "insufficient_quota");
        assert.equal(
          detail.attempts[0].providerError,
          "private upstream billing note",
        );
        const blocked = await f.user.api(
          "/ai/variants",
          "POST",
          variantsInput(f),
        );
        assert.equal(blocked.status, 503);
        assert.equal(blocked.data.code, "AI_POOL_UNAVAILABLE");
        assert.match(blocked.data.error, /服务商余额或总额度不足/);
        assert(
          !JSON.stringify(blocked.data).includes(
            "private upstream billing note",
          ),
        );
      }
      assert.equal(
        (await f.user.api("/bootstrap")).data.generatedQuestions.length,
        0,
      );
      const status = (await f.user.api("/ai/status")).data;
      assert.equal(status.account.balance, "10000");
      assert.equal(status.account.reserved, "0");
    });
});
