import { reactive, ref, watch, onBeforeUnmount } from "vue";
import { store, request, mutate } from "./store.js";
import { monitorAiRun } from "./ai-task-monitor.mjs";
export const ai = reactive({
  loaded: false,
  configured: false,
  available: false,
  tariff: null,
  tariffs: [],
  budgets: null,
  account: { balance: 0, reserved: 0, available: 0 },
  answerLimit: 3000,
});
export const featureLabel = {
  grade: "主观题评阅",
  variants: "举一反三",
  interview: "AI 面试",
  test: "连接测试",
  models: "读取模型",
};
export const aiStateLabel = {
  running: "后台处理中",
  succeeded: "已完成",
  failed: "调用失败",
  released: "已释放额度",
  pending: "额度待核对",
};
export async function refreshAi() {
  const userId = store.user?.id;
  if (!userId) return;
  const data = await request("/ai/status");
  if (store.user?.id === userId) Object.assign(ai, data, { loaded: true });
}
watch(
  () => store.user?.id,
  (id) => {
    Object.assign(ai, {
      loaded: false,
      configured: false,
      available: false,
      tariff: null,
      tariffs: [],
      budgets: null,
      account: { balance: 0, reserved: 0, available: 0 },
    });
    if (id) void refreshAi().catch(() => {});
  },
  { immediate: true },
);
export async function refreshAiLearning() {
  const userId = store.user?.id;
  const data = await mutate("/bootstrap", "GET");
  if (data && store.user?.id === userId)
    store.generatedQuestions = data.generatedQuestions || [];
}
export function useAiTask() {
  const run = ref(null),
    busy = ref(false),
    error = ref(""),
    connection = ref("idle");
  let controller,
    disposed = false,
    generation = 0,
    reused = false;
  const stop = () => {
    generation++;
    controller?.abort();
    controller = null;
    busy.value = false;
    connection.value = "idle";
  };
  const accept = (value, current) => {
    if (generation !== current) return;
    run.value = { ...value, reused };
    if (value.status !== "running") {
      busy.value = false;
      connection.value = "idle";
      // Delivery succeeded even if a secondary balance/learning refresh fails.
      void Promise.allSettled([refreshAi(), refreshAiLearning()]);
    }
  };
  const follow = async (id, current) => {
    controller = new AbortController();
    const signal = controller.signal;
    try {
      await monitorAiRun({
        id,
        signal,
        request,
        onRun: (value) => accept(value, current),
        onConnection: (value) => {
          if (generation === current && busy.value) connection.value = value;
        },
      });
    } catch (e) {
      if (generation === current && !signal.aborted) {
        busy.value = false;
        connection.value = "offline";
        error.value = e.message + "，可从 AI 历史查看任务";
      }
    }
  };
  async function start(path, body) {
    if (disposed) return;
    stop();
    const current = generation;
    busy.value = true;
    error.value = "";
    run.value = null;
    try {
      const data = await request(path, "POST", {
        ...body,
        requestId: body.requestId || crypto.randomUUID(),
      });
      if (generation !== current) return;
      reused = !!data.reused;
      accept(data.run, current);
      if (data.run.status === "running") void follow(data.run.id, current);
      return data.run;
    } catch (e) {
      if (generation === current) {
        busy.value = false;
        error.value = e.message;
      }
    }
  }
  async function cancel() {
    if (run.value) {
      try {
        await request("/ai/runs/" + run.value.id + "/cancel", "POST", {});
      } catch (e) {
        error.value = e.message;
      }
    }
  }
  function resume(id) {
    if (disposed) return;
    stop();
    reused = false;
    busy.value = true;
    error.value = "";
    run.value = null;
    void follow(id, generation);
  }
  watch(
    () => store.user?.id,
    () => {
      stop();
      run.value = null;
      error.value = "";
    },
    { flush: "sync" },
  );
  onBeforeUnmount(() => {
    disposed = true;
    stop();
  });
  return { run, busy, error, connection, start, cancel, stop, resume };
}
