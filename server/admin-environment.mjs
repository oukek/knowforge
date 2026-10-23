import { execFile } from "node:child_process";
import { promisify, parseEnv } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { parseAdminCommand, adminUsage } from "./admin-command.mjs";

const execute = promisify(execFile);
export const databaseKeys = [
  "DB_DRIVER",
  "DB_PATH",
  "MYSQL_HOST",
  "MYSQL_PORT",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MYSQL_DATABASE",
  "MYSQL_TABLE_PREFIX",
  "MYSQL_SSL",
  "MYSQL_SSL_CA",
];

export function parseAdminInvocation(args) {
  const rest = [],
    pm2 = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pm2") {
      const name = args[++i];
      if (!name || name.startsWith("--")) throw Error(adminUsage);
      pm2.push(name);
    } else rest.push(args[i]);
  }
  if (pm2.length > 1) throw Error("--pm2 只能指定一个进程");
  return { selector: parseAdminCommand(rest), pm2: pm2[0] };
}
function pickDatabaseEnv(input = {}) {
  const env = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return env;
  for (const key of databaseKeys) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (!["string", "number", "boolean"].includes(typeof value))
      throw Error("数据库环境变量 " + key + " 格式不正确");
    env[key] = String(value);
  }
  return env;
}
export function selectPm2Process(list, target) {
  if (!Array.isArray(list)) throw Error("PM2 返回的进程列表格式不正确");
  const matches = list.filter((p) =>
    /^\d+$/.test(target)
      ? String(p.pm_id ?? p.pm2_env?.pm_id) === String(Number(target))
      : (p.name || p.pm2_env?.name) === target,
  );
  if (!matches.length)
    throw Error(
      "未找到指定 PM2 进程。请先运行 pm2 list，并使用相同系统用户和 PM2_HOME 执行命令。",
    );
  if (matches.length > 1)
    throw Error(
      "PM2 中存在多个同名进程，请通过 --pm2 指定唯一的 pm_id；本项目使用单实例运行。",
    );
  const selected = matches[0];
  if (!selected.pm2_env || typeof selected.pm2_env !== "object")
    throw Error("PM2 进程环境不可用");
  return selected;
}
export function databaseContext(
  environment,
  cwd,
  { exists = existsSync } = {},
) {
  const env = pickDatabaseEnv(environment);
  const driver = env.DB_DRIVER || "sqlite";
  if (!["mysql", "sqlite"].includes(driver))
    throw Error("DB_DRIVER must be mysql or sqlite");
  if (driver === "mysql") {
    if (!env.MYSQL_DATABASE || !env.MYSQL_USER)
      throw Error(
        "MySQL 环境缺少 MYSQL_DATABASE 或 MYSQL_USER，请检查所选 PM2 进程的环境变量。",
      );
    if (env.MYSQL_SSL_CA) env.MYSQL_SSL_CA = resolve(cwd, env.MYSQL_SSL_CA);
    return { env, cwd, driver };
  }
  if (env.DB_PATH === ":memory:")
    throw Error("独立管理员命令无法连接另一个进程的内存数据库");
  const dbPath = resolve(cwd, env.DB_PATH || "runtime/study.sqlite");
  if (!exists(dbPath))
    throw Error(
      "未找到管理员命令要使用的 SQLite 数据库，已停止操作，未创建空库。PM2 部署请添加 --pm2 进程名，或提供与服务一致的 DB_DRIVER、MYSQL_* 环境变量。",
    );
  return { env, cwd, driver, dbPath };
}
export async function readPm2Database(
  target,
  { run = execute, read = readFileSync, exists = existsSync } = {},
) {
  let output;
  try {
    const result = await run("pm2", ["jlist"], {
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
      encoding: "utf8",
      env: { ...process.env, PM2_SILENT: "true" },
    });
    output = result.stdout;
  } catch {
    // PM2 output may contain credentials; never forward stdout/stderr or the error object.
    throw Error(
      "无法读取 PM2 进程配置。请确认 pm2 在 PATH 中，并使用管理该应用的系统用户和 PM2_HOME 执行。",
    );
  }
  let list;
  try {
    list = JSON.parse(output);
  } catch {
    throw Error(
      "PM2 未返回有效 JSON 进程列表；请确认当前用户能正常执行 pm2 list。",
    );
  }
  const selected = selectPm2Process(list, target),
    meta = selected.pm2_env;
  if (typeof meta.pm_cwd !== "string" || !isAbsolute(meta.pm_cwd))
    throw Error("PM2 缺少有效的应用工作目录，无法确定数据库位置");
  let fileEnv = {};
  try {
    fileEnv = pickDatabaseEnv(
      parseEnv(read(resolve(meta.pm_cwd, ".env"), "utf8")),
    );
  } catch (error) {
    if (error.code !== "ENOENT")
      throw Error("无法读取 PM2 应用目录中的可选 .env 配置");
  }
  const env = {
    ...fileEnv,
    ...pickDatabaseEnv(meta.env),
    ...pickDatabaseEnv(meta),
  };
  return {
    ...databaseContext(env, meta.pm_cwd, { exists }),
    processName: selected.name || meta.name || target,
    pmId: selected.pm_id ?? meta.pm_id,
  };
}
export function applyDatabaseEnvironment(env) {
  // Avoid mixing credentials from the invoking SSH shell with the selected app.
  for (const key of databaseKeys) delete process.env[key];
  for (const [key, value] of Object.entries(env))
    if (databaseKeys.includes(key)) process.env[key] = value;
}
