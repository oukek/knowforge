import { PRODUCTION_API_ORIGIN } from "../shared/deployment.mjs";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { tableColumns } from "../server/study-store.mjs";
import { accountTables } from "../server/account-schema.mjs";

const archive = resolve(process.env.DEPLOY_ARCHIVE || process.argv[2] || "");
assert(archive.endsWith(".tar.gz"), "Pass a deployment .tar.gz archive");
const stage = mkdtempSync(join(tmpdir(), "knowforge-deploy-check-"));
let child;
let exited;
let output = "";
const mysqlCheck = process.env.CHECK_DEPLOY_MYSQL === "1";
const mysqlPrefix = `kf_smoke_${randomBytes(8).toString("hex")}_`;
let mysqlStore;

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
  if (mysqlCheck) {
    const { createMySQLStore } = await import("../server/mysql-store.mjs");
    mysqlStore = await createMySQLStore({ prefix: mysqlPrefix });
  }
  assert.deepEqual(
    readdirSync(cwd).sort(),
    [
      "build-info.json",
      "data",
      "package-lock.json",
      "package.json",
      "resources",
      "runtime",
      "server",
    ].sort(),
    "Backend archive must contain only the standalone runtime",
  );
  const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    "express",
    "mysql2",
    "pyodide",
    "zod",
  ]);
  assert.equal(manifest.scripts.start, "node server/index.mjs");
  const lock = JSON.parse(readFileSync(join(cwd, "package-lock.json"), "utf8"));
  for (const name of [
    "vue",
    "vite",
    "codemirror",
    "prettier",
    "esbuild",
    "nodemon",
  ])
    assert(
      !lock.packages[`node_modules/${name}`],
      `${name} must not be in the backend runtime`,
    );
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
      DB_DRIVER: mysqlCheck ? "mysql" : "sqlite",
      MYSQL_TABLE_PREFIX: mysqlPrefix,
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
  for (const path of ["/", "/login", "/learn/js-event-loop"])
    assert.equal(
      (await fetch(base + path)).status,
      404,
      "Backend gateway must not host frontend pages",
    );
  assert.equal((await fetch(`${base}/api/bootstrap`)).status, 401);
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
  const { csrfToken, user: registeredUser } = await registration.json();
  assert.match(registeredUser.publicId, /^[1-9]\d{7}$/);
  const bootstrap = await (
    await fetch(`${base}/api/bootstrap`, { headers: { Cookie: cookie } })
  ).json();
  assert(bootstrap.catalog.lessons.length > 0);
  assert.equal(bootstrap.database, mysqlCheck ? "mysql" : "sqlite");
  assert.equal(bootstrap.catalog.curriculum.deepLessons, 39);
  assert.equal(bootstrap.catalog.curriculum.aiFoundationLessons, 24);
  assert.equal(bootstrap.catalog.curriculum.publicInterviewQuestions, 60);
  assert.equal(bootstrap.catalog.glossary.length, 108);
  const aiStatus = await (
    await fetch(base + "/api/ai/status", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(aiStatus.account.balance, 0);
  assert.equal(
    (
      await fetch(base + "/api/admin/ai/config", {
        headers: { Cookie: cookie },
      })
    ).status,
    403,
  );
  const cliEnv = {
    ...process.env,
    DB_DRIVER: mysqlCheck ? "mysql" : "sqlite",
    DB_PATH: join(stage, "smoke.sqlite"),
    MYSQL_TABLE_PREFIX: mysqlPrefix,
  };
  execFileSync(
    process.execPath,
    ["server/admin.mjs", "promote", "--id", registeredUser.publicId],
    { cwd, env: cliEnv, timeout: 10000 },
  );
  assert.equal(
    (
      await fetch(base + "/api/admin/ai/config", {
        headers: { Cookie: cookie },
      })
    ).status,
    200,
  );
  execFileSync(
    process.execPath,
    ["server/admin.mjs", "demote", "--id", registeredUser.id],
    {
      cwd,
      env: cliEnv,
      timeout: 10000,
    },
  );
  assert.equal(
    (
      await fetch(base + "/api/admin/ai/config", {
        headers: { Cookie: cookie },
      })
    ).status,
    403,
  );
  const pythonManifest = await (
    await fetch(`${base}/python-runtime/manifest.json`)
  ).json();
  const wasm = await fetch(base + pythonManifest.base + "pyodide.asm.wasm", {
    method: "HEAD",
  });
  assert.equal(wasm.status, 200);
  assert.match(wasm.headers.get("content-type"), /application\/wasm/);
  assert.match(wasm.headers.get("cache-control"), /immutable/);
  const outputCheck = await fetch(
    `${base}/api/lesson-exercises/output-js-promise-combinators/attempt`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        Cookie: cookie,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        answer: "['慢', '快']\n['fulfilled', 'rejected']\n可用",
      }),
    },
  );
  assert.equal(outputCheck.status, 200);
  assert.equal((await outputCheck.json()).feedback.passed, true);
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
  const saved = await (
    await fetch(`${base}/api/bootstrap`, { headers: { Cookie: cookie } })
  ).json();
  assert.equal(
    saved.state.notes[bootstrap.catalog.lessons[0].id].content,
    "deployment smoke check",
  );
  const worker = await fetch(`${base}/python-runner.js`, {
    headers: { "X-Forwarded-Proto": "https" },
  });
  assert(
    worker.headers
      .get("content-security-policy")
      .includes(PRODUCTION_API_ORIGIN + "/python-runtime/"),
  );
  if (mysqlCheck)
    assert(
      !output.includes("ExperimentalWarning: SQLite"),
      "MySQL production bundle must not load the SQLite adapter",
    );
  const profileHeaders = {
    "Content-Type": "application/json",
    Cookie: cookie,
    "X-CSRF-Token": csrfToken,
  };
  const profile = await fetch(base + "/api/auth/profile", {
    method: "PUT",
    headers: profileHeaders,
    body: JSON.stringify({ displayName: "独立包个人中心" }),
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.publicId, registeredUser.publicId);
  const password = await fetch(base + "/api/auth/password", {
    method: "POST",
    headers: profileHeaders,
    body: JSON.stringify({
      currentPassword: "production-smoke-check",
      newPassword: "smoke-password-updated",
    }),
  });
  assert.equal(password.status, 200);
  const passwordResult = await password.json();
  assert.notEqual(passwordResult.csrfToken, csrfToken);
  const changedCookie = password.headers.get("set-cookie").split(";")[0];
  assert.notEqual(changedCookie, cookie);
  assert.equal(
    (await fetch(base + "/api/bootstrap", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/api/bootstrap", {
        headers: { Cookie: changedCookie },
      })
    ).status,
    200,
  );
  console.log(
    "Standalone backend smoke check passed: compiled entry, locked runtime dependencies, login, persistence, Workers and downloads; no frontend pages or source directories.",
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
  if (mysqlStore) {
    try {
      for (const table of [...Object.keys(tableColumns), ...accountTables])
        await mysqlStore.exec(
          `DROP TABLE IF EXISTS \`${mysqlPrefix}${table}\``,
        );
    } finally {
      await mysqlStore.close();
    }
  }
  rmSync(stage, { recursive: true, force: true });
}
