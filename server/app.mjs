import express from "express";
import { compareOutput } from "../shared/output.mjs";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createStore } from "./store.mjs";
import catalog from "../data/catalog.json" with { type: "json" };
const qMap = new Map(catalog.questions.map((q) => [q.id, q]));
const lessonExerciseMap = new Map(
  catalog.lessons.flatMap((lesson) =>
    (lesson.exercises ?? []).map((exercise) => [
      exercise.id,
      { ...exercise, lessonId: lesson.id },
    ]),
  ),
);
const lessonIds = new Set(catalog.lessons.map((x) => x.id));
const targets = new Set([
  ...lessonIds,
  ...qMap.keys(),
  ...catalog.labs.map((x) => x.id),
]);
const choiceAnswer = z.number().int().min(0).max(3);
const rating = z.number().int().min(0).max(3);
const noteSchema = z.object({ content: z.string().max(30000) });
const attemptSchema = z.object({
  answer: z.union([z.string().max(30000), choiceAnswer]).optional(),
  selfRating: rating.optional(),
  passedTests: z.number().int().min(0).max(100).optional(),
  totalTests: z.number().int().min(1).max(100).optional(),
});
export function gradeQuestion(q, input) {
  if (q.type === "choice") {
    const answer = choiceAnswer.parse(input.answer);
    const passed = answer === q.correct;
    return {
      kind: "objective",
      score: passed ? 100 : 0,
      passed,
      answer,
      rating: passed ? 2 : 0,
      correct: q.correct,
      explanation: q.explanation,
    };
  }
  if (q.type === "coding") {
    const passedTests = z.number().int().min(0).parse(input.passedTests),
      totalTests = z.number().int().min(1).parse(input.totalTests);
    z.object({ valid: z.literal(true) }).parse({
      valid:
        passedTests <= totalTests &&
        totalTests === catalog.labs.find((l) => l.id === q.labId).tests.length,
    });
    return {
      kind: "coding",
      score: Math.round((passedTests / totalTests) * 100),
      passed: passedTests === totalTests,
      answer: input.answer || "",
      rating: passedTests === totalTests ? 2 : 0,
      explanation: "由浏览器隔离 Worker 的实验用例判定；属于本地自学记录。",
    };
  }
  const selfRating = rating.parse(input.selfRating);
  return {
    kind: "self",
    score: null,
    passed: selfRating >= 2,
    answer: input.answer || "",
    rating: selfRating,
    explanation: "开放题按要点自评，没有自动语义评分。",
  };
}
export function createApp({
  dbPath,
  store = createStore(dbPath),
  allowedOrigins = [],
  serveClient = true,
} = {}) {
  let revision = Date.now() * 1000;
  const snapshot = () => ({ ...store.state(), revision: ++revision });
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "12mb" }));
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      try {
        if (
          new URL(req.headers.origin).host !== req.headers.host &&
          !allowedOrigins.includes(new URL(req.headers.origin).origin)
        )
          return res.status(403).json({ error: "仅允许当前本地应用写入" });
      } catch {
        return res.status(403).json({ error: "无效来源" });
      }
    }
    next();
  });
  const ok = (res, extra = {}) => res.json({ state: snapshot(), ...extra });
  app.get("/api/health", (_, res) =>
    res.json({ ok: true, edition: catalog.edition }),
  );
  app.get("/api/bootstrap", (_, res) =>
    res.json({
      catalog,
      state: snapshot(),
      serverTime: new Date().toISOString(),
    }),
  );
  app.get("/api/export/python-demo", (_, res) => {
    res
      .type("text/x-python")
      .attachment("knowforge-python-workbench.py")
      .send(readFileSync(resolve("examples/python/workbench.py"), "utf8"));
  });
  app.post("/api/lesson-exercises/:id/attempt", (req, res) => {
    const exercise = lessonExerciseMap.get(req.params.id);
    if (!exercise) return res.status(404).json({ error: "随堂练习不存在" });
    const input = z
      .object({
        answer: z.string().max(30000),
        passedTests: z.number().int().min(0).max(30).optional(),
        totalTests: z.number().int().min(1).max(30).optional(),
      })
      .parse(req.body);
    let feedback, passed, passedTests, totalTests;
    if (exercise.type === "output") {
      if (!input.answer.trim())
        return res.status(400).json({ error: "请先填写输出答案" });
      feedback = compareOutput(input.answer, exercise.expectedLogs);
      ({ passed, matched: passedTests, total: totalTests } = feedback);
    } else {
      const expectedCount = exercise.tests.length;
      if (
        input.totalTests !== expectedCount ||
        input.passedTests === undefined ||
        input.passedTests > expectedCount
      )
        return res
          .status(400)
          .json({ error: "用例数量与题目不一致，请重新运行验证" });
      passedTests = input.passedTests;
      totalTests = expectedCount;
      passed = passedTests === totalTests;
      feedback = { passed, passedTests, totalTests };
    }
    const now = new Date().toISOString();
    store.run(
      "INSERT INTO lesson_attempts(exerciseId,lessonId,type,answer,passed,passedTests,totalTests,createdAt) VALUES(?,?,?,?,?,?,?,?)",
      exercise.id,
      exercise.lessonId,
      exercise.type,
      input.answer,
      passed ? 1 : 0,
      passedTests,
      totalTests,
      now,
    );
    store.touch(now);
    ok(res, { feedback });
  });
  app.put("/api/progress/:id", (req, res) => {
    if (!lessonIds.has(req.params.id))
      return res.status(404).json({ error: "知识点不存在" });
    const { status } = z
      .object({ status: z.enum(["new", "learning", "done"]) })
      .parse(req.body);
    const now = new Date().toISOString();
    store.run(
      "INSERT INTO progress VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updatedAt=excluded.updatedAt",
      req.params.id,
      status,
      now,
    );
    if (status === "done") store.touch(now);
    ok(res);
  });
  app.put("/api/notes/:id", (req, res) => {
    if (!targets.has(req.params.id))
      return res.status(404).json({ error: "目标不存在" });
    const { content } = noteSchema.parse(req.body);
    store.run(
      "INSERT INTO notes VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updatedAt=excluded.updatedAt",
      req.params.id,
      content,
      new Date().toISOString(),
    );
    ok(res);
  });
  app.put("/api/bookmarks/:id", (req, res) => {
    if (!targets.has(req.params.id))
      return res.status(404).json({ error: "目标不存在" });
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    if (active)
      store.run(
        "INSERT OR IGNORE INTO bookmarks VALUES(?,?)",
        req.params.id,
        new Date().toISOString(),
      );
    else store.run("DELETE FROM bookmarks WHERE id=?", req.params.id);
    ok(res);
  });
  app.post("/api/attempts/:id", (req, res) => {
    const q = qMap.get(req.params.id);
    if (!q) return res.status(404).json({ error: "题目不存在" });
    const input = attemptSchema.parse(req.body);
    const result = gradeQuestion(q, input);
    const now = new Date().toISOString();
    store.db.exec("BEGIN");
    try {
      store.run(
        "INSERT INTO attempts(questionId,kind,answer,score,passed,createdAt) VALUES(?,?,?,?,?,?)",
        q.id,
        result.kind,
        JSON.stringify(result.answer),
        result.score,
        result.passed ? 1 : 0,
        now,
      );
      store.schedule(q.id, result.rating, !result.passed, now);
      store.touch(now);
      store.db.exec("COMMIT");
    } catch (e) {
      store.db.exec("ROLLBACK");
      throw e;
    }
    ok(res, { result });
  });
  app.post("/api/reviews/:id", (req, res) => {
    if (!qMap.has(req.params.id))
      return res.status(404).json({ error: "题目不存在" });
    const { rating: value } = z.object({ rating }).parse(req.body);
    const now = new Date().toISOString();
    store.schedule(req.params.id, value, value < 2, now);
    store.touch(now);
    ok(res);
  });
  app.put("/api/settings", (req, res) => {
    const data = z
      .object({
        dailyMinutes: z.number().int().min(10).max(480),
        trackId: z.enum(["all", ...catalog.tracks.map((t) => t.id)]).optional(),
        planDays: z.union([
          z.literal(7),
          z.literal(14),
          z.literal(21),
          z.literal(30),
        ]),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(req.body);
    if (!Number.isFinite(Date.parse(data.startDate)))
      return res.status(400).json({ error: "日期无效" });
    for (const [key, value] of Object.entries(data))
      store.run(
        "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        key,
        JSON.stringify(value),
      );
    ok(res);
  });
  app.post("/api/exams", (req, res) => {
    const input = z
      .object({
        mode: z.enum(["objective", "interview"]),
        moduleIds: z.array(z.string()).max(catalog.modules.length).default([]),
        count: z.number().int().min(3).max(50),
        minutes: z.number().int().min(1).max(120),
      })
      .parse(req.body);
    let pool = catalog.questions.filter(
      (q) =>
        q.type !== "coding" &&
        (input.mode !== "objective" || q.type === "choice") &&
        (!input.moduleIds.length || input.moduleIds.includes(q.moduleId)),
    );
    pool = shuffle(pool);
    const selected = pool.slice(0, input.count);
    if (selected.length < 3)
      return res.status(400).json({ error: "所选范围题量不足，请增加专题" });
    const exam = {
      id: randomUUID(),
      mode: input.mode,
      questionIds: selected.map((q) => q.id),
      minutes: input.minutes,
      startedAt: new Date().toISOString(),
      status: "active",
      answers: {},
    };
    store.run("INSERT INTO exams VALUES(?,?)", exam.id, JSON.stringify(exam));
    ok(res, { exam });
  });
  app.put("/api/exams/:id/draft", (req, res) => {
    const raw = store.db
      .prepare("SELECT payload FROM exams WHERE id=?")
      .get(req.params.id);
    if (!raw) return res.status(404).json({ error: "试卷不存在" });
    const exam = JSON.parse(raw.payload);
    if (exam.status !== "active")
      return res.status(409).json({ error: "试卷已提交" });
    const answers = z
      .record(z.string(), z.union([z.string().max(30000), choiceAnswer]))
      .parse(req.body.answers);
    exam.answers = Object.fromEntries(
      Object.entries(answers).filter(([id]) => exam.questionIds.includes(id)),
    );
    store.run(
      "UPDATE exams SET payload=? WHERE id=?",
      JSON.stringify(exam),
      exam.id,
    );
    ok(res, { exam });
  });
  app.post("/api/exams/:id/submit", (req, res) => {
    const raw = store.db
      .prepare("SELECT payload FROM exams WHERE id=?")
      .get(req.params.id);
    if (!raw) return res.status(404).json({ error: "试卷不存在" });
    const exam = JSON.parse(raw.payload);
    if (exam.status === "completed") return ok(res, { exam });
    const { answers, selfRatings } = z
      .object({
        answers: z
          .record(z.string(), z.union([z.string().max(30000), choiceAnswer]))
          .default({}),
        selfRatings: z.record(z.string(), rating).default({}),
      })
      .parse(req.body);
    const now = new Date().toISOString();
    const results = exam.questionIds.map((id) => {
      const q = qMap.get(id);
      if (q.type === "choice") {
        const value = answers[id];
        return {
          questionId: id,
          kind: "objective",
          score: value === q.correct ? 100 : 0,
          passed: value === q.correct,
          answer: value ?? null,
          correct: q.correct,
        };
      }
      return {
        questionId: id,
        kind: "self",
        score: null,
        passed: (selfRatings[id] ?? -1) >= 2,
        answer: answers[id] || "",
        selfRating: selfRatings[id] ?? null,
      };
    });
    const objectives = results.filter((x) => x.kind === "objective");
    Object.assign(exam, {
      status: "completed",
      endedAt: now,
      answers,
      results,
      objectiveScore: objectives.length
        ? Math.round(
            objectives.reduce((s, x) => s + x.score, 0) / objectives.length,
          )
        : null,
    });
    store.db.exec("BEGIN");
    try {
      store.run(
        "UPDATE exams SET payload=? WHERE id=?",
        JSON.stringify(exam),
        exam.id,
      );
      for (const r of results) {
        if (r.kind === "self" && r.selfRating === null) continue;
        store.run(
          "INSERT INTO attempts(questionId,kind,answer,score,passed,createdAt) VALUES(?,?,?,?,?,?)",
          r.questionId,
          r.kind,
          JSON.stringify(r.answer),
          r.score,
          r.passed ? 1 : 0,
          now,
        );
        store.schedule(
          r.questionId,
          r.kind === "self" ? r.selfRating : r.passed ? 2 : 0,
          !r.passed,
          now,
        );
      }
      store.touch(now);
      store.db.exec("COMMIT");
    } catch (e) {
      store.db.exec("ROLLBACK");
      throw e;
    }
    ok(res, { exam });
  });
  app.get("/api/export/catalog", (_, res) =>
    res.attachment("knowforge-catalog.json").json(catalog),
  );
  app.get("/api/export/handbook", (_, res) =>
    res.download(resolve("docs/完整学习手册.md"), "knowforge-handbook.md"),
  );
  app.get("/api/export/backup", (_, res) =>
    res.attachment("knowforge-study-backup.json").json({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      state: store.state(),
    }),
  );
  app.post("/api/import", (req, res) => {
    const backup = backupSchema.parse(req.body);
    const s = backup.state;
    for (const id of Object.keys(s.progress))
      if (!lessonIds.has(id))
        return res.status(400).json({ error: "备份包含未知知识点进度" });
    for (const id of [...Object.keys(s.notes), ...s.bookmarks])
      if (!targets.has(id))
        return res.status(400).json({ error: "备份包含未知内容 ID" });
    for (const r of [...s.reviews, ...s.attempts])
      if (!qMap.has(r.questionId))
        return res.status(400).json({ error: "备份包含未知题目" });
    for (const attempt of s.exerciseAttempts ?? []) {
      const exercise = lessonExerciseMap.get(attempt.exerciseId);
      if (
        !exercise ||
        exercise.lessonId !== attempt.lessonId ||
        exercise.type !== attempt.type
      )
        return res
          .status(400)
          .json({ error: "备份包含未知或不匹配的随堂练习" });
    }
    store.db.exec("BEGIN");
    try {
      for (const [id, p] of Object.entries(s.progress))
        store.run(
          "INSERT INTO progress VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updatedAt=excluded.updatedAt",
          id,
          p.status,
          p.updatedAt,
        );
      for (const [id, n] of Object.entries(s.notes))
        store.run(
          "INSERT INTO notes VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updatedAt=excluded.updatedAt",
          id,
          n.content,
          n.updatedAt,
        );
      for (const id of s.bookmarks)
        store.run(
          "INSERT OR IGNORE INTO bookmarks VALUES(?,?)",
          id,
          new Date().toISOString(),
        );
      for (const r of s.reviews)
        store.run(
          "INSERT INTO reviews VALUES(?,?,?,?,?,?,?) ON CONFLICT(questionId) DO UPDATE SET dueAt=excluded.dueAt,intervalDays=excluded.intervalDays,streak=excluded.streak,lastRating=excluded.lastRating,wrong=excluded.wrong,updatedAt=excluded.updatedAt",
          r.questionId,
          r.dueAt,
          r.intervalDays,
          r.streak,
          r.lastRating,
          r.wrong ? 1 : 0,
          r.updatedAt,
        );
      for (const a of s.attempts) {
        const exists = store.db
          .prepare(
            "SELECT id FROM attempts WHERE questionId=? AND createdAt=? AND kind=?",
          )
          .get(a.questionId, a.createdAt, a.kind);
        if (!exists)
          store.run(
            "INSERT INTO attempts(questionId,kind,answer,score,passed,createdAt) VALUES(?,?,?,?,?,?)",
            a.questionId,
            a.kind,
            JSON.stringify(a.answer),
            a.score,
            a.passed ? 1 : 0,
            a.createdAt,
          );
      }
      for (const attempt of s.exerciseAttempts ?? []) {
        const exists = store.db
          .prepare(
            "SELECT id FROM lesson_attempts WHERE exerciseId=? AND createdAt=? AND answer=?",
          )
          .get(attempt.exerciseId, attempt.createdAt, attempt.answer);
        if (!exists)
          store.run(
            "INSERT INTO lesson_attempts(exerciseId,lessonId,type,answer,passed,passedTests,totalTests,createdAt) VALUES(?,?,?,?,?,?,?,?)",
            attempt.exerciseId,
            attempt.lessonId,
            attempt.type,
            attempt.answer,
            attempt.passed ? 1 : 0,
            attempt.passedTests,
            attempt.totalTests,
            attempt.createdAt,
          );
      }
      for (const [key, value] of Object.entries(s.settings))
        store.run(
          "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          key,
          JSON.stringify(value),
        );
      for (const a of s.activity)
        store.run(
          "INSERT INTO activity VALUES(?,?) ON CONFLICT(day) DO UPDATE SET actions=MAX(actions,excluded.actions)",
          a.day,
          a.actions,
        );
      for (const exam of s.exams) {
        if (exam.questionIds.every((id) => qMap.has(id)))
          store.run(
            "INSERT OR IGNORE INTO exams VALUES(?,?)",
            exam.id,
            JSON.stringify(exam),
          );
      }
      store.db.exec("COMMIT");
      ok(res, {
        message:
          "备份已合并，现有数据保留；同 ID 进度、笔记与复习状态采用导入值。",
      });
    } catch (e) {
      store.db.exec("ROLLBACK");
      throw e;
    }
  });
  app.use(
    "/python-runtime",
    express.static(resolve("node_modules/pyodide"), {
      maxAge: "1d",
      index: false,
    }),
  );
  app.get("/python-runner.js", (req, res) => {
    const resources = new URL(
      "/python-runtime/",
      `${req.protocol}://${req.get("host")}`,
    ).href;
    res
      .type("application/javascript")
      .set(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src ${resources}; worker-src 'none'`,
      )
      .send(readFileSync(resolve("client/public/python-runner.js"), "utf8"));
  });
  app.get("/runner.js", (_, res) => {
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'",
    );
    res
      .type("text/javascript")
      .send(readFileSync(resolve("client/public/runner.js"), "utf8"));
  });
  if (serveClient && existsSync(resolve("dist/index.html"))) {
    app.use(express.static(resolve("dist"), { maxAge: 0 }));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(resolve("dist/index.html"));
    });
  }
  app.use("/api", (_, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: "输入格式不正确",
        details: err.issues.map((x) => `${x.path.join(".")}: ${x.message}`),
      });
    if (err.type === "entity.too.large")
      return res.status(413).json({ error: "文件超过 12MB 限制" });
    if (err instanceof SyntaxError && "body" in err)
      return res.status(400).json({ error: "JSON 格式不正确" });
    console.error(err.message);
    res.status(500).json({ error: "保存失败，请检查服务端状态后重试" });
  });
  return { app, store };
}
const stamp = z.string().datetime();
const backupSchema = z.object({
  schemaVersion: z.literal(1),
  state: z.object({
    progress: z.record(
      z.string(),
      z.object({
        status: z.enum(["new", "learning", "done"]),
        updatedAt: stamp,
      }),
    ),
    notes: z.record(
      z.string(),
      z.object({ content: z.string().max(30000), updatedAt: stamp }),
    ),
    bookmarks: z.array(z.string()).max(5000),
    reviews: z
      .array(
        z.object({
          questionId: z.string(),
          dueAt: stamp,
          intervalDays: z.number().min(0).max(36500),
          streak: z.number().int().min(0),
          lastRating: rating,
          wrong: z.union([z.boolean(), z.number().int().min(0).max(1)]),
          updatedAt: stamp,
        }),
      )
      .max(5000),
    attempts: z
      .array(
        z.object({
          questionId: z.string(),
          kind: z.enum(["objective", "self", "coding"]),
          answer: z.union([z.string().max(30000), z.number(), z.null()]),
          score: z.number().min(0).max(100).nullable(),
          passed: z.boolean(),
          createdAt: stamp,
        }),
      )
      .max(10000),
    exerciseAttempts: z
      .array(
        z
          .object({
            exerciseId: z.string(),
            lessonId: z.string(),
            type: z.enum(["output", "fill"]),
            answer: z.string().max(30000),
            passed: z.boolean(),
            passedTests: z.number().int().min(0).max(1000),
            totalTests: z.number().int().min(1).max(1000),
            createdAt: stamp,
          })
          .refine((value) => value.passedTests <= value.totalTests),
      )
      .max(10000)
      .optional(),
    settings: z.object({
      dailyMinutes: z.number().int().min(10).max(480).optional(),
      trackId: z.enum(["all", ...catalog.tracks.map((t) => t.id)]).optional(),
      planDays: z
        .union([z.literal(7), z.literal(14), z.literal(21), z.literal(30)])
        .optional(),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
    activity: z
      .array(
        z.object({
          day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          actions: z.number().int().min(0),
        }),
      )
      .max(10000),
    exams: z
      .array(
        z.object({
          id: z.string().uuid(),
          mode: z.enum(["objective", "interview"]),
          questionIds: z.array(z.string()).max(50),
          minutes: z.number().int().min(1).max(120),
          startedAt: stamp,
          status: z.enum(["active", "completed"]),
          answers: z.record(
            z.string(),
            z.union([z.string().max(30000), choiceAnswer, z.null()]),
          ),
          endedAt: stamp.optional(),
          results: z
            .array(
              z.object({
                questionId: z.string(),
                kind: z.enum(["objective", "self"]),
                score: z.number().min(0).max(100).nullable(),
                passed: z.boolean(),
                answer: z.union([
                  z.string().max(30000),
                  choiceAnswer,
                  z.null(),
                ]),
                correct: choiceAnswer.optional(),
                selfRating: rating.nullable().optional(),
              }),
            )
            .max(50)
            .optional(),
          objectiveScore: z.number().min(0).max(100).nullable().optional(),
        }),
      )
      .max(500),
  }),
});
function shuffle(values) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
