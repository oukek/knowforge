import express from "express";
import { request } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function createFrontend({
  backendPort,
  serveClient = true,
  distPath = resolve("dist"),
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    [
      "/api",
      "/runner.js",
      "/python-runner.js",
      "/python-runtime",
      "/runner-frame",
    ],
    (req, res) => {
      // Keep the browser-facing Host so Origin checks and Worker CSP stay same-origin.
      const upstream = request(
        {
          hostname: "127.0.0.1",
          port: backendPort,
          path: req.originalUrl,
          method: req.method,
          headers: req.headers,
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.on("error", () => res.destroy());
          response.pipe(res);
        },
      );
      upstream.on("error", () => {
        if (res.headersSent) return res.destroy();
        res.status(502).json({ error: "后端暂不可用，请稍后重试" });
      });
      req.on("aborted", () => upstream.destroy());
      res.on("close", () => {
        if (!res.writableEnded) upstream.destroy();
      });
      req.pipe(upstream);
    },
  );
  if (serveClient) {
    app.use(express.static(distPath, { maxAge: 0 }));
    app.get("/{*path}", (_, res) => {
      const index = resolve(distPath, "index.html");
      if (!existsSync(index))
        return res.status(503).send("请先运行 npm run build 构建前端。");
      res.sendFile(index);
    });
  }
  return app;
}
