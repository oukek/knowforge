import { ref, onBeforeUnmount } from "vue";
import { createCodeWorker } from "./code-worker.js";
export function useCodeRunner() {
  const running = ref(false),
    result = ref(null),
    logs = ref([]),
    phase = ref(""),
    initialization = ref(null);
  let worker,
    timer,
    settle,
    generation = 0;
  function event(text, level = "info") {
    const state = initialization.value;
    if (!state) return;
    if (state.events.at(-1)?.text === text) {
      if (level === "error") state.events.at(-1).level = "error";
      return;
    }
    state.events.push({
      text,
      level,
      elapsedMs: Math.max(0, Date.now() - state.startedAt),
    });
    if (state.events.length > 80)
      state.events.splice(0, state.events.length - 80);
  }
  function finish(value, token) {
    if (token !== generation || !running.value) return;
    if (initialization.value?.status === "loading") {
      const state = initialization.value;
      state.status = value.cancelled
        ? "cancelled"
        : value.error
          ? "failed"
          : "ready";
      if (state.status === "failed") {
        state.error = value.error;
        value = { ...value, initializationFailed: true };
        event(value.error, "error");
      } else if (value.cancelled) event("已取消 Python 环境加载");
    }
    clearTimeout(timer);
    worker?.terminate();
    worker = null;
    running.value = false;
    phase.value = "";
    result.value = { ...value, logs: value.logs ?? [...logs.value] };
    settle?.(result.value);
    settle = null;
  }
  function stop(reason = "已停止执行。") {
    if (!running.value) return;
    finish({ error: reason, cancelled: true }, generation);
  }
  function run(payload, timeLimit = 4000) {
    if (running.value) stop("上一轮执行已被替换。");
    const token = ++generation;
    result.value = null;
    logs.value = [];
    running.value = true;
    const python = payload.language === "python";
    initialization.value = python
      ? {
          runId: token,
          status: "loading",
          stage: "connect",
          startedAt: Date.now(),
          message: "正在连接 Python 运行服务…",
          resources: [],
          events: [],
          error: "",
        }
      : null;
    if (python) event("正在连接 Python 运行服务…");
    phase.value = python ? "正在加载本地 Python 运行环境…" : "";
    return new Promise((resolve) => {
      settle = resolve;
      try {
        worker = createCodeWorker(python);
        function deadline(limit, initializing = false) {
          clearTimeout(timer);
          timer = setTimeout(
            () =>
              finish(
                {
                  error: initializing
                    ? "Python 环境初始化超时（首次需下载约 13MB）。最后阶段：" +
                      phase.value +
                      "。请检查网络及 API 域名的 /python-runtime/ 资源，稍后重试；已下载资源会复用浏览器缓存。"
                    : "执行超过 " +
                      limit / 1000 +
                      " 秒，已终止。检查无限循环或未完成的异步任务。",
                  timeout: true,
                },
                token,
              ),
            limit,
          );
        }
        if (python) deadline(180000, true);
        else
          timer = setTimeout(
            () =>
              finish(
                {
                  error:
                    "执行超过 " +
                    timeLimit / 1000 +
                    " 秒，已终止。检查无限循环、未清理的定时器或未完成的 Promise。",
                  timeout: true,
                },
                token,
              ),
            timeLimit,
          );
        worker.onerror = (event) => {
          event.preventDefault();
          finish({ error: "运行失败：" + event.message }, token);
        };
        worker.onmessage = ({ data }) => {
          if (token !== generation || !running.value) return;
          if (data.type === "status") {
            phase.value = data.text;
            if (initialization.value?.status === "loading") {
              const state = initialization.value;
              state.message = data.text;
              if (
                ["connect", "manifest", "download", "initialize"].includes(
                  data.stage,
                )
              )
                state.stage = data.stage;
              if (data.resources) state.resources = data.resources;
              if (data.resource) {
                const resource = state.resources.find(
                  (item) => item.name === data.resource.name,
                );
                if (resource) Object.assign(resource, data.resource);
              }
              if (data.log !== false)
                event(
                  data.text,
                  data.resource?.status === "failed" ? "error" : "info",
                );
            }
            return;
          }
          if (data.type === "ready") {
            phase.value = "Python " + data.version + " · 正在执行";
            if (initialization.value?.status === "loading") {
              initialization.value.status = "ready";
              event(`Python ${data.version} 已就绪，开始执行代码`);
            }
            deadline(timeLimit);
            return;
          }
          if (data.type === "console") {
            if (logs.value.length < 200) logs.value.push(data.entry);
            return;
          }
          if (data.type === "clear") {
            logs.value = [];
            return;
          }
          finish(data, token);
        };
        // 去除 Vue Proxy，避免结构化克隆失败；题目与脚本均是 JSON 数据。
        worker.postMessage(
          JSON.parse(JSON.stringify({ ...payload, stream: true })),
        );
      } catch (error) {
        finish({ error: "无法启动执行：" + error.message }, token);
      }
    });
  }
  function clear() {
    if (running.value) stop();
    result.value = null;
    logs.value = [];
    phase.value = "";
    initialization.value = null;
  }
  onBeforeUnmount(() => stop("页面已离开，执行已停止。"));
  return { running, result, logs, phase, initialization, run, stop, clear };
}
