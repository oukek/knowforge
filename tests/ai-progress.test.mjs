import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./helpers/ai.mjs";
import { AiError } from "../server/ai/policy.mjs";
import {
  consumeRunEvents,
  monitorAiRun,
} from "../client/src/ai-task-monitor.mjs";
import { createFrontend } from "../server/frontend.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const eventually = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await delay(5);
  }
  assert.fail("状态未在预期时间内更新");
};
const encode = new TextEncoder();
function responseFor(text, size = 1) {
  const bytes = encode.encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += size)
          controller.enqueue(bytes.slice(i, i + size));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
}
const event = (run) => `event: run\ndata: ${JSON.stringify(run)}\n\n`;

test("SSE 解析跨字节中文、分片 CRLF、多行 data 和心跳；终态只交付一次", async () => {
  const running = {
    id: "task",
    status: "running",
    progress: { phase: "requesting" },
  };
  const final = {
    id: "task",
    status: "succeeded",
    result: { summary: "评阅已完成" },
  };
  const frames = `: heartbeat\r\n\r\nevent: run\r\ndata: ${JSON.stringify(running)}\r\n\r\nevent: run\r\ndata: ${JSON.stringify(final).slice(0, 1)}\r\ndata: ${JSON.stringify(final).slice(1)}\r\n\r\n`;
  const values = [];
  await consumeRunEvents(responseFor(frames), (run) => values.push(run));
  assert.deepEqual(values, [running, final]);
  await assert.rejects(
    consumeRunEvents(responseFor(event(running)), () => {}),
    /断开/,
  );
  await assert.rejects(
    consumeRunEvents(
      responseFor(
        'event: task-error\ndata: {"status":401,"error":"登录失效"}\n\n',
      ),
      () => {},
    ),
    { status: 401 },
  );
  await assert.rejects(
    consumeRunEvents(new Response("{}"), () => {}),
    /暂不可用/,
  );
});

test("实时连接中断后查询原任务再重连，成功交付；从不重新提交付费请求", async () => {
  const states = [],
    values = [],
    calls = [];
  let streams = 0;
  await monitorAiRun({
    id: "task",
    signal: new AbortController().signal,
    pollMs: 1,
    onRun: (value) => values.push(value),
    onConnection: (state) => states.push(state),
    request: async (path, method, body, options) => {
      calls.push(path);
      assert.equal(method, "GET");
      assert.equal(body, undefined);
      assert(options.signal);
      if (path.endsWith("/events")) {
        streams++;
        return responseFor(
          event({
            id: "task",
            status: streams === 1 ? "running" : "succeeded",
          }),
        );
      }
      return { id: "task", status: "running" };
    },
  });
  assert.equal(streams, 2);
  assert.equal(calls.filter((p) => !p.endsWith("/events")).length, 3);
  assert(states.includes("polling"));
  assert(states.includes("reconnecting"));
  assert(states.includes("live"));
  assert.equal(values.at(-1).status, "succeeded");
});

test("不支持 SSE 时轮询可完成；会话/权限/任务错误终止，离开页面中止观察", async () => {
  const calls = [];
  await monitorAiRun({
    id: "task",
    signal: new AbortController().signal,
    onRun: () => {},
    onConnection: () => {},
    request: async (path) => {
      calls.push(path);
      return path.endsWith("/events")
        ? new Response("{}")
        : { id: "task", status: "released" };
    },
  });
  assert.deepEqual(calls, ["/ai/runs/task/events", "/ai/runs/task"]);
  for (const status of [401, 403, 404]) {
    let count = 0;
    await assert.rejects(
      monitorAiRun({
        id: "task",
        signal: new AbortController().signal,
        onRun: () => {},
        onConnection: () => {},
        request: async () => {
          count++;
          throw Object.assign(new Error("不可访问"), { status });
        },
      }),
      { status },
    );
    assert.equal(count, 1);
  }
  const controller = new AbortController();
  const observed = [];
  await monitorAiRun({
    id: "task",
    signal: controller.signal,
    pollMs: 1,
    onRun: () => {},
    onConnection: (state) => {
      observed.push(state);
      if (state === "offline") controller.abort();
    },
    request: async () => {
      throw new Error("offline");
    },
  }).catch((error) => assert.equal(error.name, "AbortError"));
  assert(observed.includes("offline"));
});

test("代理不发送首帧时超时中止流并改用查询，不会永远等待", async () => {
  let streamAborted = false;
  await monitorAiRun({
    id: "task",
    signal: new AbortController().signal,
    staleMs: 10,
    onRun: (value) => assert.equal(value.status, "succeeded"),
    onConnection: () => {},
    request: (path, _, __, options) =>
      path.endsWith("/events")
        ? new Promise((resolve, reject) =>
            options.signal.addEventListener(
              "abort",
              () => {
                streamAborted = true;
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            ),
          )
        : Promise.resolve({ id: "task", status: "succeeded" }),
  });
  assert(streamAborted);
});

test("兜底查询自身超时后继续恢复，不被挂起的 HTTP 请求阻塞", async () => {
  let queries = 0,
    aborted = false;
  const states = [];
  await monitorAiRun({
    id: "task",
    signal: new AbortController().signal,
    staleMs: 10,
    pollMs: 1,
    onRun: (run) => assert.equal(run.status, "succeeded"),
    onConnection: (state) => states.push(state),
    request: async (path, _, __, options) => {
      if (path.endsWith("/events")) throw Error("SSE blocked");
      if (++queries > 1) return { id: "task", status: "succeeded" };
      return new Promise((resolve, reject) =>
        options.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        ),
      );
    },
  });
  assert(aborted);
  assert.equal(queries, 2);
  assert(states.includes("offline"));
});

test("任务事件需要登录、同账号与允许来源，流式首帧及时返回且不泄露内部数据", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  f.setDelay(200);
  const start = await f.user.api("/ai/grade", "POST", f.input());
  const path = "/ai/runs/" + start.data.run.id + "/events";
  assert.equal((await fetch(f.base + path)).status, 401);
  assert.equal((await f.other.raw(path)).status, 404);
  assert.equal(
    (
      await f.user.raw(path, {
        headers: { "X-KnowForge-User": f.other.user.id },
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.user.raw(path, { headers: { Origin: "https://evil.invalid" } }))
      .status,
    403,
  );
  const response = await f.user.raw(path, {
    headers: {
      Origin: "https://knowforge.ookew.com",
      "X-KnowForge-User": f.user.user.id,
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assert.equal(
    response.headers.get("access-control-allow-credentials"),
    "true",
  );
  assert.match(response.headers.get("cache-control"), /no-store/);
  const values = [];
  await consumeRunEvents(response, (value) => values.push(value));
  assert.equal(values[0].status, "running");
  assert.equal(values[0].progress.phase, "requesting");
  const final = values.at(-1);
  assert.equal(final.status, "succeeded");
  assert.equal(final.progress.phase, "succeeded");
  assert.equal(final.result.score, 80);
  assert.equal(final.chargedPoints, "0.7");
  const json = JSON.stringify(values);
  for (const secret of [
    "server-only-key",
    "encryptedKey",
    "messages",
    "providerError",
    "procurement",
  ])
    assert(!json.includes(secret), secret);
  assert.equal(f.calls(), 1);
  assert.equal(
    (await f.user.api("/ai/ledger")).data.rows.filter(
      (row) => row.kind === "settle",
    ).length,
    1,
  );
  await eventually(() => f.ai.events.connections.size === 0);
  const replay = [];
  await consumeRunEvents(await f.user.raw(path), (value) => replay.push(value));
  assert.equal(replay.length, 1);
  assert.equal(replay[0].status, "succeeded");
  assert.equal(f.calls(), 1);
});

test("断开观察不取消任务，取消终态释放额度；流连接限额、会话失效及资源清理", async (t) => {
  const f = await fixture(t, {
    events: { heartbeatMs: 15, pollMs: 10, perUser: 1 },
  });
  await f.configure();
  await f.grant();
  f.setDelay(1000);
  const {
    data: { run },
  } = await f.user.api("/ai/grade", "POST", f.input());
  const path = "/ai/runs/" + run.id + "/events";
  const disconnect = new AbortController();
  const first = await f.user.raw(path, { signal: disconnect.signal });
  assert.equal(first.status, 200);
  assert.equal((await f.user.raw(path)).status, 429);
  disconnect.abort();
  await eventually(() => f.ai.events.connections.size === 0);
  assert.equal((await f.user.api("/ai/runs/" + run.id)).data.status, "running");
  const stream = await f.user.raw(path);
  const values = [];
  const reading = consumeRunEvents(stream, (value) => values.push(value));
  await f.user.api("/ai/runs/" + run.id + "/cancel", "POST", {});
  await reading;
  assert.equal(values.at(-1).status, "released");
  assert.equal(values.at(-1).chargedPoints, "0");
  assert.equal((await f.user.api("/ai/status")).data.account.reserved, "0");
  await eventually(() => f.ai.events.users.size === 0);

  const second = await f.other.api("/ai/grade", "POST", f.input());
  assert.equal(second.status, 402); // no quota was granted to this account
  await f.grant(f.other);
  const active = (await f.other.api("/ai/grade", "POST", f.input())).data.run;
  const live = await f.other.raw("/ai/runs/" + active.id + "/events");
  const expired = consumeRunEvents(live, () => {});
  await f.other.api("/auth/logout", "POST", {});
  await assert.rejects(expired, { status: 401 });
  await eventually(() => f.ai.events.listeners.size === 0);
});

test("其他进程的已提交状态由数据库补查推送；开发前端代理及时转发 SSE", async (t) => {
  const f = await fixture(t, { events: { pollMs: 10 } });
  await f.configure();
  await f.grant();
  f.setDelay(300);
  const backendPort = Number(new URL(f.base).port);
  const proxy = createFrontend({ backendPort, serveClient: false }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve) => proxy.once("listening", resolve));
  t.after(() => new Promise((resolve) => proxy.close(resolve)));
  // Simulate a worker which cannot publish in this SSE worker's memory.
  f.ai.events.notify = () => {};
  const base = "http://127.0.0.1:" + proxy.address().port;
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      username: "learner",
      password: "test-password-123",
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const run = (await f.user.api("/ai/grade", "POST", f.input())).data.run;
  const response = await fetch(base + "/api/ai/runs/" + run.id + "/events", {
    headers: {
      Cookie: cookie,
      Origin: base,
      "X-KnowForge-User": f.user.user.id,
    },
  });
  const values = [];
  await consumeRunEvents(response, (value) => values.push(value));
  assert.equal(values[0].status, "running");
  assert.equal(values.at(-1).status, "succeeded");
  assert.equal(f.calls(), 1);
});

test("上游失败自动切换会推送新尝试，成功任务只结算一次", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.grant();
  f.setDelay(70);
  const current = (await f.admin.api("/admin/ai/pool")).data.pool;
  const provider = current.providers[0];
  provider.models[0].priority = 0;
  current.providers.push({
    ...provider,
    id: randomUUID(),
    name: "备用服务",
    apiKey: "server-only-key",
    models: [
      {
        ...provider.models[0],
        id: randomUUID(),
        model: "mock-second",
        priority: 1,
      },
    ],
  });
  const saved = await f.admin.api("/admin/ai/pool", "PUT", {
    revision: current.revision,
    policy: current.policy,
    providers: current.providers.map(({ hasKey, ...value }) => value),
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const generate = f.provider.generate;
  let attempts = 0;
  f.provider.generate = async (...args) => {
    if (++attempts === 1) {
      args[5]();
      await delay(70);
      const failure = new AiError(502, "暂时不可用", "AI_PROVIDER_HTTP");
      failure.upstreamStatus = 429;
      failure.noCharge = true;
      throw failure;
    }
    return generate(...args);
  };
  const run = (await f.user.api("/ai/grade", "POST", f.input())).data.run;
  const values = [];
  await consumeRunEvents(
    await f.user.raw("/ai/runs/" + run.id + "/events"),
    (value) => values.push(value),
  );
  assert(values.some((value) => value.progress?.attempt === 2));
  assert.equal(values.at(-1).status, "succeeded");
  assert.equal(values.at(-1).failoverCount, 1);
  assert.equal(values.at(-1).chargedPoints, "0.7");
  assert.equal(attempts, 2);
});
