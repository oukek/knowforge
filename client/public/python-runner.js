// Pyodide 运行在独立 Worker；资源来自本地 node_modules，不依赖外部 CDN。
let runtime;
self.onmessage = async ({ data }) => {
  const logs = [];
  let overflow = false;
  function output(level, text) {
    if (logs.length >= 200) { overflow = true; return; }
    const entry = { level, text: String(text).slice(0, 3000) };
    logs.push(entry);
    self.postMessage({ type: 'console', entry });
  }
  try {
    self.postMessage({ type: 'status', text: '正在加载本地 Python 运行环境…' });
    if (!runtime) {
      importScripts('/python-runtime/pyodide.js');
      runtime = await loadPyodide({ indexURL: '/python-runtime/' });
    }
    runtime.setStdout({ batched: text => output('log', text) });
    runtime.setStderr({ batched: text => output('error', text) });
    runtime.setStdin({ error: true });
    self.postMessage({ type: 'ready', version: runtime.runPython('import sys; sys.version.split()[0]') });
    const start = performance.now();
    const scope = runtime.toPy({ __name__: '__main__' });
    let results;
    try {
      await runtime.runPythonAsync(data.code, { globals: scope });
      if (data.mode !== 'snippet') {
        results = [];
        for (const test of data.tests ?? []) {
          const at = performance.now();
          try {
            await runtime.runPythonAsync(test.code, { globals: scope });
            results.push({ name: test.name, passed: true, ms: Math.round(performance.now() - at) });
          } catch (error) {
            results.push({ name: test.name, passed: false, error: String(error.message).slice(-2500), ms: Math.round(performance.now() - at) });
          }
        }
      }
    } finally { scope.destroy(); }
    self.postMessage({ type: 'done', logs, results, overflow, durationMs: Math.round(performance.now() - start) });
  } catch (error) {
    self.postMessage({ type: 'done', logs, overflow, error: String(error.message ?? error).slice(-4000) });
  }
};
