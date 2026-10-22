import test from "node:test";
import assert from "node:assert/strict";

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
