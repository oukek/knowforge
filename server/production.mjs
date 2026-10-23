import { PRODUCTION_API_ORIGIN } from "../shared/deployment.mjs";
import { loadEnvFile } from "node:process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "./app.mjs";

try {
  loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const port = Number(process.env.PORT || 6666);
let store, ai;
const servers = [];
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 5000);
  timeout.unref();
  await Promise.all(
    servers.map((server) => new Promise((done) => server.close(done))),
  );
  await ai?.shutdown();
  await store?.close();
  process.exit(code);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

async function listen(app, port) {
  const server = createServer(app);
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

try {
  const built = await createApp({
    driver: process.env.DB_DRIVER || "sqlite",
    dbPath: process.env.DB_PATH,
    serveClient: false,
    publicApiOrigin: PRODUCTION_API_ORIGIN,
    secureCookies: true,
    resourcePaths: {
      runner: resolve("resources/runner.js"),
      pythonRunner: resolve("resources/python-runner.js"),
      handbook: resolve("resources/handbook.md"),
      pythonDemo: resolve("resources/workbench.py"),
    },
  });
  store = built.store;
  ai = built.ai;
  await listen(built.app, port);
  console.log(`KnowForge API: http://127.0.0.1:${port}/api`);
  console.log(`KnowForge 数据库: ${store.driver}`);
} catch (error) {
  console.error(`KnowForge 启动失败: ${error.message}`);
  await shutdown(1);
}
