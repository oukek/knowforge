const fatal = (error) =>
  [401, 403, 404].includes(error.status) || error.code === "SESSION_CHANGED";
const abortError = () => new DOMException("Aborted", "AbortError");
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

// Fetch-based SSE preserves credentials and the existing account identity header.
// Parse complete lines; UTF-8 characters and CRLF may be split across network chunks.
export async function consumeRunEvents(response, onRun, onActivity = () => {}) {
  if (
    !response.headers.get("content-type")?.startsWith("text/event-stream") ||
    !response.body
  )
    throw new Error("实时状态连接暂不可用");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    event = "",
    data = [];
  const dispatch = () => {
    const name = event;
    const value = data.join("\n");
    event = "";
    data = [];
    if (!value) return false;
    if (name === "task-error") {
      const detail = JSON.parse(value);
      throw Object.assign(new Error(detail.error || "状态连接中断"), detail);
    }
    if (name !== "run") return false;
    const run = JSON.parse(value);
    if (typeof run.id !== "string" || typeof run.status !== "string")
      throw new Error("无效任务状态");
    onRun(run);
    return run.status !== "running";
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error("状态连接已断开");
      onActivity();
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length + data.join("").length > 1024 * 1024)
        throw new Error("状态消息超过限制");
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (!line) {
          if (dispatch()) return;
        } else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Reconnect only the observer. Never submit another paid task on transport failure.
export async function monitorAiRun({
  id,
  signal,
  request,
  onRun,
  onConnection,
  pollMs = 1500,
  staleMs = 25000,
}) {
  const path = "/ai/runs/" + encodeURIComponent(id);
  let first = true,
    completed = false;
  const accept = (run) => {
    if (signal.aborted) return;
    if (run.id !== id) throw new Error("任务标识不一致");
    completed = run.status !== "running";
    onRun(run);
  };
  while (!signal.aborted && !completed) {
    onConnection(first ? "connecting" : "reconnecting");
    first = false;
    const connection = new AbortController();
    const abort = () => connection.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) connection.abort();
    let timer;
    const activity = () => {
      clearTimeout(timer);
      timer = setTimeout(abort, staleMs);
      if (!signal.aborted) onConnection("live");
    };
    timer = setTimeout(abort, staleMs);
    try {
      const response = await request(path + "/events", "GET", undefined, {
        signal: connection.signal,
        raw: true,
      });
      await consumeRunEvents(response, accept, activity);
      if (completed) return;
    } catch (error) {
      if (signal.aborted) return;
      if (fatal(error)) throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      connection.abort();
    }
    // Keep reporting progress while SSE is blocked by a proxy, or reconnects.
    for (let index = 0; index < 3 && !completed && !signal.aborted; index++) {
      onConnection("polling");
      const query = new AbortController();
      const abortQuery = () => query.abort();
      signal.addEventListener("abort", abortQuery, { once: true });
      if (signal.aborted) query.abort();
      const deadline = setTimeout(abortQuery, staleMs);
      try {
        accept(await request(path, "GET", undefined, { signal: query.signal }));
      } catch (error) {
        if (signal.aborted) return;
        if (fatal(error)) throw error;
        onConnection("offline");
      } finally {
        clearTimeout(deadline);
        signal.removeEventListener("abort", abortQuery);
        query.abort();
      }
      if (!completed) await pause(pollMs, signal);
    }
  }
}
