import { createApp } from "./app.mjs";
import { createServer } from "node:http";
const port = Number(process.env.PORT || 6666);
const development = process.argv.includes("--dev");
const { app, store } = createApp({
  dbPath: process.env.DB_PATH,
  serveClient: !development,
});
const server = createServer(app);
let vite;
if (development) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
server.listen(port, "127.0.0.1", () =>
  console.log(`KnowForge: http://127.0.0.1:${port}`),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(1), 5000).unref();
  await vite?.close();
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
