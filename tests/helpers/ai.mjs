import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../../server/app.mjs";
import { dimensions } from "../../server/ai/policy.mjs";
import { mysqlFixture } from "./mysql.mjs";
export const good = (answer) => ({
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
export const settings = {
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
export async function fixture(t, aiOptions = {}) {
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
    aiOptions: { encryptionKey: "a".repeat(64), provider, ...aiOptions },
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
    const raw = (path, options = {}) =>
      fetch(base + path, {
        ...options,
        headers: { Cookie: cookie, "X-CSRF-Token": csrf, ...options.headers },
      });
    return { api, user, raw };
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
    base,
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
