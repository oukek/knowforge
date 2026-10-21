import { reactive, computed } from "vue";
export const store = reactive({
  catalog: null,
  state: null,
  loading: true,
  error: "",
  toast: "",
  searchOpen: false,
  sidebarOpen: false,
  now: Date.now(),
});
let toastTimer;
export function toast(message) {
  store.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (store.toast = ""), 3500);
}
export async function request(path, method = "GET", body) {
  const response = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("服务响应异常，请确认 Node 服务已启动");
  }
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
export async function init() {
  store.loading = true;
  store.error = "";
  try {
    const data = await request("/bootstrap");
    store.catalog = data.catalog;
    store.state = data.state;
  } catch (e) {
    store.error = e.message;
  } finally {
    store.loading = false;
  }
}
export async function mutate(path, method = "POST", body) {
  try {
    const data = await request(path, method, body);
    if (
      data.state &&
      (data.state.revision || 0) >= (store.state?.revision || 0)
    )
      store.state = data.state;
    return data;
  } catch (e) {
    toast(e.message);
    return null;
  }
}
export const lessons = computed(() => store.catalog?.lessons || []);
export const questions = computed(() => store.catalog?.questions || []);
export const modules = computed(() => store.catalog?.modules || []);
export const doneCount = computed(
  () =>
    Object.values(store.state?.progress || {}).filter(
      (x) => x.status === "done",
    ).length,
);
export const dueReviews = computed(() =>
  (store.state?.reviews || []).filter((x) => Date.parse(x.dueAt) <= store.now),
);
export function moduleFor(id) {
  return modules.value.find((x) => x.id === id);
}
export function lessonFor(id) {
  return lessons.value.find((x) => x.id === id);
}
export const typeLabel = {
  choice: "单选题",
  oral: "原理问答",
  scenario: "场景分析",
  coding: "代码实验",
};
export const ratingLabels = ["忘记了", "有些困难", "能独立回答", "掌握很稳"];
export function dateLabel(value) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function localDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function progressFor(id) {
  const all = lessons.value.filter((x) => x.moduleId === id);
  return {
    total: all.length,
    done: all.filter((x) => store.state?.progress[x.id]?.status === "done")
      .length,
  };
}
export async function bookmark(id) {
  const active = !store.state.bookmarks.includes(id);
  const result = await mutate("/bookmarks/" + id, "PUT", { active });
  if (result) toast(active ? "已加入收藏" : "已移出收藏");
}
export function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    toast("浏览器草稿保存失败，请及时复制代码");
  }
}
