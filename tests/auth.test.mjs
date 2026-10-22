import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createApp } from "../server/app.mjs";
import { mysqlFixture } from "./helpers/mysql.mjs";

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
