import { reactive, ref, watch, onBeforeUnmount } from "vue";
import { store, request, mutate } from "./store.js";
export const ai = reactive({
  loaded: false,
  configured: false,
  available: false,
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
  pending: "用量待核对",
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
    error = ref("");
  let timer,
    generation = 0,
    reused = false;
  const stop = () => {
    generation++;
    clearTimeout(timer);
    busy.value = false;
  };
  const poll = async (id, current) => {
    try {
      const value = await request("/ai/runs/" + id);
      if (generation !== current) return;
      run.value = { ...value, reused };
      if (value.status === "running")
        timer = setTimeout(() => poll(id, current), 1200);
      else {
        busy.value = false;
        await refreshAi();
        await refreshAiLearning();
      }
    } catch (e) {
      if (generation === current) {
        busy.value = false;
        error.value = e.message + "，可从 AI 历史查看任务";
      }
    }
  };
  async function start(path, body) {
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
      run.value = { ...data.run, reused };
      if (data.run.status === "running")
        timer = setTimeout(() => poll(data.run.id, current), 700);
      else {
        busy.value = false;
        await refreshAi();
        await refreshAiLearning();
      }
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
    stop();
    reused = false;
    busy.value = true;
    error.value = "";
    void poll(id, generation);
  }
  watch(() => store.user?.id, stop);
  onBeforeUnmount(stop);
  return { run, busy, error, start, cancel, stop, resume };
}
