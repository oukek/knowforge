import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { createFrontend } from "../server/frontend.mjs";

const listen = (app) =>
  new Promise((done) => {
    const server = app.listen(0, "127.0.0.1", () => done(server));
  });
const close = (server) => new Promise((done) => server.close(done));

async function fixture(t, options = {}) {
  const { app, store } = await createApp({
    dbPath: ":memory:",
    serveClient: false,
  });
  const backend = await listen(app);
  const frontend = await listen(
    createFrontend({
      backendPort: backend.address().port,
      serveClient: false,
      ...options,
    }),
  );
  t.after(async () => {
    await close(frontend);
    await close(backend);
    store.close();
  });
  return { backend, base: `http://127.0.0.1:${frontend.address().port}` };
}

test("前端代理保留路径、请求体与来源校验，允许同源保存并拒绝外部来源", async (t) => {
  const { base } = await fixture(t);
  const registration = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ username: "proxyuser", password: "proxy-password" }),
  });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  const { csrfToken } = await registration.json();
  const { catalog } = await (
    await fetch(`${base}/api/bootstrap`, { headers: { Cookie: cookie } })
  ).json();
  const notePath = `${base}/api/notes/${catalog.lessons[0].id}`;
  const response = await fetch(notePath, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Cookie: cookie,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ content: "经前端代理保存" }),
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).state.notes[catalog.lessons[0].id].content,
    "经前端代理保存",
  );
  const denied = await fetch(notePath, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.com",
    },
    body: JSON.stringify({ content: "不应保存" }),
  });
  assert.equal(denied.status, 403);
});

test("Worker 与 Python 运行时经前端代理保留 CSP、类型和下载文件名", async (t) => {
  const { base } = await fixture(t);
  const python = await fetch(`${base}/python-runner.js`);
  assert.equal(python.status, 200);
  const csp = python.headers.get("content-security-policy");
  assert(csp.includes(`${base}/python-runtime/`));
  assert(csp.includes("worker-src 'none'"));
  const httpsWorker = await fetch(`${base}/python-runner.js`, {
    headers: { "X-Forwarded-Proto": "https" },
  });
  assert(
    httpsWorker.headers
      .get("content-security-policy")
      .includes(`${base.replace("http:", "https:")}/python-runtime/`),
  );
  const js = await fetch(`${base}/runner.js`);
  assert(
    js.headers.get("content-security-policy").includes("connect-src 'none'"),
  );
  const wasm = await fetch(`${base}/python-runtime/pyodide.asm.wasm`, {
    method: "HEAD",
  });
  assert.equal(wasm.status, 200);
  assert(wasm.headers.get("content-type").includes("application/wasm"));
  const download = await fetch(`${base}/api/export/python-demo?download=1`);
  assert(
    download.headers
      .get("content-disposition")
      .includes("knowforge-python-workbench.py"),
  );
  assert((await download.text()).includes("def run_demo"));
});

test("构建后前端支持静态文件与 SPA 路由，未知 API 保持后端 404", async (t) => {
  const folder = mkdtempSync(join(tmpdir(), "knowforge-frontend-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  writeFileSync(
    join(folder, "index.html"),
    "<!doctype html><title>KnowForge test</title>",
  );
  writeFileSync(join(folder, "sample.js"), "console.log('asset');");
  const { base } = await fixture(t, { serveClient: true, distPath: folder });
  assert(
    (await (await fetch(`${base}/learn/python-intro`)).text()).includes(
      "KnowForge test",
    ),
  );
  assert.equal(
    await (await fetch(`${base}/sample.js`)).text(),
    "console.log('asset');",
  );
  const missing = await fetch(`${base}/api/missing`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, "接口不存在");
});

test("后端退出时前端代理返回 502", async (t) => {
  const { base, backend } = await fixture(t);
  await close(backend);
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "后端暂不可用，请稍后重试");
});

test("源码生产入口仅监听 API，忽略 FRONTEND_PORT；本地开发代理保留", async (t) => {
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:net");
  const { once } = await import("node:events");
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      DB_DRIVER: "sqlite",
      DB_PATH: ":memory:",
      PORT: String(port),
      FRONTEND_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (part) => (logs += part));
  child.stderr.on("data", (part) => (logs += part));
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
    }
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw Error(logs);
    try {
      ready = (
        await fetch("http://127.0.0.1:" + port + "/api/health", {
          signal: AbortSignal.timeout(500),
        })
      ).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert(ready, logs);
  assert.equal(
    (await fetch("http://127.0.0.1:" + port + "/login")).status,
    404,
  );
  assert(!logs.includes("前端:"));
  assert(!logs.includes("gateway"));
});
