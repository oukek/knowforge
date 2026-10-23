import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createApp } from "../server/app.mjs";
import { mysqlFixture } from "./helpers/mysql.mjs";
import { PRODUCTION_FRONTEND_ORIGIN } from "../shared/deployment.mjs";
import { ensureProfile, randomPublicId } from "../server/account-profile.mjs";
import {
  parseAdminCommand,
  changeAdminRole,
} from "../server/admin-command.mjs";

test("正式前端域名可跨域登录与保存，CORS 预检无需登录且拒绝其他来源", async (t) => {
  const { client, base } = await fixture(t);
  const origin = PRODUCTION_FRONTEND_ORIGIN;
  const preflight = await fetch(base + "/api/notes/js-event-loop", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers":
        "content-type,x-csrf-token,x-knowforge-user",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(
    preflight.headers.get("access-control-allow-credentials"),
    "true",
  );
  assert.match(preflight.headers.get("vary"), /Origin/);
  for (const headers of [
    { Origin: "https://evil.invalid", "Access-Control-Request-Method": "PUT" },
    { Origin: origin, "Access-Control-Request-Method": "DELETE" },
    {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "authorization",
    },
  ]) {
    const res = await fetch(base + "/api/notes/js-event-loop", {
      method: "OPTIONS",
      headers,
    });
    assert.equal(res.status, 403);
  }
  const a = client();
  const headers = { Origin: origin, "X-Forwarded-Proto": "https" };
  const registered = await a.api(
    "/auth/register",
    "POST",
    { username: "cross_origin", password: "cross-origin-password" },
    headers,
  );
  assert.equal(registered.status, 201);
  assert.match(registered.headers.get("set-cookie"), /Secure/);
  assert(!registered.headers.get("set-cookie").includes("Domain="));
  assert.equal(registered.headers.get("access-control-allow-origin"), origin);
  assert.equal(
    (await a.api("/auth/me", "GET", undefined, headers)).data.user.username,
    "cross_origin",
  );
  const { catalog } = (await a.api("/bootstrap", "GET", undefined, headers))
    .data;
  const saved = await a.api(
    `/notes/${catalog.lessons[0].id}`,
    "PUT",
    { content: "跨域 Cookie 与 CSRF" },
    headers,
  );
  assert.equal(saved.status, 200);
  assert.equal(
    saved.data.state.notes[catalog.lessons[0].id].content,
    "跨域 Cookie 与 CSRF",
  );
  const denied = await a.api("/auth/me", "GET", undefined, {
    Origin: "https://knowforge.ookew.com.evil.invalid",
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("跨域运行器页面仅允许正式前端嵌入，Worker 保留独立 CSP", async (t) => {
  const { base } = await fixture(t);
  const frame = await fetch(base + "/runner-frame");
  assert.equal(frame.status, 200);
  const csp = frame.headers.get("content-security-policy");
  assert(csp.includes("frame-ancestors 'self' " + PRODUCTION_FRONTEND_ORIGIN));
  assert(csp.includes("worker-src 'self'"));
  const html = await frame.text();
  const nonce = html.match(/nonce="([^"]+)"/)[1];
  assert(csp.includes(`'nonce-${nonce}'`));
  assert(html.includes("knowforge:run"));
  const worker = await fetch(base + "/runner.js");
  assert(
    worker.headers
      .get("content-security-policy")
      .includes("connect-src 'none'"),
  );
});

async function fixture(t) {
  const mysql = process.env.TEST_MYSQL === "1" ? await mysqlFixture() : null;
  const { app, store } = await createApp(
    mysql ? { store: mysql.store } : { dbPath: ":memory:" },
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (mysql) await mysql.cleanup();
    else await store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    const state = { cookie: "", csrfToken: "", user: null };
    return {
      state,
      async api(path, method = "GET", body, headers = {}) {
        const response = await fetch(base + "/api" + path, {
          method,
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(state.cookie ? { Cookie: state.cookie } : {}),
            ...(state.csrfToken ? { "X-CSRF-Token": state.csrfToken } : {}),
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json();
        const cookie = response.headers.get("set-cookie");
        if (cookie) state.cookie = cookie.split(";")[0];
        if (data.user) {
          state.user = data.user;
          if (data.csrfToken) state.csrfToken = data.csrfToken;
        }
        return { status: response.status, data, headers: response.headers };
      },
      register(username) {
        return this.api("/auth/register", "POST", {
          username,
          password: "account-password-123",
        });
      },
    };
  }
  return { client, store, base };
}

test("公开注册、大小写归一、密码验证和匿名访问限制", async (t) => {
  const { client, store } = await fixture(t),
    a = client();
  for (const [path, method, body] of [
    ["/bootstrap", "GET"],
    ["/export/backup", "GET"],
    ["/notes/js-event-loop", "PUT", { content: "unauthorized" }],
  ])
    assert.equal((await a.api(path, method, body)).status, 401);
  assert.equal((await a.api("/auth/me")).data.user, null);
  assert.equal(
    (
      await a.api("/auth/register", "POST", {
        username: "bad name",
        password: "abcdefgh",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a.api("/auth/register", "POST", {
        username: "valid",
        password: "short",
      })
    ).status,
    400,
  );
  const registered = await a.register("Alice");
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.username, "alice");
  assert.match(registered.headers.get("set-cookie"), /HttpOnly/);
  assert.match(registered.headers.get("set-cookie"), /SameSite=Lax/);
  assert.equal(registered.headers.get("cache-control"), "no-store");
  assert.equal((await client().register("ALICE")).status, 409);
  const user = await store.get(
    "SELECT * FROM auth_users WHERE username=?",
    "alice",
  );
  assert.match(user.passwordHash, /^scrypt\$/);
  assert(!user.passwordHash.includes("account-password-123"));
  const session = await store.get(
    "SELECT * FROM auth_sessions WHERE userId=?",
    user.id,
  );
  assert.notEqual(session.id, a.state.cookie.split("=")[1]);
  assert.equal(
    session.id,
    createHash("sha256").update(a.state.cookie.split("=")[1]).digest("hex"),
  );
  for (const username of ["alice", "unknown"])
    assert.equal(
      (
        await client().api("/auth/login", "POST", {
          username,
          password: "wrong-password",
        })
      ).status,
      401,
    );
  const login = client();
  assert.equal(
    (
      await login.api("/auth/login", "POST", {
        username: "ALICE",
        password: "account-password-123",
      })
    ).status,
    200,
  );
  assert.equal((await login.api("/auth/me")).data.user.id, user.id);
});

test("所有个人记录、同 ID 内容、试卷和备份按账号隔离", async (t) => {
  const { client, store } = await fixture(t),
    a = client(),
    b = client();
  // Legacy shared data must never be claimed by the first public registrant.
  await store.upsert("notes", {
    id: "js-event-loop",
    content: "旧共享笔记",
    updatedAt: new Date().toISOString(),
  });
  await a.register("learner_a");
  await b.register("learner_b");
  const { catalog, state: empty } = (await a.api("/bootstrap")).data;
  assert.deepEqual(empty.notes, {});
  const lesson = catalog.lessons.find((l) =>
    l.exercises.some((e) => e.type === "output"),
  );
  const exercise = lesson.exercises.find((e) => e.type === "output");
  const question = catalog.questions.find((q) => q.type === "choice");
  const put = async (path, body) => {
    const result = await a.api(path, "PUT", body);
    assert.equal(result.status, 200);
    return result;
  };
  await put(`/notes/${lesson.id}`, { content: "A 的笔记" });
  await put(`/progress/${lesson.id}`, { status: "done" });
  await put(`/bookmarks/${lesson.id}`, { active: true });
  await put("/settings", {
    dailyMinutes: 45,
    planDays: 21,
    startDate: "2026-10-22",
    trackId: "ai-application",
  });
  assert.equal(
    (
      await a.api(`/attempts/${question.id}`, "POST", {
        answer: question.correct,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await a.api(`/lesson-exercises/${exercise.id}/attempt`, "POST", {
        answer: exercise.expectedLogs.join("\n"),
      })
    ).status,
    200,
  );
  const exam = (
    await a.api("/exams", "POST", {
      mode: "objective",
      count: 3,
      minutes: 10,
      moduleIds: [],
    })
  ).data.exam;
  const stateB = (await b.api("/bootstrap")).data.state;
  for (const key of ["progress", "notes", "settings"])
    assert.deepEqual(stateB[key], {});
  for (const key of [
    "bookmarks",
    "attempts",
    "exerciseAttempts",
    "reviews",
    "exams",
    "activity",
  ])
    assert.deepEqual(stateB[key], []);
  assert.equal(
    (await b.api(`/exams/${exam.id}/draft`, "PUT", { answers: {} })).status,
    404,
  );
  assert.equal(
    (
      await b.api(`/exams/${exam.id}/submit`, "POST", {
        answers: {},
        selfRatings: {},
      })
    ).status,
    404,
  );
  const forged = await b.api(`/notes/${lesson.id}`, "PUT", {
    content: "B 的笔记",
    userId: a.state.user.id,
  });
  assert.equal(forged.status, 200);
  assert.equal(
    (await a.api("/bootstrap")).data.state.notes[lesson.id].content,
    "A 的笔记",
  );
  assert.equal(
    (await b.api("/export/backup")).data.state.notes[lesson.id].content,
    "B 的笔记",
  );
  const backup = (await a.api("/export/backup")).data;
  assert(!JSON.stringify(backup).includes("passwordHash"));
  assert.equal((await b.api("/import", "POST", backup)).status, 200);
  assert.equal((await b.api("/import", "POST", backup)).status, 200);
  assert.equal((await b.api("/bootstrap")).data.state.attempts.length, 1);
  await b.api(`/bookmarks/${lesson.id}`, "PUT", { active: false });
  await b.api(`/notes/${lesson.id}`, "PUT", { content: "导入后 B 独立修改" });
  const finalA = (await a.api("/export/backup")).data.state;
  assert.equal(finalA.notes[lesson.id].content, "A 的笔记");
  assert(finalA.bookmarks.includes(lesson.id));
  assert.deepEqual(finalA, backup.state);
});

test("CSRF、跨站写入、会话切换、退出和过期控制", async (t) => {
  const { client, store } = await fixture(t),
    a = client();
  const registered = await a.register("sessionuser");
  const savedCookie = a.state.cookie;
  const { catalog } = (await a.api("/bootstrap")).data;
  const path = `/notes/${catalog.lessons[0].id}`;
  for (const token of ["", "bad", "é".repeat(64)])
    assert.equal(
      (await a.api(path, "PUT", { content: "bad" }, { "X-CSRF-Token": token }))
        .status,
      403,
    );
  assert.equal(
    (
      await a.api(
        path,
        "PUT",
        { content: "bad" },
        { Origin: "https://attacker.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await a.api(
        path,
        "PUT",
        { content: "bad" },
        { "X-KnowForge-User": "another-user" },
      )
    ).status,
    409,
  );
  assert.equal(
    (await a.api("/auth/logout", "POST", {}, { "X-CSRF-Token": "" })).status,
    403,
  );
  assert.equal((await a.api("/auth/logout", "POST", {})).status, 200);
  assert.equal(
    (await a.api("/bootstrap", "GET", undefined, { Cookie: savedCookie }))
      .status,
    401,
  );
  const login = await a.api(
    "/auth/login",
    "POST",
    { username: "sessionuser", password: "account-password-123" },
    { "X-Forwarded-Proto": "https" },
  );
  assert.match(login.headers.get("set-cookie"), /Secure/);
  assert.notEqual(a.state.cookie, savedCookie);
  await store.run(
    "UPDATE auth_sessions SET expiresAt=? WHERE userId=?",
    "2000-01-01T00:00:00.000Z",
    registered.data.user.id,
  );
  assert.equal((await a.api("/bootstrap")).status, 401);
});

test("公开注册不需要验证码，基础限流阻止持续刷请求", async (t) => {
  const { client } = await fixture(t),
    c = client();
  for (let i = 0; i < 10; i++)
    assert.equal((await c.api("/auth/register", "POST", {})).status, 400);
  const limited = await c.register("eleventh");
  assert.equal(limited.status, 429);
  assert(limited.headers.get("retry-after"));
});

test("个人中心固定随机八位 ID，名称与登录账号分离，修改不影响学习记录", async (t) => {
  const { client } = await fixture(t),
    a = client(),
    b = client();
  const registered = await a.register("profile_user");
  await b.register("profile_other");
  const user = registered.data.user;
  assert.match(user.id, /^[a-f\d]{8}-[a-f\d-]{27}$/);
  assert.match(user.publicId, /^[1-9]\d{7}$/);
  assert.notEqual(user.publicId, b.state.user.publicId);
  assert.equal(user.displayName, user.username);
  assert(user.createdAt);
  assert.equal((await client().api("/auth/profile")).status, 401);
  const saved = await a.api("/notes/js-event-loop", "PUT", {
    content: "个人中心修改前的学习记录",
  });
  assert.equal(saved.status, 200);
  const profile = await a.api("/auth/profile", "PUT", {
    displayName: "  学习者小明  ",
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.user.displayName, "学习者小明");
  assert.equal(profile.data.user.id, user.id);
  assert.equal(profile.data.user.publicId, user.publicId);
  assert.equal(profile.data.user.username, "profile_user");
  assert.equal((await a.api("/auth/me")).data.user.displayName, "学习者小明");
  assert.equal(
    (await b.api("/auth/profile")).data.user.displayName,
    "profile_other",
  );
  assert.equal(
    (await a.api("/bootstrap")).data.state.notes["js-event-loop"].content,
    "个人中心修改前的学习记录",
  );
  const login = client();
  assert.equal(
    (
      await login.api("/auth/login", "POST", {
        username: "profile_user",
        password: "account-password-123",
      })
    ).status,
    200,
  );
  assert.equal(login.state.user.publicId, user.publicId);
  assert.equal(login.state.user.displayName, "学习者小明");
});

test("个人资料更新限制字段和 CSRF，不允许借名称修改用户 ID、账号、权限或其他用户", async (t) => {
  const { client } = await fixture(t),
    a = client();
  await a.register("profile_guard");
  assert.equal(
    (
      await a.api(
        "/auth/profile",
        "PUT",
        { displayName: "合法名字" },
        { "X-CSRF-Token": "" },
      )
    ).status,
    403,
  );
  for (const body of [
    { displayName: "" },
    { displayName: " \n " },
    { displayName: "长".repeat(41) },
    { displayName: "控制\u0000字符" },
    { displayName: "新名", username: "other" },
    { displayName: "新名", publicId: "12345678" },
    { displayName: "新名", userId: a.state.user.id },
    { displayName: "新名", role: "admin" },
  ])
    assert.equal(
      (await a.api("/auth/profile", "PUT", body)).status,
      400,
      JSON.stringify(body),
    );
  assert.equal((await a.api("/auth/me")).data.user.role, "user");
  const htmlName = '<img src=x onerror="alert(1)">';
  assert.equal(
    (await a.api("/auth/profile", "PUT", { displayName: htmlName })).status,
    200,
  );
  assert.equal((await a.api("/auth/profile")).data.user.displayName, htmlName);
});

test("旧账号懒补 ID，数据库唯一约束碰撞重试，重复认证保留同一 ID", async (t) => {
  const { client, store } = await fixture(t),
    a = client(),
    b = client();
  await a.register("legacy_a");
  await b.register("legacy_b");
  const id = a.state.user.id;
  await store.session(async () => {
    await store.run(
      "DELETE FROM auth_profiles WHERE userId=?",
      a.state.user.id,
    );
    await store.run(
      "DELETE FROM auth_profiles WHERE userId=?",
      b.state.user.id,
    );
    const first = await ensureProfile(store, a.state.user, () => "12345678");
    let count = 0;
    const second = await ensureProfile(store, b.state.user, () =>
      ++count === 1 ? "12345678" : "87654321",
    );
    assert.equal(first.publicId, "12345678");
    assert.equal(second.publicId, "87654321");
    assert.equal(count, 2);
    assert.equal(
      (
        await ensureProfile(store, a.state.user, () => {
          throw Error("should not regenerate");
        })
      ).publicId,
      "12345678",
    );
  });
  assert.equal((await a.api("/auth/profile")).data.user.id, id);
  assert.equal((await a.api("/auth/me")).data.user.publicId, "12345678");
  await store.run("DELETE FROM auth_profiles WHERE userId=?", id);
  const backfilled = (await a.api("/auth/me")).data.user;
  assert.match(backfilled.publicId, /^[1-9]\d{7}$/);
  assert.equal(backfilled.displayName, "legacy_a");
  for (let i = 0; i < 100; i++) assert.match(randomPublicId(), /^[1-9]\d{7}$/);
});

test("修改密码验证旧密码并轮换 Cookie/CSRF，其他设备失效且学习记录与其他账号保留", async (t) => {
  const { client, store } = await fixture(t),
    a = client(),
    device = client(),
    other = client();
  await a.register("password_user");
  await other.register("password_other");
  await device.api("/auth/login", "POST", {
    username: "password_user",
    password: "account-password-123",
  });
  await a.api("/notes/js-event-loop", "PUT", { content: "修改密码仍保留" });
  const oldCookie = a.state.cookie,
    oldCsrf = a.state.csrfToken,
    id = a.state.user.id,
    publicId = a.state.user.publicId;
  const oldHash = (
    await store.get("SELECT passwordHash FROM auth_users WHERE id=?", id)
  ).passwordHash;
  const changed = await a.api(
    "/auth/password",
    "POST",
    {
      currentPassword: "account-password-123",
      newPassword: "new-password-456",
    },
    { "X-Forwarded-Proto": "https" },
  );
  assert.equal(changed.status, 200);
  assert.notEqual(a.state.cookie, oldCookie);
  assert.notEqual(a.state.csrfToken, oldCsrf);
  assert.match(changed.headers.get("set-cookie"), /HttpOnly/);
  assert.match(changed.headers.get("set-cookie"), /Secure/);
  assert.equal(a.state.user.id, id);
  assert.equal(a.state.user.publicId, publicId);
  assert.equal((await a.api("/auth/profile")).status, 200);
  assert.equal((await device.api("/auth/profile")).status, 401);
  assert.equal(
    (await a.api("/auth/profile", "GET", undefined, { Cookie: oldCookie }))
      .status,
    401,
  );
  assert.equal(
    (
      await a.api(
        "/notes/js-event-loop",
        "PUT",
        { content: "不应更新" },
        { "X-CSRF-Token": oldCsrf },
      )
    ).status,
    403,
  );
  assert.equal(
    (await a.api("/bootstrap")).data.state.notes["js-event-loop"].content,
    "修改密码仍保留",
  );
  assert.equal((await other.api("/auth/profile")).status, 200);
  const login = client();
  assert.equal(
    (
      await login.api("/auth/login", "POST", {
        username: "password_user",
        password: "account-password-123",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await login.api("/auth/login", "POST", {
        username: "password_user",
        password: "new-password-456",
      })
    ).status,
    200,
  );
  const hash = (
    await store.get("SELECT passwordHash FROM auth_users WHERE id=?", id)
  ).passwordHash;
  assert.notEqual(hash, oldHash);
  assert(!hash.includes("new-password-456"));
  assert(!JSON.stringify(changed.data).includes("passwordHash"));
  assert(!JSON.stringify((await a.api("/export/backup")).data).includes(hash));
});

test("修改密码拒绝错误旧密码、超长及额外字段，限流后不更改凭据", async (t) => {
  const { client } = await fixture(t),
    a = client();
  await a.register("password_guard");
  const valid = {
    currentPassword: "account-password-123",
    newPassword: "new-password-456",
  };
  assert.equal(
    (await a.api("/auth/password", "POST", valid, { "X-CSRF-Token": "" }))
      .status,
    403,
  );
  for (const patch of [
    { currentPassword: "wrong-password" },
    { newPassword: "short" },
    { newPassword: "x".repeat(129) },
    { currentPassword: "x".repeat(129) },
    { userId: "someone-else" },
    { role: "admin" },
    { newPassword: "account-password-123" },
  ])
    assert.equal(
      (await a.api("/auth/password", "POST", { ...valid, ...patch })).status,
      400,
    );
  assert.equal((await a.api("/auth/profile")).status, 200);
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await a.api("/auth/password", "POST", {
          ...valid,
          currentPassword: "wrong",
        })
      ).status,
      400,
    );
  const limited = await a.api("/auth/password", "POST", valid);
  assert.equal(limited.status, 429);
  assert(limited.headers.get("retry-after"));
  assert.equal(
    (
      await client().api("/auth/login", "POST", {
        username: "password_guard",
        password: "account-password-123",
      })
    ).status,
    200,
  );
});

test("管理员命令支持公开 ID、UUID 和明确登录账号，数字账号歧义不会错误授权", async (t) => {
  const { client, store } = await fixture(t),
    a = client(),
    numeric = client();
  await a.register("id_target");
  await numeric.register("23456789");
  await store.session(async () => {
    for (const user of [a.state.user, numeric.state.user])
      await store.run("DELETE FROM auth_profiles WHERE userId=?", user.id);
    await ensureProfile(store, a.state.user, () => "23456789");
    await ensureProfile(store, numeric.state.user, () => "87654321");
  });
  const promoted = await changeAdminRole(
    store,
    parseAdminCommand(["promote", "--id", "23456789"]),
  );
  assert.equal(promoted.id, a.state.user.id);
  assert.equal((await a.api("/auth/me")).data.user.role, "admin");
  assert.equal((await numeric.api("/auth/me")).data.user.role, "user");
  await changeAdminRole(store, parseAdminCommand(["demote", a.state.user.id]));
  assert.equal((await a.api("/auth/me")).data.user.role, "user");
  await changeAdminRole(
    store,
    parseAdminCommand(["promote", "--username", "23456789"]),
  );
  assert.equal((await numeric.api("/auth/me")).data.user.role, "admin");
  assert.equal(parseAdminCommand(["promote", "23456789"]).type, "id");
  assert.equal(parseAdminCommand(["promote", "ID_TARGET"]).value, "id_target");
  for (const args of [
    ["promote"],
    ["promote", "--id", "123"],
    ["anything", "12345678"],
    ["promote", "--id", "12345678", "extra"],
  ])
    assert.throws(() => parseAdminCommand(args), /用法/);
  await assert.rejects(
    changeAdminRole(store, parseAdminCommand(["promote", "--id", "99999999"])),
    /数据库与网站一致/,
  );
  const audit = await store.all(
    "SELECT * FROM admin_audit WHERE action=?",
    "role.change",
  );
  assert.equal(audit.length, 3);
  assert(JSON.parse(audit[0].data).publicId);
});

test("管理用户列表可通过公开 ID 和显示名称查找账号，不依赖内部 UUID", async (t) => {
  const { client, store } = await fixture(t),
    a = client(),
    admin = client();
  await a.register("search_target");
  await admin.register("search_admin");
  await a.api("/auth/profile", "PUT", { displayName: "学习者专用名称" });
  await changeAdminRole(
    store,
    parseAdminCommand(["promote", "--username", "search_admin"]),
  );
  for (const query of [a.state.user.publicId, "专用名称", "SEARCH_TARGET"]) {
    const result = await admin.api(
      "/admin/ai/users?query=" + encodeURIComponent(query),
    );
    assert.equal(result.status, 200);
    assert.equal(result.data.users.length, 1);
    assert.equal(result.data.users[0].id, a.state.user.id);
    assert.equal(result.data.users[0].publicId, a.state.user.publicId);
    assert.equal(result.data.users[0].displayName, "学习者专用名称");
  }
  assert.equal(
    (await a.api("/admin/ai/users?query=" + a.state.user.publicId)).status,
    403,
  );
});
