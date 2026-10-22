import { ref, onBeforeUnmount } from "vue";
import { createCodeWorker } from "./code-worker.js";
export function useCodeRunner() {
  const running = ref(false),
    result = ref(null),
    logs = ref([]),
    phase = ref("");
  let worker,
    timer,
    settle,
    generation = 0;
  function finish(value, token) {
    if (token !== generation) return;
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
                    ? "Python 运行环境加载超时，请检查本地服务和运行资源。"
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
        if (python) deadline(30000, true);
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
          if (token !== generation) return;
          if (data.type === "status") {
            phase.value = data.text;
            return;
          }
          if (data.type === "ready") {
            phase.value = "Python " + data.version + " · 正在执行";
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
  }
  onBeforeUnmount(() => stop("页面已离开，执行已停止。"));
  return { running, result, logs, phase, run, stop, clear };
}
