import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync("client/public/python-runner.js", "utf8");
async function runLoader({
  manifestStatus = 200,
  manifestMime = "application/json",
  failFile,
  mime = "application/wasm",
  base = "/python-runtime/314.0.7/",
  reloadRuntime = false,
  encoding,
} = {}) {
  const messages = [],
    requests = [],
    imports = [],
    settings = [];
  let destroyed = false,
    stdout;
  const runtime = {
    setStdout(value) {
      stdout = value;
    },
    setStderr() {},
    setStdin() {},
    runPython() {
      return "3.14.2";
    },
    toPy() {
      return {
        destroy() {
          destroyed = true;
        },
      };
    },
    async runPythonAsync() {
      stdout.batched("6");
    },
  };
  const context = {
    self: { postMessage: (message) => messages.push(message) },
    performance: { now: () => 1000 },
    setTimeout,
    clearTimeout,
    AbortController,
    importScripts(url) {
      imports.push(url);
    },
    async loadPyodide(options) {
      settings.push(options);
      return runtime;
    },
    async fetch(url, options) {
      requests.push({ url, cache: options.cache });
      if (url.endsWith("manifest.json"))
        return new Response(JSON.stringify({ version: "314.0.7", base }), {
          status: manifestStatus,
          headers: { "Content-Type": manifestMime },
        });
      return new Response("test fixture", {
        status: url.endsWith(failFile || "never") ? 404 : 200,
        headers: {
          "Content-Type": url.endsWith(".wasm")
            ? mime
            : "application/octet-stream",
          "Content-Length": encoding ? "3" : "12",
          ...(encoding ? { "Content-Encoding": encoding } : {}),
        },
      });
    },
  };
  vm.runInNewContext(source, context);
  await context.self.onmessage({
    data: { mode: "snippet", code: "print(6)", reloadRuntime },
  });
  return {
    messages,
    requests,
    imports,
    settings,
    destroyed,
    result: messages.findLast((m) => m.type === "done"),
  };
}
test("Python Worker 先校验版本资源，报告进度后执行并释放 Python scope", async () => {
  const result = await runLoader();
  assert.equal(result.result.error, undefined);
  assert.deepEqual(result.imports, ["/python-runtime/314.0.7/pyodide.js"]);
  assert.equal(result.requests[0].cache, "no-store");
  assert(result.requests.slice(1).every((r) => r.cache === "force-cache"));
  assert(
    result.messages.some((m) => m.type === "status" && m.text.includes("MB")),
  );
  assert(result.messages.some((m) => m.type === "ready"));
  assert.equal(result.result.logs[0].text, "6");
  assert.equal(result.destroyed, true);
  assert.equal(result.settings[0].indexURL, "/python-runtime/314.0.7/");
  assert.equal(
    result.messages.filter((message) => message.resource?.status === "ready")
      .length,
    5,
  );
  assert(result.messages.some((message) => message.stage === "manifest"));
  assert(result.messages.some((message) => message.stage === "initialize"));
});
test("手动重试重新读取资源；压缩响应不冒用 Content-Length 计算下载比例", async () => {
  const result = await runLoader({ reloadRuntime: true, encoding: "gzip" });
  assert(
    result.requests.slice(1).every((request) => request.cache === "reload"),
  );
  const files = result.messages.filter(
    (message) => message.resource?.status === "ready",
  );
  assert(
    files.every(
      (message) =>
        message.resource.total === 0 && message.resource.loaded === 12,
    ),
  );
});
for (const [name, options, expected] of [
  ["清单缺失", { manifestStatus: 404 }, /清单 HTTP 404/],
  ["清单被转发成网页", { manifestMime: "text/html" }, /资源清单类型错误/],
  [
    "运行资源缺失",
    { failFile: "python_stdlib.zip" },
    /python_stdlib.zip.*HTTP 404/,
  ],
  ["WASM 错误类型", { mime: "text/html" }, /MIME 错误/],
  [
    "清单越出资源目录",
    { base: "https://other.invalid/" },
    /无效的 Python 资源路径/,
  ],
])
  test("Python 加载失败明确指出原因：" + name, async () => {
    const result = await runLoader(options);
    assert.match(result.result.error, expected);
    assert.equal(result.imports.length, 0);
    assert(!result.messages.some((m) => m.type === "ready"));
  });

function runnerFixture() {
  const timers = new Map(),
    workers = [];
  let id = 0;
  const context = {
    ref: (value) => ({ value }),
    onBeforeUnmount() {},
    setTimeout(fn, ms) {
      const key = ++id;
      timers.set(key, { fn, ms });
      return key;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
    createCodeWorker() {
      const worker = {
        postMessage() {},
        terminate() {
          this.terminated = true;
        },
      };
      workers.push(worker);
      return worker;
    },
  };
  const runnerSource = readFileSync(
    "client/src/composables/useCodeRunner.js",
    "utf8",
  )
    .replace(/^import .*;\n/gm, "")
    .replace("export function", "function");
  vm.createContext(context);
  vm.runInContext(
    runnerSource + "\nglobalThis.runner=useCodeRunner();",
    context,
  );
  return { ...context, timers, workers };
}
test("Python 冷启动允许慢网，ready 后仍严格使用代码执行预算", async () => {
  const fixture = runnerFixture();
  const pending = fixture.runner.run({
    language: "python",
    mode: "snippet",
    code: "print(6)",
  });
  assert.equal([...fixture.timers.values()][0].ms, 180000);
  fixture.workers[0].onmessage({ data: { type: "status", text: "下载 WASM" } });
  assert.equal(fixture.runner.phase.value, "下载 WASM");
  fixture.workers[0].onmessage({ data: { type: "ready", version: "3.14.2" } });
  const deadline = [...fixture.timers.values()][0];
  assert.equal(deadline.ms, 4000);
  deadline.fn();
  const result = await pending;
  assert.equal(result.timeout, true);
  assert.match(result.error, /执行超过 4 秒/);
  assert.equal(fixture.workers[0].terminated, true);
});
test("Python 加载中停止会清理 Worker，迟到消息不影响下一次运行", async () => {
  const fixture = runnerFixture();
  const first = fixture.runner.run({ language: "python", code: "print(6)" });
  fixture.runner.stop();
  assert.equal((await first).cancelled, true);
  const second = fixture.runner.run({ language: "python", code: "print(7)" });
  fixture.workers[0].onmessage({ data: { type: "done", error: "stale" } });
  assert.equal(fixture.runner.running.value, true);
  fixture.workers[1].onmessage({ data: { type: "done", logs: [] } });
  assert.equal((await second).error, undefined);
  assert.equal(fixture.timers.size, 0);
});
test("初始化进度和程序输出分开；资源读取进度不刷屏，ready 后保留历史日志", async () => {
  const { runner, workers } = runnerFixture();
  const pending = runner.run({ language: "python", code: "print(6)" });
  const message = (data) => workers[0].onmessage({ data });
  message({
    type: "status",
    stage: "download",
    text: "资源清单已确认",
    resources: [
      { name: "core.wasm", loaded: 0, total: 100, status: "pending" },
    ],
  });
  const count = runner.initialization.value.events.length;
  message({
    type: "status",
    stage: "download",
    text: "读取中",
    log: false,
    resource: { name: "core.wasm", loaded: 60, total: 100, status: "loading" },
  });
  assert.equal(runner.initialization.value.resources[0].loaded, 60);
  assert.equal(runner.initialization.value.events.length, count);
  message({
    type: "status",
    stage: "initialize",
    text: "正在初始化",
    resource: { name: "core.wasm", loaded: 100, total: 100, status: "ready" },
  });
  message({ type: "ready", version: "3.14.2" });
  message({ type: "console", entry: { text: "6", level: "log" } });
  message({ type: "done", logs: [{ text: "6", level: "log" }] });
  assert.equal((await pending).initializationFailed, undefined);
  assert.equal(runner.initialization.value.status, "ready");
  assert(
    runner.initialization.value.events.at(-1).text.includes("3.14.2 已就绪"),
  );
  assert.equal(runner.logs.value.length, 1);
});
test("初始化失败标记独立错误；取消和迟到消息不能复活加载状态", async () => {
  const { runner, workers } = runnerFixture();
  let pending = runner.run({ language: "python", code: "print(6)" });
  workers[0].onmessage({
    data: {
      type: "status",
      stage: "download",
      text: "core HTTP 404",
      resource: { name: "core", status: "failed", loaded: 0, total: 0 },
    },
  });
  workers[0].onmessage({ data: { type: "done", error: "core HTTP 404" } });
  const failure = await pending;
  assert.equal(failure.initializationFailed, true);
  assert.equal(runner.initialization.value.status, "failed");
  assert.equal(runner.initialization.value.events.at(-1).level, "error");
  assert.equal(
    runner.initialization.value.events.filter(
      (item) => item.text === "core HTTP 404",
    ).length,
    1,
  );
  workers[0].onmessage({ data: { type: "ready", version: "stale" } });
  assert.equal(runner.initialization.value.status, "failed");
  pending = runner.run({ language: "python", code: "print(7)" });
  assert.equal(runner.initialization.value.error, "");
  assert.equal(runner.initialization.value.events.length, 1);
  runner.stop();
  assert.equal((await pending).cancelled, true);
  assert.equal(runner.initialization.value.status, "cancelled");
  workers[1].onmessage({ data: { type: "status", text: "late download" } });
  assert.equal(runner.initialization.value.status, "cancelled");
  runner.clear();
  assert.equal(runner.initialization.value, null);
});
