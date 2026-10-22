import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { resolveApiOrigin } from "../client/src/api-config.js";
import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN,
} from "../shared/deployment.mjs";
import { runnerFrame } from "../server/runner-frame.mjs";
import { createCodeWorker } from "../client/src/composables/code-worker.js";

test("生产构建使用指定 API 域名，本地默认同源", () => {
  assert.equal(resolveApiOrigin(true), PRODUCTION_API_ORIGIN);
  assert.equal(resolveApiOrigin(false), "");
  assert.equal(
    resolveApiOrigin(false, "https://api.example.com/"),
    "https://api.example.com",
  );
  for (const value of [
    "javascript:alert(1)",
    "https://api.example.com/api",
    "https://a:b@api.example.com",
  ])
    assert.throws(() => resolveApiOrigin(true, value));
});

test("API 运行器桥接拒绝其他窗口和来源，只向指定父窗口转发结果", () => {
  const frame = runnerFrame([PRODUCTION_FRONTEND_ORIGIN]);
  const script = frame.html.match(/<script[^>]+>([\s\S]*)<\/script>/)[1];
  const events = {},
    workers = [],
    sent = [];
  const parent = { postMessage: (...args) => sent.push(args) };
  class Worker {
    constructor(url) {
      this.url = url;
      workers.push(this);
    }
    postMessage(payload) {
      this.payload = payload;
    }
    terminate() {
      this.stopped = true;
    }
  }
  vm.runInNewContext(script, {
    parent,
    Worker,
    addEventListener: (type, fn) => (events[type] = fn),
  });
  const id = "11111111-1111-1111-1111-111111111111";
  const data = {
    type: "knowforge:run",
    id,
    payload: { language: "python", code: "print(6)" },
  };
  events.message({ source: {}, origin: PRODUCTION_FRONTEND_ORIGIN, data });
  events.message({ source: parent, origin: "https://evil.invalid", data });
  assert.equal(workers.length, 0);
  events.message({ source: parent, origin: PRODUCTION_FRONTEND_ORIGIN, data });
  assert.equal(workers.length, 1);
  assert.equal(workers[0].url, "/python-runner.js");
  workers[0].onmessage({ data: { type: "done", logs: [6] } });
  assert.equal(sent[0][1], PRODUCTION_FRONTEND_ORIGIN);
  assert.equal(sent[0][0].id, id);
  events.pagehide();
  assert(workers[0].stopped);
});

test("前端运行器校验消息来源、窗口及请求 ID，结束后释放 iframe", (t) => {
  const previous = Object.fromEntries(
    ["location", "document", "window"].map((name) => [name, globalThis[name]]),
  );
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  const sent = [],
    listeners = new Map();
  let frame;
  globalThis.location = { origin: PRODUCTION_FRONTEND_ORIGIN };
  globalThis.document = {
    createElement: () =>
      (frame = {
        setAttribute() {},
        remove() {
          this.removed = true;
        },
        contentWindow: { postMessage: (...args) => sent.push(args) },
      }),
    body: { append() {} },
  };
  globalThis.window = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const worker = createCodeWorker(false, PRODUCTION_API_ORIGIN);
  let result;
  worker.onmessage = (event) => (result = event.data);
  worker.postMessage({ code: "console.log(42)" });
  assert.equal(sent.length, 0);
  frame.onload();
  assert.equal(frame.src, PRODUCTION_API_ORIGIN + "/runner-frame");
  assert.equal(sent[0][1], PRODUCTION_API_ORIGIN);
  const data = {
    type: "knowforge:result",
    id: sent[0][0].id,
    data: { type: "done" },
  };
  const receive = listeners.get("message");
  receive({ source: {}, origin: PRODUCTION_API_ORIGIN, data });
  receive({
    source: frame.contentWindow,
    origin: "https://evil.invalid",
    data,
  });
  receive({
    source: frame.contentWindow,
    origin: PRODUCTION_API_ORIGIN,
    data: { ...data, id: "bad" },
  });
  assert.equal(result, undefined);
  receive({ source: frame.contentWindow, origin: PRODUCTION_API_ORIGIN, data });
  assert.equal(result.type, "done");
  worker.terminate();
  assert(frame.removed);
  assert.equal(listeners.size, 0);
});
