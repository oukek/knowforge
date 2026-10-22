import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

const archive = resolve(process.env.DEPLOY_ARCHIVE || process.argv[2] || "");
assert(archive.endsWith(".tar.gz"), "Pass a deployment .tar.gz archive");
const stage = mkdtempSync(join(tmpdir(), "knowforge-deploy-check-"));
let child;
let exited;
let output = "";

async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

try {
  execFileSync("tar", ["-xzf", archive, "-C", stage]);
  const cwd = join(stage, "knowforge");
  execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd,
    stdio: "inherit",
    timeout: 300000,
  });
  const frontendPort = await freePort();
  let backendPort = await freePort();
  while (backendPort === frontendPort) backendPort = await freePort();
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: "production",
      FRONTEND_PORT: String(frontendPort),
      PORT: String(backendPort),
      DB_DRIVER: "sqlite",
      DB_PATH: join(stage, "smoke.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  exited = once(child, "exit");
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const base = `http://127.0.0.1:${frontendPort}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      ready = response.ok;
    } catch {}
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert(ready, `Deployment server did not start: ${output}`);
  const page = await fetch(`${base}/learn/js-event-loop`);
  assert.equal(page.status, 200);
  assert((await page.text()).includes("KnowForge"));
  const registration = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      username: "smokecheck",
      password: "production-smoke-check",
    }),
  });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  const { csrfToken } = await registration.json();
  const bootstrap = await (
    await fetch(`${base}/api/bootstrap`, { headers: { Cookie: cookie } })
  ).json();
  assert(bootstrap.catalog.lessons.length > 0);
  for (const path of [
    "/runner.js",
    "/python-runner.js",
    "/python-runtime/pyodide.js",
    "/python-runtime/pyodide.asm.wasm",
    "/api/export/handbook",
    "/api/export/python-demo",
  ]) {
    const response = await fetch(`${base}${path}`, { method: "HEAD" });
    assert.equal(response.status, 200, path);
  }
  const note = await fetch(
    `${base}/api/notes/${bootstrap.catalog.lessons[0].id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        Cookie: cookie,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ content: "deployment smoke check" }),
    },
  );
  assert.equal(note.status, 200);
  console.log(
    "Deployment smoke check passed with production dependencies only.",
  );
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 7000);
    try {
      await exited;
    } finally {
      clearTimeout(timeout);
    }
  }
  rmSync(stage, { recursive: true, force: true });
}
