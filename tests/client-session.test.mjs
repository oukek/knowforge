import test from "node:test";
import assert from "node:assert/strict";
import { afterLoginPath, loginLocation } from "../client/src/auth-routing.js";
import { isReactive } from "vue";

test("登录页保留内部目标路径，拒绝外部地址和登录循环", () => {
  const target = "/learn/js-event-loop?tab=practice#notes";
  assert.deepEqual(loginLocation(target), {
    name: "login",
    query: { redirect: target },
    replace: true,
  });
  assert.deepEqual(loginLocation("/"), { name: "login", replace: true });
  assert.equal(afterLoginPath(target), target);
  for (const invalid of [
    undefined,
    ["/learn"],
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/login?redirect=/login",
    "/LOGIN/",
    "/\n/evil.invalid",
  ])
    assert.equal(afterLoginPath(invalid), "/");
});

test("并发路由初始化只检查一次登录状态，匿名状态正常完成", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, ensureInitialized } = await load();
  let count = 0;
  globalThis.fetch = async (path) => {
    count++;
    assert.equal(path, "/api/auth/me");
    return response({ user: null, csrfToken: "" });
  };
  await Promise.all([ensureInitialized(), ensureInitialized()]);
  await ensureInitialized();
  assert.equal(count, 1);
  assert.equal(store.initialized, true);
  assert.equal(store.loading, false);
  assert.equal(store.user, null);
});

const load = () => import(`../client/src/store.js?test=${Math.random()}`);
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("浏览器草稿按账号隔离，不读取旧共享草稿", async (t) => {
  const previous = globalThis.localStorage;
  t.after(() => {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  });
  const storage = new Map([["wxg-snippet-test", "旧共享代码"]]);
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  const { store, safeStorageGet, safeStorageSet } = await load();
  assert.equal(safeStorageGet("wxg-snippet-test"), null);
  store.user = { id: "account-a" };
  assert.equal(safeStorageGet("wxg-snippet-test"), null);
  safeStorageSet("wxg-snippet-test", "A 的代码");
  store.user = { id: "account-b" };
  assert.equal(safeStorageGet("wxg-snippet-test"), null);
  safeStorageSet("wxg-snippet-test", "B 的代码");
  store.user = { id: "account-a" };
  assert.equal(safeStorageGet("wxg-snippet-test"), "A 的代码");
});

test("切换账号后，旧请求响应不能覆盖新账号状态或清空新登录", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, mutate, request } = await load();
  store.user = { id: "a" };
  store.csrfToken = "csrf-a";
  store.state = { revision: 1 };
  let finish;
  globalThis.fetch = async (_, options) => {
    assert.equal(options.headers["X-KnowForge-User"], "a");
    if (options.method !== "GET")
      assert.equal(options.headers["X-CSRF-Token"], "csrf-a");
    return new Promise((resolve) => (finish = resolve));
  };
  const pending = mutate("/notes/test", "PUT", { content: "A" });
  store.user = { id: "b" };
  store.csrfToken = "csrf-b";
  store.state = { revision: 2, owner: "b" };
  finish(response({ state: { revision: 999, owner: "a" } }));
  assert.equal(await pending, null);
  assert.equal(store.state.owner, "b");
  store.user = { id: "a" };
  const expired = request("/bootstrap");
  store.user = { id: "b" };
  finish(response({ error: "请先登录" }, 401));
  await assert.rejects(expired, /请先登录/);
  assert.equal(store.user.id, "b");
});

test("较早的初始化完成时不覆盖较新的账号初始化", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, init } = await load();
  let me = 0,
    bootstrap = 0,
    finishOld,
    bootStarted;
  const started = new Promise((resolve) => (bootStarted = resolve));
  globalThis.fetch = async (path) => {
    if (path === "/api/auth/me") {
      const id = ++me === 1 ? "a" : "b";
      return response({ user: { id }, csrfToken: `csrf-${id}` });
    }
    if (++bootstrap === 1) {
      bootStarted();
      return new Promise((resolve) => (finishOld = resolve));
    }
    return response({
      catalog: { lessons: [] },
      state: { owner: "b" },
      database: "mysql",
    });
  };
  const old = init();
  await started;
  await init();
  finishOld(response({ catalog: {}, state: { owner: "a" } }));
  await old;
  assert.equal(store.user.id, "b");
  assert.equal(store.state.owner, "b");
  assert.equal(store.loading, false);
});

test("初始化并行加载共享资料和个人状态，资料不会深度响应式包装", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, init } = await load();
  let bootstrapStarted, catalogStarted, finishBootstrap, finishCatalog;
  const bothStarted = Promise.all([
    new Promise((resolve) => (bootstrapStarted = resolve)),
    new Promise((resolve) => (catalogStarted = resolve)),
  ]);
  globalThis.fetch = async (path, options) => {
    if (path === "/api/auth/me")
      return response({ user: { id: "a" }, csrfToken: "csrf-a" });
    assert.equal(options.headers["X-KnowForge-User"], "a");
    if (path === "/api/bootstrap?catalog=none") {
      bootstrapStarted();
      return new Promise((resolve) => (finishBootstrap = resolve));
    }
    assert.equal(path, "/api/catalog/index");
    catalogStarted();
    return new Promise((resolve) => (finishCatalog = resolve));
  };
  const pending = init();
  await bothStarted;
  finishCatalog(
    response({ lessons: [{ id: "lesson", sections: [{ title: "内容" }] }] }),
  );
  finishBootstrap(
    response({
      state: { owner: "a" },
      generatedQuestions: [{ id: "generated" }],
      database: "mysql",
    }),
  );
  await pending;
  assert.equal(store.state.owner, "a");
  assert.equal(store.catalog.lessons[0].id, "lesson");
  assert.equal(isReactive(store.catalog.lessons[0]), false);
  assert.equal(store.generatedQuestions[0].id, "generated");
  assert.equal(store.loading, false);
});

test("新客户端兼容旧后端的完整 bootstrap，登录成功不重复请求身份接口", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, signIn } = await load();
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    if (path === "/api/auth/login")
      return response({ user: { id: "a" }, csrfToken: "csrf-a" });
    if (path === "/api/catalog/index")
      return response({ error: "not found" }, 404);
    assert.equal(path, "/api/bootstrap?catalog=none");
    return response({
      catalog: { lessons: [{ id: "legacy" }] },
      state: { owner: "a" },
    });
  };
  await signIn("login", { username: "a", password: "password" });
  assert.equal(store.catalog.lessons[0].id, "legacy");
  assert.equal(store.state.owner, "a");
  assert(!paths.includes("/api/auth/me"));
});

test("个人信息与改密响应仅更新当前会话，过期个人中心接口清空登录，错误密码保留登录", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, updateProfile, changePassword, refreshProfile } = await load();
  store.user = { id: "a", displayName: "旧名" };
  store.csrfToken = "csrf-a";
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/auth/profile");
    assert.equal(options.headers["X-CSRF-Token"], "csrf-a");
    return response({
      user: { id: "a", displayName: "新名" },
      csrfToken: "csrf-a",
    });
  };
  await updateProfile("新名");
  assert.equal(store.user.displayName, "新名");
  globalThis.fetch = async () =>
    response({ user: { id: "a", displayName: "新名" }, csrfToken: "rotated" });
  await changePassword("old-password", "new-password");
  assert.equal(store.csrfToken, "rotated");
  let finish;
  globalThis.fetch = async () => new Promise((resolve) => (finish = resolve));
  const old = updateProfile("A的新名");
  store.user = { id: "b", displayName: "B" };
  store.csrfToken = "csrf-b";
  finish(
    response({
      user: { id: "a", displayName: "A的新名" },
      csrfToken: "csrf-a",
    }),
  );
  assert.equal(await old, null);
  assert.equal(store.user.id, "b");
  assert.equal(store.csrfToken, "csrf-b");
  globalThis.fetch = async () => response({ error: "当前密码不正确" }, 400);
  await assert.rejects(
    changePassword("wrong-password", "new-password"),
    /当前密码不正确/,
  );
  assert.equal(store.user.id, "b");
  globalThis.fetch = async () => response({ error: "请先登录" }, 401);
  await assert.rejects(refreshProfile(), /请先登录/);
  assert.equal(store.user, null);
});

test("课程详情按需请求、并发去重，退出后的旧响应不会写入下一会话", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, init, loadDetail, signOut } = await load();
  let detailCalls = 0,
    finishDetail;
  globalThis.fetch = async (path) => {
    if (path === "/api/auth/me")
      return response({ user: { id: "a" }, csrfToken: "csrf" });
    if (path === "/api/bootstrap?catalog=none")
      return response({ state: { revision: 1 } });
    if (path === "/api/catalog/index")
      return response({
        summaryOnly: true,
        contentVersion: "v1",
        lessons: [{ id: "one", title: "摘要" }],
        questions: [],
        labs: [],
      });
    if (path === "/api/auth/logout") return response({ ok: true });
    assert.equal(path, "/api/catalog/lessons/one?v=v1");
    detailCalls++;
    return new Promise((resolve) => {
      finishDetail = resolve;
    });
  };
  await init();
  const one = loadDetail("lessons", "one"),
    two = loadDetail("lessons", "one");
  assert.equal(detailCalls, 1);
  await signOut();
  finishDetail(response({ id: "one", sections: [{ content: "正文" }] }));
  assert.equal(await one, null);
  assert.equal(await two, null);
  assert.equal(store.catalog, null);
  assert.deepEqual(store.details.lessons, {});
});

test("试卷批量获取所需题目，并在缓存淘汰时保留当前试卷题目", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, init, loadQuestions } = await load();
  const summaries = Array.from({ length: 201 }, (_, i) => ({ id: "q" + i }));
  let batchCalls = 0;
  globalThis.fetch = async (path) => {
    if (path === "/api/auth/me")
      return response({ user: { id: "a" }, csrfToken: "csrf" });
    if (path === "/api/bootstrap?catalog=none")
      return response({ state: { revision: 1 } });
    if (path === "/api/catalog/index")
      return response({
        summaryOnly: true,
        contentVersion: "v1",
        lessons: [],
        questions: summaries,
        labs: [],
      });
    const url = new URL(path, "http://localhost");
    assert.equal(url.pathname, "/api/catalog/questions");
    batchCalls++;
    return response({
      questions: url.searchParams
        .get("ids")
        .split(",")
        .map((id) => ({ id, answer: "完整答案" })),
    });
  };
  await init();
  await loadQuestions(summaries.slice(0, 200).map((q) => q.id));
  assert.equal(batchCalls, 4);
  await loadQuestions(["q0", "q200"]);
  assert.equal(batchCalls, 5);
  assert(store.details.questions.q0);
  assert(store.details.questions.q200);
  assert.equal(Object.keys(store.details.questions).length, 200);
  await loadQuestions(["q0", "q200"]);
  assert.equal(batchCalls, 5);
});

test("索引接口不存在时兼容上一版只提供完整课程接口的后端", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, init, loadDetail } = await load();
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    if (path === "/api/auth/me")
      return response({ user: { id: "a" }, csrfToken: "csrf" });
    if (path === "/api/bootstrap?catalog=none")
      return response({ state: { revision: 1 } });
    if (path === "/api/catalog/index")
      return response({ error: "missing" }, 404);
    if (path === "/api/catalog")
      return response({
        lessons: [{ id: "legacy", sections: [{ title: "正文" }] }],
        questions: [],
        labs: [],
      });
    throw new Error("unexpected request: " + path);
  };
  await init();
  assert.equal(store.error, "");
  assert.equal(
    (await loadDetail("lessons", "legacy")).sections[0].title,
    "正文",
  );
  assert(paths.includes("/api/catalog"));
});

test("资料升级后迟到的旧正文不能覆盖新索引", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, init, loadDetail, refreshCatalogIndex } = await load();
  let finish,
    indexCalls = 0;
  globalThis.fetch = async (path) => {
    if (path === "/api/auth/me")
      return response({ user: { id: "a" }, csrfToken: "csrf" });
    if (path === "/api/bootstrap?catalog=none")
      return response({ state: { revision: 1 } });
    if (path === "/api/catalog/index")
      return response({
        summaryOnly: true,
        contentVersion: ++indexCalls === 1 ? "v1" : "v2",
        lessons: [{ id: "one" }],
        questions: [],
        labs: [],
      });
    assert.equal(path, "/api/catalog/lessons/one?v=v1");
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  await init();
  const old = loadDetail("lessons", "one");
  await refreshCatalogIndex();
  finish(response({ id: "one", sections: [{ content: "旧版本" }] }));
  await assert.rejects(
    old,
    (error) => error.code === "CATALOG_VERSION_CHANGED",
  );
  assert.equal(store.catalog.contentVersion, "v2");
  assert.equal(store.details.lessons.one, undefined);
});

test("资料更新时保留当前页面内容，按新版本重新加载详情", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => (globalThis.fetch = previous));
  const { store, init, loadDetail, refreshCatalogIndex, questions } =
    await load();
  let indexCalls = 0,
    detailCalls = 0;
  globalThis.fetch = async (path) => {
    if (path === "/api/auth/me")
      return response({ user: { id: "a" }, csrfToken: "csrf" });
    if (path === "/api/bootstrap?catalog=none")
      return response({ state: { revision: 1 } });
    if (path === "/api/catalog/index")
      return response({
        summaryOnly: true,
        contentVersion: ++indexCalls === 1 ? "v1" : "v2",
        lessons: [],
        questions: [{ id: "q1", prompt: "索引" }],
        labs: [],
      });
    assert.match(path, /\/api\/catalog\/questions\/q1\?v=v[12]/);
    return response({
      id: "q1",
      prompt: "完整题目",
      answer: `答案${++detailCalls}`,
    });
  };
  await init();
  await loadDetail("questions", "q1");
  assert.equal(questions.value[0].answer, "答案1");
  await refreshCatalogIndex();
  assert.equal(
    store.details.questions.q1.answer,
    "答案1",
    "已打开页面仍能保留旧内容",
  );
  assert.equal(questions.value[0].answer, undefined, "列表不混入旧版本详情");
  await loadDetail("questions", "q1");
  assert.equal(questions.value[0].answer, "答案2");
  assert.equal(detailCalls, 2);
});
