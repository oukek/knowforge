import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createStore } from "../server/store.mjs";
import { ensureProfile } from "../server/account-profile.mjs";
import {
  parseAdminInvocation,
  selectPm2Process,
  readPm2Database,
  databaseContext,
  applyDatabaseEnvironment,
  databaseKeys,
} from "../server/admin-environment.mjs";
const exec = promisify(execFile);
function folder(t) {
  const cwd = mkdtempSync(join(tmpdir(), "knowforge-pm2-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}
const missingFile = () => {
  const e = Error("missing");
  e.code = "ENOENT";
  throw e;
};
const processInfo = (overrides = {}) => ({
  pm_id: 2,
  name: "knowforge",
  pm2_env: {
    pm_cwd: "/srv/knowforge",
    DB_DRIVER: "mysql",
    MYSQL_DATABASE: "learning",
    MYSQL_USER: "app",
    MYSQL_PASSWORD: "sensitive-secret",
    ...overrides,
  },
});

test("管理员 --pm2 支持参数顺序、进程名或 ID，拒绝歧义与重复参数", () => {
  const a = parseAdminInvocation([
    "promote",
    "--id",
    "12345678",
    "--pm2",
    "knowforge",
  ]);
  assert.equal(a.pm2, "knowforge");
  assert.equal(a.selector.type, "id");
  assert.equal(
    parseAdminInvocation(["--pm2", "0", "demote", "--username", "alice"]).pm2,
    "0",
  );
  assert.equal(parseAdminInvocation(["promote", "alice"]).pm2, undefined);
  for (const args of [
    ["promote", "alice", "--pm2"],
    ["promote", "alice", "--pm2", "--id"],
    ["promote", "alice", "--pm2", "a", "--pm2", "b"],
  ])
    assert.throws(() => parseAdminInvocation(args));
  assert.equal(selectPm2Process([processInfo()], "2").name, "knowforge");
  assert.equal(selectPm2Process([processInfo()], "knowforge").pm_id, 2);
  assert.throws(
    () => selectPm2Process([processInfo(), processInfo()], "knowforge"),
    /同名进程/,
  );
  assert.throws(() => selectPm2Process([], "knowforge"), /PM2_HOME/);
});

test("PM2 配置优先于应用 .env，数据库路径以 PM2 cwd 为准，其他密钥不复制", async () => {
  const p = processInfo({
    env: {
      MYSQL_HOST: "db.example",
      MYSQL_PASSWORD: "nested-secret",
      MYSQL_SSL_CA: "certs/ca.pem",
      AI_ENCRYPTION_KEY: "not-for-cli",
    },
    MYSQL_SSL: true,
    PORT: 6666,
    API_KEY: "do-not-copy",
  });
  const result = await readPm2Database("knowforge", {
    run: async (file, args, opts) => {
      assert.equal(file, "pm2");
      assert.deepEqual(args, ["jlist"]);
      assert.equal(opts.timeout, 10000);
      return { stdout: JSON.stringify([p]) };
    },
    read: () =>
      'DB_DRIVER=sqlite\nMYSQL_PASSWORD="file-secret"\nMYSQL_TABLE_PREFIX=custom_\nAPI_KEY=file-key',
  });
  assert.equal(result.driver, "mysql");
  assert.equal(result.env.MYSQL_PASSWORD, "sensitive-secret");
  assert.equal(result.env.MYSQL_HOST, "db.example");
  assert.equal(result.env.MYSQL_TABLE_PREFIX, "custom_");
  assert.equal(result.env.MYSQL_SSL, "true");
  assert.equal(result.env.MYSQL_SSL_CA, "/srv/knowforge/certs/ca.pem");
  assert(!("AI_ENCRYPTION_KEY" in result.env));
  assert(!("API_KEY" in result.env));
  assert(!("PORT" in result.env));
});

test("PM2 读取失败与异常 JSON 不回显凭据，不猜测其他进程或数据库", async () => {
  const failures = [
    {
      run: async () => {
        throw Error("credentials-secret-password");
      },
    },
    {
      run: async () => ({ stdout: "invalid-json-credentials-secret-password" }),
    },
    { run: async () => ({ stdout: JSON.stringify([]) }) },
  ];
  for (const patch of failures)
    await assert.rejects(
      readPm2Database("knowforge", { ...patch, read: missingFile }),
      (e) => !e.message.includes("credentials-secret-password"),
    );
  await assert.rejects(
    readPm2Database("knowforge", {
      run: async () => ({
        stdout: JSON.stringify([processInfo({ pm_cwd: "relative/path" })]),
      }),
      read: missingFile,
    }),
    /工作目录/,
  );
  await assert.rejects(
    readPm2Database("knowforge", {
      run: async () => ({
        stdout: JSON.stringify([processInfo({ MYSQL_USER: "" })]),
      }),
      read: missingFile,
    }),
    /MYSQL_USER/,
  );
});

test("缺少数据库环境时不会创建空 SQLite，已有默认库仍可使用；PM2 路径不会跟随终端", async (t) => {
  const cwd = folder(t);
  assert.throws(() => databaseContext({}, cwd), /未创建空库/);
  assert(!existsSync(join(cwd, "runtime/study.sqlite")));
  assert.throws(
    () => databaseContext({ DB_DRIVER: "mysql" }, cwd),
    /MYSQL_DATABASE/,
  );
  assert.throws(
    () => databaseContext({ DB_PATH: ":memory:" }, cwd),
    /内存数据库/,
  );
  mkdirSync(join(cwd, "runtime"));
  writeFileSync(join(cwd, "runtime/study.sqlite"), "placeholder");
  assert.equal(
    databaseContext({}, cwd).dbPath,
    join(cwd, "runtime/study.sqlite"),
  );
  const p = {
    pm_id: 0,
    name: "local",
    pm2_env: { pm_cwd: cwd, DB_PATH: "runtime/study.sqlite" },
  };
  const selected = await readPm2Database("0", {
    run: async () => ({ stdout: JSON.stringify([p]) }),
    read: missingFile,
  });
  assert.equal(selected.dbPath, join(cwd, "runtime/study.sqlite"));
});

test("选择 PM2 环境会清理终端遗留数据库变量，避免密码和前缀混用", (t) => {
  const saved = Object.fromEntries(
    databaseKeys.map((key) => [key, process.env[key]]),
  );
  t.after(() => {
    for (const key of databaseKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  process.env.MYSQL_PASSWORD = "wrong-terminal-password";
  process.env.MYSQL_TABLE_PREFIX = "wrong_";
  applyDatabaseEnvironment({
    DB_DRIVER: "mysql",
    MYSQL_USER: "app",
    MYSQL_DATABASE: "learning",
    MYSQL_PASSWORD: "app-password",
  });
  assert.equal(process.env.MYSQL_PASSWORD, "app-password");
  assert.equal(process.env.MYSQL_TABLE_PREFIX, undefined);
});

test("实际管理员 CLI 可从 PM2 进程配置授权，忽略终端错误连接且不泄漏密钥", async (t) => {
  const cwd = folder(t),
    pmCwd = join(cwd, "app"),
    bins = join(cwd, "bin");
  mkdirSync(pmCwd);
  mkdirSync(bins);
  const dbPath = join(pmCwd, "study.sqlite"),
    store = createStore(dbPath);
  t.after(() => store.close());
  await store.session(async () => {
    await store.run(
      "INSERT INTO auth_users(id,username,passwordHash,createdAt) VALUES(?,?,?,?)",
      "11111111-1111-1111-1111-111111111111",
      "pm2user",
      "not-used-by-role-cli",
      new Date().toISOString(),
    );
    await ensureProfile(
      store,
      { id: "11111111-1111-1111-1111-111111111111", username: "pm2user" },
      () => "12345678",
    );
  });
  const fake = [
    {
      name: "knowforge",
      pm_id: 9,
      pm2_env: {
        pm_cwd: pmCwd,
        DB_DRIVER: "sqlite",
        DB_PATH: "study.sqlite",
        API_KEY: "never-print-this",
      },
    },
  ];
  // An executable fixture keeps argument passing and stdout handling real.
  writeFileSync(
    join(bins, "pm2"),
    "#!" +
      process.execPath +
      "\nprocess.stdout.write(" +
      JSON.stringify(JSON.stringify(fake)) +
      ");\n",
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PATH: bins + ":" + process.env.PATH,
    DB_DRIVER: "mysql",
    MYSQL_DATABASE: "wrong",
    MYSQL_USER: "wrong",
    MYSQL_PASSWORD: "terminal-secret",
    DB_PATH: "missing.sqlite",
  };
  const { stdout, stderr } = await exec(
    process.execPath,
    [
      "server/admin-cli.mjs",
      "promote",
      "--id",
      "12345678",
      "--pm2",
      "knowforge",
    ],
    { env, timeout: 10000 },
  );
  assert(stdout.includes("12345678"));
  assert(stdout.includes("pm_id 9"));
  assert(!stdout.includes("never-print-this"));
  assert(!stderr.includes("terminal-secret"));
  assert.equal(
    (
      await store.get(
        "SELECT role FROM auth_roles WHERE userId=?",
        "11111111-1111-1111-1111-111111111111",
      )
    ).role,
    "admin",
  );
  assert(!existsSync(join(process.cwd(), "missing.sqlite")));
});
