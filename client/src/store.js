import { reactive, computed } from "vue";
export const store = reactive({
  user: null,
  csrfToken: "",
  catalog: null,
  database: "sqlite",
  state: null,
  loading: true,
  error: "",
  toast: "",
  searchOpen: false,
  sidebarOpen: false,
  now: Date.now(),
});
let toastTimer;
let sessionGeneration = 0;
export function toast(message) {
  store.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (store.toast = ""), 3500);
}
export async function request(path, method = "GET", body) {
  const userId = store.user?.id;
  const response = await fetch("/api" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(store.csrfToken && method !== "GET"
        ? { "X-CSRF-Token": store.csrfToken }
        : {}),
      ...(store.user && !path.startsWith("/auth/")
        ? { "X-KnowForge-User": store.user.id }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("服务响应异常，请确认 Node 服务已启动");
  }
  if (!response.ok) {
    if (
      userId === store.user?.id &&
      ((response.status === 401 && !path.startsWith("/auth/")) ||
        data.code === "SESSION_CHANGED")
    )
      clearSession();
    const error = new Error(data.error || "请求失败");
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}
function clearSession() {
  sessionGeneration++;
  store.loading = false;
  store.user = null;
  store.csrfToken = "";
  store.catalog = null;
  store.state = null;
  store.searchOpen = false;
  store.sidebarOpen = false;
}
export async function signIn(mode, credentials) {
  const data = await request("/auth/" + mode, "POST", credentials);
  store.user = data.user;
  store.csrfToken = data.csrfToken;
  await init();
  if (store.error) throw new Error(store.error);
}
export async function signOut() {
  const userId = store.user?.id;
  try {
    await request("/auth/logout", "POST", {});
    if (store.user?.id !== userId) return;
    clearSession();
    store.error = "";
  } catch (error) {
    toast(error.message);
  }
}
export async function init() {
  const generation = ++sessionGeneration;
  store.loading = true;
  store.error = "";
  try {
    const auth = await request("/auth/me");
    if (generation !== sessionGeneration) return;
    if (!auth.user) {
      clearSession();
      return;
    }
    store.user = auth.user;
    store.csrfToken = auth.csrfToken;
    const data = await request("/bootstrap");
    if (generation !== sessionGeneration) return;
    store.catalog = data.catalog;
    store.database = data.database || "sqlite";
    store.state = data.state;
  } catch (e) {
    if (generation === sessionGeneration) store.error = e.message;
  } finally {
    if (generation === sessionGeneration) store.loading = false;
  }
}
export async function mutate(path, method = "POST", body) {
  const userId = store.user?.id;
  try {
    const data = await request(path, method, body);
    if (userId !== store.user?.id) return null;
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
    return store.user
      ? localStorage.getItem(`knowforge:${store.user.id}:${key}`)
      : null;
  } catch {
    return null;
  }
}
export function safeStorageSet(key, value) {
  try {
    if (store.user)
      localStorage.setItem(`knowforge:${store.user.id}:${key}`, value);
  } catch {
    toast("浏览器草稿保存失败，请及时复制代码");
  }
}
