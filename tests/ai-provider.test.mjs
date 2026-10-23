import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { z } from "zod";
import { createProvider, checkedUrl } from "../server/ai/provider.mjs";
import { checkedGrade, dimensions } from "../server/ai/policy.mjs";

async function endpoint(t, handler) {
  const server = createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  return "http://127.0.0.1:" + server.address().port + "/v1";
}
test("真实 HTTP 适配 Chat/Responses、输出上限、凭据头、模型列表和用量", async (t) => {
  const received = [];
  const baseUrl = await endpoint(t, async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer test-key");
    let text = "";
    for await (const part of req) text += part;
    const body = text ? JSON.parse(text) : {};
    received.push({ path: req.url, body });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models")
      return res.end(
        JSON.stringify({
          data: [{ id: "model-a" }, { id: "model-a" }, { id: "model-b" }],
        }),
      );
    const usage = {
      input_tokens: 100,
      output_tokens: 200,
      input_tokens_details: { cached_tokens: 20 },
      output_tokens_details: { reasoning_tokens: 30 },
    };
    res.end(
      JSON.stringify(
        req.url === "/v1/responses"
          ? {
              id: "response-id",
              model: "actual-model",
              status: "completed",
              output: [
                {
                  type: "message",
                  content: [{ type: "output_text", text: '{"ok":true}' }],
                },
              ],
              usage,
            }
          : {
              id: "chat-id",
              model: "actual-model",
              choices: [
                { message: { content: '{"ok":true}' }, finish_reason: "stop" },
              ],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 200,
                prompt_tokens_details: { cached_tokens: 20 },
                completion_tokens_details: { reasoning_tokens: 30 },
              },
            },
      ),
    );
  });
  const provider = createProvider({ allowLocalTest: true }),
    schema = z.object({ ok: z.boolean() }).strict();
  assert.deepEqual(await provider.models({ baseUrl }, "test-key"), [
    "model-a",
    "model-b",
  ]);
  for (const protocol of ["chat", "responses"]) {
    const result = await provider.generate(
      {
        baseUrl,
        protocol,
        model: "configured-model",
        format: "schema",
        outputLimit: 1000,
        tokenParameter: "max_tokens",
      },
      "test-key",
      [{ role: "system", content: "JSON only" }],
      schema,
    );
    assert.equal(result.complete, true);
    assert.equal(result.usage.total, 300);
    assert.equal(result.usage.reasoning, 30);
    assert.equal(result.actualModel, "actual-model");
  }
  assert.equal(received[1].body.max_tokens, 1000);
  assert(!("max_completion_tokens" in received[1].body));
  assert.equal(received[1].body.response_format.type, "json_schema");
  assert.equal(received[2].body.max_output_tokens, 1000);
  assert.equal(received[2].body.store, false);
  assert.equal(received[2].body.text.format.type, "json_schema");
});
test("服务商错误不泄漏错误正文或 Key，不跟随重定向，不允许默认访问内网", async (t) => {
  let calls = 0;
  const baseUrl = await endpoint(t, (req, res) => {
    calls++;
    res.writeHead(302, { Location: "http://169.254.169.254" });
    res.end("secret-key-value");
  });
  const provider = createProvider({ allowLocalTest: true });
  await assert.rejects(
    provider.models({ baseUrl }, "secret-key-value"),
    (e) =>
      e.message.includes("HTTP 302") && !e.message.includes("secret-key-value"),
  );
  assert.equal(calls, 1);
  for (const url of [
    "http://127.0.0.1/v1",
    "https://127.0.0.1/v1",
    "https://169.254.169.254/v1",
    "https://user:pass@example.com/v1",
    "https://example.com/v1?key=secret",
    "https://[::1]/v1",
  ]) {
    await assert.rejects(checkedUrl(url));
  }
});
test("超时、取消和响应大小上限可终止上游请求", async (t) => {
  let mode = "large";
  const baseUrl = await endpoint(t, (req, res) => {
    if (mode === "large") res.end("x".repeat(1024 * 1024 + 1));
    // Leave timeout/abort requests unanswered; the client must close them.
  });
  const provider = createProvider({ allowLocalTest: true, timeoutMs: 60 });
  await assert.rejects(provider.models({ baseUrl }, "key"), /超过限制/);
  mode = "wait";
  await assert.rejects(provider.models({ baseUrl }, "key"), /超时/);
  const controller = new AbortController();
  const request = provider.generate(
    {
      baseUrl,
      protocol: "chat",
      model: "m",
      format: "prompt",
      outputLimit: 512,
    },
    "key",
    [{ role: "system", content: "JSON" }],
    z.object({ ok: z.boolean() }),
    controller.signal,
  );
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(request, /取消/);
});
test("评分证据必须来自回答，不能用伪造引文或重复维度影响成绩", () => {
  const answer = "这个回答说明了事件循环与异步任务的可验证顺序。";
  const result = {
    relevance: "on_topic",
    summary: "需要更多边界",
    dimensions: dimensions.map((name) => ({ name, score: 80, note: "有依据" })),
    covered: [],
    missing: [],
    errors: [],
    suggestions: [],
    evidence: [answer.slice(0, 5)],
    followUp: "",
  };
  assert.equal(checkedGrade(result, answer).score, 80);
  assert.throws(() =>
    checkedGrade({ ...result, evidence: ["用户没有写过的内容"] }, answer),
  );
  assert.throws(() =>
    checkedGrade(
      {
        ...result,
        dimensions: result.dimensions.map((x) => ({ ...x, name: "正确性" })),
      },
      answer,
    ),
  );
  assert.equal(
    checkedGrade({ ...result, relevance: "off_topic" }, answer).score,
    0,
  );
});
test("拒答保留可见原因和真实用量，不当成零消耗", async (t) => {
  const baseUrl = await endpoint(t, (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        model: "m",
        choices: [
          {
            message: { content: null, refusal: "本次请求偏离学习评阅用途" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    );
  });
  const response = await createProvider({ allowLocalTest: true }).generate(
    {
      baseUrl,
      protocol: "chat",
      model: "m",
      format: "prompt",
      outputLimit: 512,
    },
    "key",
    [{ role: "system", content: "JSON only" }],
    z.object({ ok: z.boolean() }),
  );
  assert.equal(response.refusal, "本次请求偏离学习评阅用途");
  assert.equal(response.usage.total, 120);
  assert.equal(response.text, "");
});

test("HTTP 故障保留状态、限额错误码、请求 ID 与 Retry-After，异常正文不暴露 Key", async (t) => {
  let retry = "120",
    status = 429;
  const baseUrl = await endpoint(t, (req, res) => {
    res.writeHead(status, {
      "Retry-After": retry,
      "x-request-id": "failed-request",
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify({
        error: {
          code: "insufficient_quota",
          message: "billing rejected private-credential",
        },
      }),
    );
  });
  const provider = createProvider({ allowLocalTest: true });
  await assert.rejects(
    provider.models({ baseUrl }, "private-credential"),
    (e) => {
      assert.equal(e.upstreamStatus, 429);
      assert.equal(e.upstreamCode, "insufficient_quota");
      assert.equal(e.requestId, "failed-request");
      assert.equal(e.retryAfterMs, 120000);
      assert.equal(e.noCharge, true);
      assert(!e.providerDetail.includes("private-credential"));
      return true;
    },
  );
  retry = new Date(Date.now() + 60000).toUTCString();
  status = 503;
  await assert.rejects(
    provider.models({ baseUrl }, "private-credential"),
    (e) => {
      assert(e.retryAfterMs >= 58000 && e.retryAfterMs <= 60000);
      assert.equal(e.noCharge, false);
      return true;
    },
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    provider.generate(
      {
        baseUrl,
        model: "x",
        protocol: "chat",
        format: "prompt",
        outputLimit: 512,
      },
      "private-credential",
      [],
      z.object({ ok: z.boolean() }),
      controller.signal,
    ),
    (e) => e.code === "AI_CANCELLED" && !e.sent,
  );
});
