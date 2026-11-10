import { reactive, computed, markRaw } from "vue";
import { apiUrl } from "./api-config.js";
export const store = reactive({
  user: null,
  csrfToken: "",
  catalog: null,
  details: { lessons: {}, questions: {}, labs: {} },
  generatedQuestions: [],
  database: "sqlite",
  state: null,
  loading: true,
  initialized: false,
  error: "",
  toast: "",
  searchOpen: false,
  sidebarOpen: false,
  creditShopOpen: false,
  now: Date.now(),
});
let toastTimer;
let sessionGeneration = 0;
let detailVersions = { lessons: {}, questions: {}, labs: {} };
export function toast(message) {
  store.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (store.toast = ""), 3500);
}
export async function request(path, method = "GET", body, options = {}) {
  const userId = store.user?.id;
  const response = await fetch(apiUrl(path), {
    method,
    signal: options.signal,
    credentials: "include",
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
  if (response.ok && options.raw) return response;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("服务响应异常，请确认 Node 服务已启动");
  }
  if (!response.ok) {
    if (
      userId === store.user?.id &&
      ((response.status === 401 &&
        (!path.startsWith("/auth/") ||
          ["/auth/profile", "/auth/password"].includes(path))) ||
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
  store.initialized = true;
  store.user = null;
  store.csrfToken = "";
  store.catalog = null;
  store.details = { lessons: {}, questions: {}, labs: {} };
  detailVersions = { lessons: {}, questions: {}, labs: {} };
  store.generatedQuestions = [];
  store.state = null;
  store.searchOpen = false;
  store.sidebarOpen = false;
  store.creditShopOpen = false;
}
export async function signIn(mode, credentials) {
  const data = await request("/auth/" + mode, "POST", credentials);
  await acceptSession(data);
}
export async function acceptSession(data) {
  store.user = data.user;
  store.csrfToken = data.csrfToken;
  await init(data);
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
async function updateAccount(path, method, body) {
  const id = store.user?.id,
    generation = sessionGeneration;
  const data = await request(path, method, body);
  if (!id || id !== store.user?.id || generation !== sessionGeneration)
    return null;
  store.user = data.user;
  if (data.csrfToken) store.csrfToken = data.csrfToken;
  return data;
}
export const refreshProfile = () => updateAccount("/auth/profile", "GET");
export const updateProfile = (displayName, avatarId) =>
  updateAccount("/auth/profile", "PUT", {
    displayName,
    ...(avatarId === undefined ? {} : { avatarId }),
  });
export const changePassword = (currentPassword, newPassword) =>
  updateAccount("/auth/password", "POST", { currentPassword, newPassword });
export async function init(knownSession = null) {
  const generation = ++sessionGeneration;
  store.loading = true;
  store.error = "";
  try {
    const auth = knownSession?.user ? knownSession : await request("/auth/me");
    if (generation !== sessionGeneration) return;
    if (!auth.user) {
      clearSession();
      return;
    }
    store.user = auth.user;
    store.csrfToken = auth.csrfToken;
    const [data, catalogResult] = await Promise.all([
      request("/bootstrap?catalog=none"),
      // Older servers return the whole catalog in bootstrap or /catalog.
      request("/catalog/index").then(
        (value) => ({ value }),
        (error) => ({ error }),
      ),
    ]);
    if (generation !== sessionGeneration) return;
    let loadedCatalog = data.catalog || catalogResult.value;
    if (!loadedCatalog && catalogResult.error?.status === 404)
      loadedCatalog = await request("/catalog");
    if (generation !== sessionGeneration) return;
    if (!loadedCatalog || !Array.isArray(loadedCatalog.lessons))
      throw catalogResult.error || new Error("学习资料加载失败，请稍后重试");
    // Curriculum is immutable in the client; avoid wrapping thousands of
    // nested lesson/question objects in Vue's deep reactive proxies.
    store.catalog = markRaw(loadedCatalog);
    store.details = { lessons: {}, questions: {}, labs: {} };
    detailVersions = { lessons: {}, questions: {}, labs: {} };
    store.generatedQuestions = data.generatedQuestions || [];
    store.database = data.database || "sqlite";
    store.state = data.state;
  } catch (e) {
    if (generation === sessionGeneration) store.error = e.message;
  } finally {
    if (generation === sessionGeneration) {
      store.loading = false;
      store.initialized = true;
    }
  }
}
let initialization;
export function ensureInitialized() {
  if (store.initialized) return Promise.resolve();
  initialization ??= init().finally(() => {
    initialization = null;
  });
  return initialization;
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
const pendingDetails = new Map();
const limits = { lessons: 80, questions: 200, labs: 30 };
export async function refreshCatalogIndex() {
  const generation = sessionGeneration,
    userId = store.user?.id;
  const index = await request("/catalog/index");
  if (generation !== sessionGeneration || userId !== store.user?.id)
    return false;
  if (
    !index.summaryOnly ||
    !Array.isArray(index.lessons) ||
    !index.contentVersion
  )
    throw new Error("学习资料索引无效，请稍后重试");
  store.catalog = markRaw(index);
  return true;
}
function remember(type, item, protectedIds = new Set()) {
  const records = store.details[type];
  if (!records[item.id] && Object.keys(records).length >= limits[type]) {
    const oldest = Object.keys(records).find((id) => !protectedIds.has(id));
    if (oldest) {
      delete records[oldest];
      delete detailVersions[type][oldest];
    }
  }
  detailVersions[type][item.id] = store.catalog.contentVersion;
  records[item.id] = markRaw(item);
}
export async function loadDetail(type, id) {
  if (!id || !store.catalog) return null;
  const summary = store.catalog[type]?.find((entry) => entry.id === id);
  const generated =
    type === "questions" && store.generatedQuestions.find((q) => q.id === id);
  if (generated) return generated;
  if (
    !summary &&
    (!store.catalog.summaryOnly ||
      (type === "questions" && id.startsWith("ai-")))
  )
    return null;
  if (!store.catalog.summaryOnly) return summary;
  if (
    store.details[type][id] &&
    detailVersions[type][id] === store.catalog.contentVersion
  )
    return store.details[type][id];
  const generation = sessionGeneration,
    userId = store.user?.id,
    contentVersion = store.catalog.contentVersion;
  const key = `${generation}:${contentVersion}:${type}:${id}`;
  if (!pendingDetails.has(key)) {
    const version = encodeURIComponent(contentVersion);
    const pending = request(
      `/catalog/${type}/${encodeURIComponent(id)}?v=${version}`,
    )
      .then((item) => {
        if (generation !== sessionGeneration || userId !== store.user?.id)
          return null;
        if (store.catalog?.contentVersion !== contentVersion) {
          const error = new Error("学习资料已更新，请重新加载后重试。");
          error.code = "CATALOG_VERSION_CHANGED";
          throw error;
        }
        if (item.id !== id) throw new Error("资料响应不匹配，请稍后重试");
        remember(type, item);
        return item;
      })
      .catch((error) => {
        if (error.status === 404) return null;
        throw error;
      })
      .finally(() => pendingDetails.delete(key));
    pendingDetails.set(key, pending);
  }
  return pendingDetails.get(key);
}
export async function loadQuestions(ids) {
  const protectedIds = new Set(ids);
  const needed = [...new Set(ids)].filter(
    (id) =>
      store.catalog?.summaryOnly &&
      (!store.details.questions[id] ||
        detailVersions.questions[id] !== store.catalog.contentVersion) &&
      !store.generatedQuestions.some((q) => q.id === id),
  );
  if (!needed.length) return;
  const generation = sessionGeneration,
    userId = store.user?.id,
    contentVersion = store.catalog.contentVersion;
  for (let i = 0; i < needed.length; i += 50) {
    const group = needed.slice(i, i + 50);
    const params = new URLSearchParams({
      ids: group.join(","),
      v: contentVersion,
    });
    const data = await request(`/catalog/questions?${params}`);
    if (generation !== sessionGeneration || userId !== store.user?.id) return;
    if (store.catalog?.contentVersion !== contentVersion) {
      const error = new Error("学习资料已更新，请重新加载后重试。");
      error.code = "CATALOG_VERSION_CHANGED";
      throw error;
    }
    if (
      !Array.isArray(data.questions) ||
      data.questions.length !== group.length ||
      data.questions.some((q, index) => q.id !== group[index])
    )
      throw new Error("试卷题目加载不完整，请重试");
    for (const question of data.questions)
      remember("questions", question, protectedIds);
  }
}
const currentDetail = (type, x) => {
  const item = store.details[type][x.id];
  return detailVersions[type][x.id] === store.catalog?.contentVersion
    ? item || x
    : x;
};
export const lessons = computed(() =>
  (store.catalog?.lessons || []).map((x) => currentDetail("lessons", x)),
);
export const questions = computed(() => [
  ...(store.catalog?.questions || []).map((x) => currentDetail("questions", x)),
  ...store.generatedQuestions,
]);
export const labs = computed(() =>
  (store.catalog?.labs || []).map((x) => currentDetail("labs", x)),
);
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
