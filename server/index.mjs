import { loadEnvFile } from "node:process";
try {
  loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
import { createApp } from "./app.mjs";
import { createFrontend } from "./frontend.mjs";
import { createServer } from "node:http";
const port = Number(process.env.PORT || 6666);
const frontendPort = Number(process.env.FRONTEND_PORT || 16666);
const development = process.argv.includes("--dev");
const withFrontend = development || process.argv.includes("--preview");
let app, store, ai;
try {
  ({ app, store, ai } = await createApp({
    dbPath: process.env.DB_PATH,
    driver: process.env.DB_DRIVER || "sqlite",
    serveClient: false,
  }));
} catch (error) {
  console.error(`KnowForge 数据库初始化失败: ${error.message}`);
  process.exit(1);
}
const server = createServer(app);
const frontend = withFrontend
  ? createFrontend({
      backendPort: port,
      serveClient: !development,
    })
  : null;
const frontendServer = frontend ? createServer(frontend) : null;
let vite;
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(1), 5000).unref();
  await vite?.close();
  await Promise.all(
    [frontendServer, server]
      .filter(Boolean)
      .map((httpServer) => new Promise((done) => httpServer.close(done))),
  );
  await ai?.shutdown();
  await store.close();
  process.exit(code);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

function listen(httpServer, listenPort) {
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(listenPort, "127.0.0.1", () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });
}

try {
  if (development) {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: frontendServer } },
      appType: "spa",
    });
    frontend.use(vite.middlewares);
  }
  await listen(server, port);
  if (frontendServer) {
    await listen(frontendServer, frontendPort);
    console.log(`KnowForge 前端: http://127.0.0.1:${frontendPort}`);
  }
  console.log(`KnowForge 后端 API: http://127.0.0.1:${port}/api`);
  console.log(`KnowForge 数据库: ${store.driver}`);
} catch (error) {
  console.error(`KnowForge 启动失败: ${error.message}`);
  await shutdown(1);
}
