// Pyodide 运行在独立 Worker；资源来自本地 node_modules，不依赖外部 CDN。
let runtime;
async function initializePython(reloadRuntime = false) {
  self.postMessage({
    type: "status",
    stage: "manifest",
    text: "正在获取 Python 资源清单…",
  });
  const manifestResponse = await fetch("/python-runtime/manifest.json", {
    cache: "no-store",
  });
  if (!manifestResponse.ok)
    throw new Error(
      `运行资源清单 HTTP ${manifestResponse.status}，请部署最新后端`,
    );
  if (
    !(manifestResponse.headers.get("content-type") || "").includes(
      "application/json",
    )
  )
    throw new Error(
      "Python 资源清单类型错误，应为 JSON；检查 API /python-runtime/ 是否被转发成网页",
    );
  const manifest = await manifestResponse.json();
  if (!/^\/python-runtime\/[\w.-]+\/$/.test(manifest.base))
    throw new Error("无效的 Python 资源路径");
  const files = [
    "pyodide.js",
    "pyodide.asm.mjs",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
  ];
  self.postMessage({
    type: "status",
    stage: "download",
    text: `资源清单已确认，准备加载 Python ${manifest.version}`,
    resources: files.map((name) => ({
      name,
      loaded: 0,
      total: 0,
      status: "pending",
    })),
  });
  // Warm versioned HTTP caches first, with progress and explicit HTTP errors.
  await Promise.all(
    files.map(async (name) => {
      const controller = new AbortController();
      let timeout;
      const reset = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => controller.abort(), 60000);
      };
      reset();
      let bytes = 0,
        total = 0;
      const report = (status, text, log = true) =>
        self.postMessage({
          type: "status",
          stage: "download",
          text,
          log,
          resource: { name, loaded: bytes, total, status },
        });
      report("loading", `正在读取 ${name}`);
      try {
        const response = await fetch(manifest.base + name, {
          cache: reloadRuntime ? "reload" : "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
        if (
          name.endsWith(".wasm") &&
          !(response.headers.get("content-type") || "").includes(
            "application/wasm",
          )
        )
          throw new Error(
            `${name} MIME 错误，应为 application/wasm；检查 Nginx/CDN 回源`,
          );
        // Encoded Content-Length describes compressed bytes; read() yields decoded bytes.
        if (!response.headers.get("content-encoding"))
          total = Number(response.headers.get("content-length")) || 0;
        let reported = 0;
        if (response.body) {
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            reset();
            if (performance.now() - reported > 500) {
              report(
                "loading",
                `${name} 已读取 ${(bytes / 1048576).toFixed(1)} MB`,
                false,
              );
              reported = performance.now();
            }
          }
        } else bytes = (await response.arrayBuffer()).byteLength;
        report("ready", `${name} 已就绪 · ${(bytes / 1048576).toFixed(2)} MB`);
      } catch (error) {
        const message = `${name} 下载失败：${error.name === "AbortError" ? "60 秒无网络进展" : error.message}`;
        report("failed", message);
        throw new Error(message);
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
  self.postMessage({
    type: "status",
    stage: "initialize",
    text: `Python ${manifest.version} · 编译 WebAssembly 与初始化标准库…`,
  });
  importScripts(manifest.base + "pyodide.js");
  return await loadPyodide({
    indexURL: manifest.base,
    packageBaseUrl: manifest.base,
  });
}
self.onmessage = async ({ data }) => {
  const logs = [];
  let overflow = false;
  function output(level, text) {
    if (logs.length >= 200) {
      overflow = true;
      return;
    }
    const entry = { level, text: String(text).slice(0, 3000) };
    logs.push(entry);
    self.postMessage({ type: "console", entry });
  }
  try {
    self.postMessage({
      type: "status",
      stage: "connect",
      text: "Python 运行服务已连接",
    });
    if (!runtime) {
      runtime = await initializePython(data.reloadRuntime === true);
    }
    runtime.setStdout({ batched: (text) => output("log", text) });
    runtime.setStderr({ batched: (text) => output("error", text) });
    runtime.setStdin({ error: true });
    self.postMessage({
      type: "ready",
      version: runtime.runPython("import sys; sys.version.split()[0]"),
    });
    const start = performance.now();
    const scope = runtime.toPy({ __name__: "__main__" });
    let results;
    try {
      await runtime.runPythonAsync(data.code, { globals: scope });
      if (data.mode !== "snippet") {
        results = [];
        for (const test of data.tests ?? []) {
          const at = performance.now();
          try {
            await runtime.runPythonAsync(test.code, { globals: scope });
            results.push({
              name: test.name,
              passed: true,
              ms: Math.round(performance.now() - at),
            });
          } catch (error) {
            results.push({
              name: test.name,
              passed: false,
              error: String(error.message).slice(-2500),
              ms: Math.round(performance.now() - at),
            });
          }
        }
      }
    } finally {
      scope.destroy();
    }
    self.postMessage({
      type: "done",
      logs,
      results,
      overflow,
      durationMs: Math.round(performance.now() - start),
    });
  } catch (error) {
    self.postMessage({
      type: "done",
      logs,
      overflow,
      error: String(error.message ?? error).slice(-4000),
    });
  }
};
