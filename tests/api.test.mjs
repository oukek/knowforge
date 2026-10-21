import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, gradeQuestion } from "../server/app.mjs";
import { scheduleReview, createStore } from "../server/store.mjs";
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
async function fixture(t, options = {}) {
  const built = createApp({ dbPath: ":memory:", ...options });
  const server = await new Promise((r) => {
    const s = built.app.listen(0, "127.0.0.1", () => r(s));
  });
  t.after(
    () =>
      new Promise((r) =>
        server.close(() => {
          built.store.close();
          r();
        }),
      ),
  );
  const base = "http://127.0.0.1:" + server.address().port;
  return {
    base,
    ...built,
    async api(path, method = "GET", body, headers = {}) {
      const res = await fetch(base + "/api" + path, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, data: await res.json() };
    },
  };
}
test("知识库关联与标准答案有效", () => {
  const ids = new Set(catalog.lessons.map((x) => x.id));
  assert.equal(catalog.modules.length, 18);
  assert(catalog.lessons.length >= 100);
  for (const q of catalog.questions) {
    assert(ids.has(q.lessonId));
    if (q.type === "choice")
      assert.equal(gradeQuestion(q, { answer: q.correct }).score, 100);
  }
});
test("扩展专题支持筛题、学习主线与新旧备份", async (t) => {
  const { api } = await fixture(t);
  const settings = {
    dailyMinutes: 45,
    planDays: 21,
    startDate: "2026-10-21",
    trackId: "ai-application",
  };
  let result = await api("/settings", "PUT", settings);
  assert.equal(result.status, 200);
  assert.equal(result.data.state.settings.trackId, "ai-application");
  assert.equal(
    (await api("/settings", "PUT", { ...settings, trackId: "unknown" })).status,
    400,
  );
  const backup = (await api("/export/backup")).data;
  assert.equal((await api("/import", "POST", backup)).status, 200);
  delete backup.state.settings.trackId;
  assert.equal((await api("/import", "POST", backup)).status, 200);
  result = await api("/exams", "POST", {
    mode: "objective",
    moduleIds: catalog.modules.map((m) => m.id),
    count: 3,
    minutes: 10,
  });
  assert.equal(result.status, 200, "全部 18 专题可组卷");
  result = await api("/exams", "POST", {
    mode: "objective",
    moduleIds: ["restapi"],
    count: 5,
    minutes: 10,
  });
  assert.equal(result.status, 200);
  assert(
    result.data.exam.questionIds.every(
      (id) => catalog.questions.find((q) => q.id === id).moduleId === "restapi",
    ),
  );
});
test("Python Worker、离线运行资源及项目下载可用", async (t) => {
  const { base } = await fixture(t);
  const worker = await fetch(base + "/python-runner.js");
  assert.equal(worker.status, 200);
  const csp = worker.headers.get("content-security-policy");
  assert(csp.includes("/python-runtime/") && csp.includes("worker-src 'none'"));
  assert(!csp.includes("connect-src *"));
  for (const file of [
    "pyodide.js",
    "pyodide.asm.mjs",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
  ]) {
    const res = await fetch(base + "/python-runtime/" + file, {
      method: "HEAD",
    });
    assert.equal(res.status, 200, file);
    if (file.endsWith(".wasm"))
      assert(res.headers.get("content-type").includes("application/wasm"));
  }
  const demo = await fetch(base + "/api/export/python-demo");
  assert(
    demo.headers
      .get("content-disposition")
      .includes("knowforge-python-workbench.py"),
  );
  assert((await demo.text()).includes("def run_demo"));
});
test("随堂输出在服务端逐行判题，JSON 容错且记录与题库作答隔离", async (t) => {
  const { api } = await fixture(t);
  const lesson = catalog.lessons.find((l) =>
    l.playground.expectedLogs.some((line) => line.startsWith("{")),
  );
  const exercise = lesson.exercises.find((e) => e.type === "output");
  const path = "/lesson-exercises/" + exercise.id + "/attempt";
  const wrong = await api(path, "POST", {
    answer: "wrong",
    passedTests: 30,
    totalTests: 30,
  });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.data.feedback.passed, false);
  const answer = exercise.expectedLogs
    .map((line) => {
      try {
        const value = JSON.parse(line);
        return JSON.stringify(value, null, 0).replaceAll(":", ": ");
      } catch {
        return line;
      }
    })
    .join("\r\n");
  const right = await api(path, "POST", { answer });
  assert.equal(right.data.feedback.passed, true);
  assert(right.data.feedback.lines.every((row) => row.passed));
  assert.equal(right.data.state.exerciseAttempts.length, 2);
  assert.equal(right.data.state.exerciseAttempts[0].lessonId, lesson.id);
  assert.equal(right.data.state.attempts.length, 0);
  assert.equal((await api(path, "POST", { answer: " " })).status, 400);
  assert.equal(
    (await api("/lesson-exercises/unknown/attempt", "POST", { answer: "1" }))
      .status,
    404,
  );
});
test("随堂补全记录浏览器用例结果，拒绝不匹配数量，并支持新旧备份", async (t) => {
  const { api } = await fixture(t);
  const lesson = catalog.lessons.find((l) =>
    l.exercises.some((e) => e.type === "fill"),
  );
  const exercise = lesson.exercises.find((e) => e.type === "fill");
  const path = "/lesson-exercises/" + exercise.id + "/attempt";
  const body = {
    answer: exercise.solution,
    passedTests: exercise.tests.length,
    totalTests: exercise.tests.length,
  };
  assert.equal(
    (await api(path, "POST", { ...body, totalTests: body.totalTests + 1 }))
      .status,
    400,
  );
  assert.equal(
    (await api(path, "POST", { ...body, passedTests: body.totalTests + 1 }))
      .status,
    400,
  );
  const saved = await api(path, "POST", body);
  assert.equal(saved.data.feedback.passed, true);
  assert.equal(saved.data.state.exerciseAttempts.length, 1);
  const backup = (await api("/export/backup")).data;
  assert.equal(backup.state.exerciseAttempts[0].answer, exercise.solution);
  const imported = await api("/import", "POST", backup);
  assert.equal(imported.status, 200);
  assert.equal(imported.data.state.exerciseAttempts.length, 1);
  delete backup.state.exerciseAttempts;
  const legacy = await api("/import", "POST", backup);
  assert.equal(legacy.status, 200);
  assert.equal(legacy.data.state.exerciseAttempts.length, 1);
  backup.state.exerciseAttempts = [
    { ...saved.data.state.exerciseAttempts[0], lessonId: "missing" },
  ];
  assert.equal((await api("/import", "POST", backup)).status, 400);
});
test("间隔复习：忘记、困难和再次掌握", () => {
  const now = "2026-10-21T00:00:00.000Z";
  let a = scheduleReview(null, 0, now);
  assert.equal(Date.parse(a.dueAt) - Date.parse(now), 600000);
  assert.equal(a.streak, 0);
  a = scheduleReview(null, 2, now);
  assert.equal(a.intervalDays, 2);
  a = scheduleReview(a, 3, now);
  assert.equal(a.intervalDays, 5);
  assert.equal(a.streak, 2);
  assert.equal(scheduleReview(a, 1, now).streak, 0);
});
test("开放题只记录自评，不伪造客观分数", () => {
  const q = catalog.questions.find((x) => x.type === "oral");
  const r = gradeQuestion(q, { answer: "自己的回答", selfRating: 1 });
  assert.equal(r.kind, "self");
  assert.equal(r.score, null);
  assert.equal(r.passed, false);
});
test("进度、笔记与收藏写入返回真实持久状态", async (t) => {
  const { api } = await fixture(t),
    id = catalog.lessons[0].id;
  let r = await api("/progress/" + id, "PUT", { status: "done" });
  assert.equal(r.status, 200);
  assert.equal(r.data.state.progress[id].status, "done");
  r = await api("/notes/" + id, "PUT", { content: "这是学习笔记" });
  assert.equal(r.data.state.notes[id].content, "这是学习笔记");
  r = await api("/bookmarks/" + id, "PUT", { active: true });
  assert(r.data.state.bookmarks.includes(id));
  r = await api("/bookmarks/" + id, "PUT", { active: false });
  assert(!r.data.state.bookmarks.includes(id));
});
test("选择题由服务端判分，答错进入薄弱题，答对延长复习", async (t) => {
  const { api } = await fixture(t),
    q = catalog.questions.find((x) => x.type === "choice");
  let r = await api("/attempts/" + q.id, "POST", {
    answer: (q.correct + 1) % 4,
  });
  assert.equal(r.data.result.score, 0);
  assert.equal(r.data.state.reviews[0].wrong, 1);
  r = await api("/attempts/" + q.id, "POST", { answer: q.correct });
  assert.equal(r.data.result.score, 100);
  assert.equal(r.data.state.reviews[0].wrong, 0);
  assert.equal(r.data.state.attempts.length, 2);
  assert.equal(r.data.state.reviews[0].intervalDays, 2);
});
test("错误类型、未知 ID、跨来源写入被拒绝", async (t) => {
  const { api } = await fixture(t);
  assert.equal(
    (await api("/progress/missing", "PUT", { status: "done" })).status,
    404,
  );
  assert.equal(
    (
      await api("/progress/" + catalog.lessons[0].id, "PUT", {
        status: "anything",
      })
    ).status,
    400,
  );
  const q = catalog.questions.find((x) => x.type === "choice");
  assert.equal(
    (await api("/attempts/" + q.id, "POST", { answer: 9 })).status,
    400,
  );
  assert.equal(
    (
      await api(
        "/bookmarks/" + q.id,
        "PUT",
        { active: true },
        { Origin: "https://example.org" },
      )
    ).status,
    403,
  );
});
test("模拟组卷、草稿恢复、交卷判分和重复提交幂等", async (t) => {
  const { api } = await fixture(t);
  let r = await api("/exams", "POST", {
    mode: "objective",
    count: 5,
    minutes: 15,
    moduleIds: [],
  });
  assert.equal(r.status, 200);
  const exam = r.data.exam;
  assert.equal(exam.questionIds.length, 5);
  const answers = Object.fromEntries(
    exam.questionIds.map((id) => [
      id,
      catalog.questions.find((x) => x.id === id).correct,
    ]),
  );
  r = await api("/exams/" + exam.id + "/draft", "PUT", { answers });
  assert.deepEqual(r.data.exam.answers, answers);
  r = await api("/exams/" + exam.id + "/submit", "POST", {
    answers,
    selfRatings: {},
  });
  assert.equal(r.data.exam.objectiveScore, 100);
  assert.equal(r.data.state.attempts.length, 5);
  const again = await api("/exams/" + exam.id + "/submit", "POST", {
    answers: {},
    selfRatings: {},
  });
  assert.equal(again.data.exam.objectiveScore, 100);
  assert.equal(again.data.state.attempts.length, 5);
});
test("混合模拟开放题不混入自动分数，未自评不记为答错", async (t) => {
  const { api } = await fixture(t);
  const r = await api("/exams", "POST", {
    mode: "interview",
    count: 10,
    minutes: 15,
    moduleIds: ["architecture"],
  });
  assert.equal(r.data.exam.questionIds.length, 10);
  const x = await api("/exams/" + r.data.exam.id + "/submit", "POST", {
    answers: {},
    selfRatings: {},
  });
  assert.equal(x.data.exam.objectiveScore, null);
  assert.equal(x.data.state.attempts.length, 0);
});
test("备份导入合并、作答去重与非法备份拒绝", async (t) => {
  const { api } = await fixture(t),
    id = catalog.lessons[0].id,
    q = catalog.questions.find((x) => x.type === "choice");
  await api("/notes/" + id, "PUT", { content: "备份笔记" });
  await api("/attempts/" + q.id, "POST", { answer: q.correct });
  const backup = (await api("/export/backup")).data;
  let r = await api("/import", "POST", backup);
  assert.equal(r.status, 200);
  assert.equal(r.data.state.attempts.length, 1);
  assert.equal(r.data.state.notes[id].content, "备份笔记");
  backup.state.notes.bad = {
    content: "未知",
    updatedAt: new Date().toISOString(),
  };
  r = await api("/import", "POST", backup);
  assert.equal(r.status, 400);
  assert.equal(
    (await api("/import", "POST", { schemaVersion: 9, state: {} })).status,
    400,
  );
});
test("SQLite 关闭再打开后内容保留", () => {
  const dir = mkdtempSync(join(tmpdir(), "wxg-store-")),
    path = join(dir, "state.sqlite");
  try {
    let s = createStore(path);
    s.run(
      "INSERT INTO notes VALUES(?,?,?)",
      "lesson",
      "持久化",
      "2026-10-21T00:00:00.000Z",
    );
    s.close();
    s = createStore(path);
    assert.equal(s.state().notes.lesson.content, "持久化");
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Worker 响应禁止网络与新建子 Worker", async (t) => {
  const { base } = await fixture(t);
  const r = await fetch(base + "/runner.js");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /connect-src 'none'/);
  assert.match(r.headers.get("content-security-policy"), /worker-src 'none'/);
});

test("开发代理只放行显式前端来源", async (t) => {
  const { api } = await fixture(t, {
    allowedOrigins: ["http://127.0.0.1:5173"],
  });
  const id = catalog.lessons[0].id;
  assert.equal(
    (
      await api(
        "/progress/" + id,
        "PUT",
        { status: "learning" },
        { Origin: "http://127.0.0.1:5173" },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        "/progress/" + id,
        "PUT",
        { status: "done" },
        { Origin: "http://127.0.0.1:5174" },
      )
    ).status,
    403,
  );
});
