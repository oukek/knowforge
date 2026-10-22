import test from "node:test";
import assert from "node:assert/strict";
import { mysqlFixture } from "./helpers/mysql.mjs";
import { createMySQLStore } from "../server/mysql-store.mjs";
import { createConfiguredStore } from "../server/database.mjs";
import { createApp } from "../server/app.mjs";

const mysqlTest = (name, fn) =>
  test(name, { skip: process.env.TEST_MYSQL !== "1" }, fn);

mysqlTest("MySQL 事务异常回滚，下一请求可继续使用连接", async (t) => {
  const { store, cleanup } = await mysqlFixture();
  t.after(cleanup);
  await assert.rejects(
    store.session(async () => {
      await store.exec("BEGIN");
      await store.upsert("notes", {
        id: "rollback",
        content: "不应保存",
        updatedAt: "2026-10-22",
      });
      throw new Error("intentional rollback");
    }),
    /intentional rollback/,
  );
  assert.equal(
    await store.get("SELECT * FROM notes WHERE id=?", "rollback"),
    undefined,
  );
  await store.session(async () => {
    await store.exec("BEGIN");
    await store.upsert("notes", {
      id: "committed",
      content: "已提交",
      updatedAt: "2026-10-22",
    });
    await store.exec("COMMIT");
  });
  assert.equal((await store.state()).notes.committed.content, "已提交");
});

mysqlTest("MySQL Unicode、长文本、参数绑定与重新连接持久化", async (t) => {
  const { store, prefix, cleanup } = await mysqlFixture();
  t.after(cleanup);
  const content = "中文🧑‍💻'\\\"; DROP TABLE notes;--\n".repeat(4000);
  await store.upsert("notes", { id: "Case", content, updatedAt: "2026-10-22" });
  await store.upsert("notes", {
    id: "case",
    content: "独立 ID",
    updatedAt: "2026-10-22",
  });
  const reopened = await createMySQLStore({ prefix });
  try {
    const state = await reopened.state();
    assert.equal(state.notes.Case.content, content);
    assert.equal(state.notes.case.content, "独立 ID");
  } finally {
    await reopened.close();
  }
});

mysqlTest("MySQL 并发活动计数、备份取最大值与收藏幂等", async (t) => {
  const { store, cleanup } = await mysqlFixture();
  t.after(cleanup);
  await Promise.all(
    Array.from({ length: 20 }, () =>
      store.session(() => store.touch("2026-10-22T00:00:00Z")),
    ),
  );
  await store.upsert(
    "activity",
    { day: "2026-10-22", actions: 3 },
    { max: ["actions"] },
  );
  for (let i = 0; i < 2; i++)
    await store.upsert(
      "bookmarks",
      { id: "once", createdAt: "2026-10-22" },
      { ignore: true },
    );
  const state = await store.state();
  assert.equal(state.activity[0].actions, 20);
  assert.deepEqual(state.bookmarks, ["once"]);
});

test("数据库配置错误明确失败，不回退到 SQLite", async () => {
  await assert.rejects(
    createConfiguredStore({ driver: "unknown" }),
    /DB_DRIVER/,
  );
  await assert.rejects(
    createMySQLStore({ prefix: "bad;prefix" }),
    /MYSQL_TABLE_PREFIX/,
  );
  await assert.rejects(
    createMySQLStore({ user: "", database: "" }),
    /MYSQL_USER/,
  );
});

mysqlTest(
  "SQLite JSON 备份跨引擎迁移至 MySQL，重复导入不重复作答",
  async (t) => {
    const mysql = await mysqlFixture();
    t.after(mysql.cleanup);
    const source = await createApp({ dbPath: ":memory:" });
    const target = await createApp({ store: mysql.store });
    t.after(() => source.store.close());
    async function serve(app) {
      const server = await new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => resolve(server));
      });
      t.after(() => new Promise((resolve) => server.close(resolve)));
      const base = `http://127.0.0.1:${server.address().port}`;
      const registered = await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "migration",
          password: "migration-password",
        }),
      });
      assert.equal(registered.status, 201);
      const cookie = registered.headers.get("set-cookie").split(";")[0];
      const { csrfToken } = await registered.json();
      return async (path, method = "GET", body) => {
        const response = await fetch(
          `http://127.0.0.1:${server.address().port}/api${path}`,
          {
            method,
            headers: {
              Cookie: cookie,
              "X-CSRF-Token": csrfToken,
              ...(body ? { "Content-Type": "application/json" } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          },
        );
        const data = await response.json();
        assert.equal(response.status, 200, JSON.stringify(data));
        return data;
      };
    }
    const from = await serve(source.app),
      to = await serve(target.app);
    const { catalog } = await from("/bootstrap");
    const lesson = catalog.lessons.find((l) =>
      l.exercises.some((e) => e.type === "output"),
    );
    const exercise = lesson.exercises.find((e) => e.type === "output");
    const question = catalog.questions.find((q) => q.type === "choice");
    await from(`/notes/${lesson.id}`, "PUT", { content: "迁移中文笔记 🧪" });
    await from(`/progress/${lesson.id}`, "PUT", { status: "done" });
    await from(`/bookmarks/${lesson.id}`, "PUT", { active: true });
    await from(`/attempts/${question.id}`, "POST", {
      answer: question.correct,
    });
    await from(`/lesson-exercises/${exercise.id}/attempt`, "POST", {
      answer: exercise.expectedLogs.join("\n"),
    });
    await from("/settings", "PUT", {
      dailyMinutes: 45,
      planDays: 21,
      startDate: "2026-10-22",
      trackId: "ai-application",
    });
    await from("/exams", "POST", {
      mode: "objective",
      count: 3,
      minutes: 10,
      moduleIds: [],
    });
    const backup = await from("/export/backup");
    await to("/import", "POST", backup);
    await to("/import", "POST", backup);
    const migrated = await to("/export/backup");
    assert.deepEqual(migrated.state, backup.state);
    assert.equal((await to("/health")).database, "mysql");
  },
);
