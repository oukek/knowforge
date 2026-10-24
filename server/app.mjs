import { PRODUCTION_FRONTEND_ORIGIN } from "../shared/deployment.mjs";
import { runnerFrame } from "./runner-frame.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createAuth } from "./auth.mjs";
import { installAi } from "./ai/routes.mjs";
import express from "express";
import { compareOutput } from "../shared/output.mjs";
import { selectedTracks } from "../shared/study-plan.mjs";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createConfiguredStore } from "./database.mjs";
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
        totalTests ===
          (() => {
            const lab = catalog.labs.find((l) => l.id === q.labId);
            return lab.judge?.caseCount ?? lab.tests.length;
          })(),
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
export async function createApp({
  dbPath,
  driver,
  mysql,
  store,
  allowedOrigins = [],
  serveClient = true,
  resourcePaths = {},
  publicApiOrigin,
  secureCookies,
  aiOptions,
} = {}) {
  const resources = {
    runner: resolve("client/public/runner.js"),
    pythonRunner: resolve("client/public/python-runner.js"),
    handbook: resolve("docs/完整学习手册.md"),
    pythonDemo: resolve("examples/python/workbench.py"),
    ...resourcePaths,
  };
  store ??= await createConfiguredStore({ driver, dbPath, mysql });
  const accounts = new AsyncLocalStorage();
  const personal = () => {
    const value = accounts.getStore();
    if (!value) throw new Error("Personal data requires authentication");
    return value;
  };
  let revision = Date.now() * 1000;
  const snapshot = async () => ({
    ...(await personal().state()),
    revision: ++revision,
  });
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  const trustedOrigins = new Set([
    PRODUCTION_FRONTEND_ORIGIN,
    ...allowedOrigins,
    ...(publicApiOrigin ? [publicApiOrigin] : []),
  ]);
  const corsHeaders = new Set([
    "content-type",
    "x-csrf-token",
    "x-knowforge-user",
  ]);
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    const origin = req.headers.origin;
    res.vary("Origin");
    if (origin) {
      try {
        const parsed = new URL(origin);
        const sameOrigin =
          parsed.origin === `${req.protocol}://${req.get("host")}`;
        if (
          origin !== parsed.origin ||
          (!sameOrigin && !trustedOrigins.has(parsed.origin))
        )
          return res.status(403).json({ error: "不允许该站点访问" });
      } catch {
        return res.status(403).json({ error: "无效来源" });
      }
      res.set({
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
    }
    if (req.method === "OPTIONS") {
      const method = req.headers["access-control-request-method"];
      const headers = String(
        req.headers["access-control-request-headers"] || "",
      )
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (
        !origin ||
        !["GET", "HEAD", "POST", "PUT"].includes(method) ||
        headers.some((h) => !corsHeaders.has(h))
      )
        return res.status(403).json({ error: "不允许该跨域请求" });
      return res
        .set({
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT",
          "Access-Control-Allow-Headers":
            "Content-Type, X-CSRF-Token, X-KnowForge-User",
          "Access-Control-Max-Age": "600",
        })
        .status(204)
        .end();
    }
    next();
  });
  app.use(["/api/ai", "/api/admin/ai"], express.json({ limit: "24kb" }));
  app.use(express.json({ limit: "12mb" }));
  app.get("/runner-frame", (req, res) => {
    const frame = runnerFrame([
      ...trustedOrigins,
      publicApiOrigin || `${req.protocol}://${req.get("host")}`,
    ]);
    res
      .set({
        "Content-Security-Policy": frame.csp,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      })
      .type("html")
      .send(frame.html);
  });
  const ok = async (res, extra = {}) =>
    res.json({ state: await snapshot(), ...extra });
  const auth = createAuth(app, store, { secureCookies });
  const ai = await installAi(app, store, auth, catalog, aiOptions);
  const resolveQuestion = (id, userId) => ai.question(userId, id, store);
  const validTarget = async (id, userId) =>
    targets.has(id) || !!(await resolveQuestion(id, userId));
  app.get("/api/health", (req, res, next) =>
    store
      .session(async () => {
        await store.get("SELECT 1 AS connected");
        res.json({
          ok: true,
          edition: catalog.edition,
          database: store.driver,
        });
      })
      .catch(next),
  );
  const api = {};
  for (const method of ["get", "put", "post"])
    api[method] = (path, handler) =>
      app[method](path, (req, res, next) =>
        store
          .session(async () => {
            if (
              [
                "/api/export/catalog",
                "/api/export/handbook",
                "/api/export/python-demo",
              ].includes(path)
            )
              return handler(req, res, next);
            const session = await auth.authenticate(req);
            if (!session) return res.status(401).json({ error: "请先登录" });
            if (
              req.headers["x-knowforge-user"] &&
              req.headers["x-knowforge-user"] !== session.user.id
            )
              return res.status(409).json({
                error: "账号已在其他页面切换，请重新登录",
                code: "SESSION_CHANGED",
              });
            if (
              !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
              !auth.csrf(req, res, session)
            )
              return;
            req.user = session.user;
            return accounts.run(store.forUser(session.user.id), () =>
              handler(req, res, next),
            );
          })
          .catch(next),
      );
  api.get("/api/bootstrap", async (_, res) =>
    res.json({
      catalog,
      database: store.driver,
      user: _.user,
      state: await snapshot(),
      generatedQuestions: await ai.repo.generatedListRaw(_.user.id),
      serverTime: new Date().toISOString(),
    }),
  );
  api.get("/api/export/python-demo", async (_, res) => {
    res
      .type("text/x-python")
      .attachment("knowforge-python-workbench.py")
      .send(readFileSync(resources.pythonDemo, "utf8"));
  });
  api.post("/api/lesson-exercises/:id/attempt", async (req, res) => {
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
    await personal().run(
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
    await personal().touch(now);
    await ok(res, { feedback });
  });
  api.put("/api/progress/:id", async (req, res) => {
    if (!lessonIds.has(req.params.id))
      return res.status(404).json({ error: "知识点不存在" });
    const { status } = z
      .object({ status: z.enum(["new", "learning", "done"]) })
      .parse(req.body);
    const now = new Date().toISOString();
    await personal().upsert("progress", {
      id: req.params.id,
      status: status,
      updatedAt: now,
    });
    if (status === "done") await personal().touch(now);
    await ok(res);
  });
  api.put("/api/notes/:id", async (req, res) => {
    if (!(await validTarget(req.params.id, req.user.id)))
      return res.status(404).json({ error: "目标不存在" });
    const { content } = noteSchema.parse(req.body);
    await personal().upsert("notes", {
      id: req.params.id,
      content: content,
      updatedAt: new Date().toISOString(),
    });
    await ok(res);
  });
  api.put("/api/bookmarks/:id", async (req, res) => {
    if (!(await validTarget(req.params.id, req.user.id)))
      return res.status(404).json({ error: "目标不存在" });
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    if (active)
      await personal().upsert(
        "bookmarks",
        { id: req.params.id, createdAt: new Date().toISOString() },
        { ignore: true },
      );
    else
      await personal().run("DELETE FROM bookmarks WHERE id=?", req.params.id);
    await ok(res);
  });
  api.post("/api/attempts/:id", async (req, res) => {
    const q = await resolveQuestion(req.params.id, req.user.id);
    if (!q) return res.status(404).json({ error: "题目不存在" });
    const input = attemptSchema.parse(req.body);
    const result = gradeQuestion(q, input);
    const now = new Date().toISOString();
    await personal().exec("BEGIN");
    try {
      await personal().run(
        "INSERT INTO attempts(questionId,kind,answer,score,passed,createdAt) VALUES(?,?,?,?,?,?)",
        q.id,
        result.kind,
        JSON.stringify(result.answer),
        result.score,
        result.passed ? 1 : 0,
        now,
      );
      await personal().schedule(q.id, result.rating, !result.passed, now);
      await personal().touch(now);
      await personal().exec("COMMIT");
    } catch (e) {
      await personal().exec("ROLLBACK");
      throw e;
    }
    await ok(res, { result });
  });
  api.post("/api/reviews/:id", async (req, res) => {
    if (!(await resolveQuestion(req.params.id, req.user.id)))
      return res.status(404).json({ error: "题目不存在" });
    const { rating: value } = z.object({ rating }).parse(req.body);
    const now = new Date().toISOString();
    await personal().schedule(req.params.id, value, value < 2, now);
    await personal().touch(now);
    await ok(res);
  });
  api.put("/api/settings", async (req, res) => {
    const data = z
      .object({
        dailyMinutes: z.number().int().min(10).max(480),
        trackId: z.enum(["all", ...catalog.tracks.map((t) => t.id)]).optional(),
        trackIds: z
          .array(z.enum(catalog.tracks.map((t) => t.id)))
          .min(1)
          .max(catalog.tracks.length)
          .refine((ids) => new Set(ids).size === ids.length)
          .optional(),
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
    if (!data.trackIds && data.trackId)
      data.trackIds = selectedTracks(data, catalog.tracks);
    for (const [key, value] of Object.entries(data))
      await personal().upsert("settings", {
        key: key,
        value: JSON.stringify(value),
      });
    await personal().upsert("settings", {
      key: "planOnboarding",
      value: JSON.stringify("configured"),
    });
    await ok(res);
  });
  api.put("/api/settings/onboarding", async (req, res) => {
    z.object({ status: z.literal("dismissed") })
      .strict()
      .parse(req.body);
    await personal().upsert("settings", {
      key: "planOnboarding",
      value: JSON.stringify("dismissed"),
    });
    await ok(res);
  });
  api.post("/api/exams", async (req, res) => {
    const input = z
      .object({
        mode: z.enum(["objective", "interview"]),
        questionPool: z
          .enum(["transfer", "foundation", "all"])
          .default("transfer"),
        moduleIds: z.array(z.string()).max(catalog.modules.length).default([]),
        count: z.number().int().min(3).max(50),
        minutes: z.number().int().min(1).max(120),
      })
      .parse(req.body);
    let pool = catalog.questions.filter(
      (q) =>
        q.type !== "coding" &&
        (input.questionPool === "all" || q.pool === input.questionPool) &&
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
      questionPool: input.questionPool,
      questionIds: selected.map((q) => q.id),
      minutes: input.minutes,
      startedAt: new Date().toISOString(),
      status: "active",
      answers: {},
    };
    await personal().run(
      "INSERT INTO exams VALUES(?,?)",
      exam.id,
      JSON.stringify(exam),
    );
    await ok(res, { exam });
  });
  api.put("/api/exams/:id/draft", async (req, res) => {
    const raw = await personal().get(
      "SELECT payload FROM exams WHERE id=?",
      req.params.id,
    );
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
    await personal().run(
      "UPDATE exams SET payload=? WHERE id=?",
      JSON.stringify(exam),
      exam.id,
    );
    await ok(res, { exam });
  });
  api.post("/api/exams/:id/submit", async (req, res) => {
    const raw = await personal().get(
      "SELECT payload FROM exams WHERE id=?",
      req.params.id,
    );
    if (!raw) return res.status(404).json({ error: "试卷不存在" });
    const exam = JSON.parse(raw.payload);
    if (exam.status === "completed") return await ok(res, { exam });
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
    await personal().exec("BEGIN");
    try {
      await personal().run(
        "UPDATE exams SET payload=? WHERE id=?",
        JSON.stringify(exam),
        exam.id,
      );
      for (const r of results) {
        if (r.kind === "self" && r.selfRating === null) continue;
        await personal().run(
          "INSERT INTO attempts(questionId,kind,answer,score,passed,createdAt) VALUES(?,?,?,?,?,?)",
          r.questionId,
          r.kind,
          JSON.stringify(r.answer),
          r.score,
          r.passed ? 1 : 0,
          now,
        );
        await personal().schedule(
          r.questionId,
          r.kind === "self" ? r.selfRating : r.passed ? 2 : 0,
          !r.passed,
          now,
        );
      }
      await personal().touch(now);
      await personal().exec("COMMIT");
    } catch (e) {
      await personal().exec("ROLLBACK");
      throw e;
    }
    await ok(res, { exam });
  });
  api.get("/api/export/catalog", async (_, res) =>
    res.attachment("knowforge-catalog.json").json(catalog),
  );
  api.get("/api/export/handbook", async (_, res) =>
    res.download(resources.handbook, "knowforge-handbook.md"),
  );
  api.get("/api/export/backup", async (_, res) =>
    res.attachment("knowforge-study-backup.json").json({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      state: await personal().state(),
    }),
  );
  api.post("/api/import", async (req, res) => {
    const backup = backupSchema.parse(req.body);
    const s = backup.state;
    for (const id of Object.keys(s.progress))
      if (!lessonIds.has(id))
        return res.status(400).json({ error: "备份包含未知知识点进度" });
    for (const id of [...Object.keys(s.notes), ...s.bookmarks])
      if (!(await validTarget(id, req.user.id)))
        return res.status(400).json({ error: "备份包含未知内容 ID" });
    for (const r of [...s.reviews, ...s.attempts])
      if (!(await resolveQuestion(r.questionId, req.user.id)))
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
    await personal().exec("BEGIN");
    try {
      for (const [id, p] of Object.entries(s.progress))
        await personal().upsert("progress", {
          id: id,
          status: p.status,
          updatedAt: p.updatedAt,
        });
      for (const [id, n] of Object.entries(s.notes))
        await personal().upsert("notes", {
          id: id,
          content: n.content,
          updatedAt: n.updatedAt,
        });
      for (const id of s.bookmarks)
        await personal().upsert(
          "bookmarks",
          { id: id, createdAt: new Date().toISOString() },
          { ignore: true },
        );
      for (const r of s.reviews)
        await personal().upsert("reviews", {
          questionId: r.questionId,
          dueAt: r.dueAt,
          intervalDays: r.intervalDays,
          streak: r.streak,
          lastRating: r.lastRating,
          wrong: r.wrong ? 1 : 0,
          updatedAt: r.updatedAt,
        });
      for (const a of s.attempts) {
        const exists = await personal().get(
          "SELECT id FROM attempts WHERE questionId=? AND createdAt=? AND kind=?",
          a.questionId,
          a.createdAt,
          a.kind,
        );
        if (!exists)
          await personal().run(
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
        const matches = await personal().all(
          "SELECT answer FROM lesson_attempts WHERE exerciseId=? AND createdAt=?",
          attempt.exerciseId,
          attempt.createdAt,
        );
        const exists = matches.some((row) => row.answer === attempt.answer);
        if (!exists)
          await personal().run(
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
      const importedSettings = { ...s.settings };
      if (!importedSettings.trackIds && importedSettings.trackId)
        importedSettings.trackIds = selectedTracks(
          importedSettings,
          catalog.tracks,
        );
      for (const [key, value] of Object.entries(importedSettings))
        await personal().upsert("settings", {
          key: key,
          value: JSON.stringify(value),
        });
      for (const a of s.activity)
        await personal().upsert(
          "activity",
          { day: a.day, actions: a.actions },
          { max: ["actions"] },
        );
      for (const exam of s.exams) {
        if (exam.questionIds.every((id) => qMap.has(id)))
          await personal().upsert(
            "exams",
            { id: exam.id, payload: JSON.stringify(exam) },
            { ignore: true },
          );
      }
      await personal().exec("COMMIT");
      await ok(res, {
        message:
          "备份已合并，现有数据保留；同 ID 进度、笔记与复习状态采用导入值。",
      });
    } catch (e) {
      await personal().exec("ROLLBACK");
      throw e;
    }
  });
  const pythonRoot = resolve("node_modules/pyodide");
  const pythonVersion = JSON.parse(
    readFileSync(resolve(pythonRoot, "package.json"), "utf8"),
  ).version;
  app.get("/python-runtime/manifest.json", (_, res) =>
    res.set("Cache-Control", "no-store").json({
      version: pythonVersion,
      base: `/python-runtime/${pythonVersion}/`,
      files: [
        "pyodide.js",
        "pyodide.asm.mjs",
        "pyodide.asm.wasm",
        "python_stdlib.zip",
        "pyodide-lock.json",
      ],
    }),
  );
  app.use(
    `/python-runtime/${pythonVersion}`,
    express.static(pythonRoot, {
      maxAge: "365d",
      immutable: true,
      index: false,
    }),
  );
  app.use(
    "/python-runtime",
    express.static(pythonRoot, {
      maxAge: "1d",
      index: false,
    }),
  );
  // A missing runtime file must never fall through to the SPA HTML response.
  app.use("/python-runtime", (_, res) =>
    res
      .status(404)
      .json({ error: "Python 运行资源不存在，请检查后端部署版本" }),
  );
  app.get("/python-runner.js", async (req, res) => {
    const runtimeOrigin = new URL(
      "/python-runtime/",
      publicApiOrigin || `${req.protocol}://${req.get("host")}`,
    ).href;
    res
      .type("application/javascript")
      .set(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src ${runtimeOrigin}; worker-src 'none'`,
      )
      .send(readFileSync(resources.pythonRunner, "utf8"));
  });
  app.get("/runner.js", async (_, res) => {
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'",
    );
    res.type("text/javascript").send(readFileSync(resources.runner, "utf8"));
  });
  if (serveClient && existsSync(resolve("dist/index.html"))) {
    app.use(express.static(resolve("dist"), { maxAge: 0 }));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(resolve("dist/index.html"));
    });
  }
  app.use("/api", async (_, res) =>
    res.status(404).json({ error: "接口不存在" }),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: "输入格式不正确",
        details: err.issues.map((x) => `${x.path.join(".")}: ${x.message}`),
      });
    if (err.type === "entity.too.large")
      return res.status(413).json({
        error:
          req.path.startsWith("/api/ai") || req.path.startsWith("/api/admin/ai")
            ? "AI 请求体超过 24KB 限制"
            : "文件超过 12MB 限制",
      });
    if (err instanceof SyntaxError && "body" in err)
      return res.status(400).json({ error: "JSON 格式不正确" });
    console.error(err.message);
    res.status(500).json({ error: "保存失败，请检查服务端状态后重试" });
  });
  return { app, store, ai };
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
          kind: z.enum(["objective", "self", "coding", "ai"]),
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
      trackIds: z
        .array(z.enum(catalog.tracks.map((t) => t.id)))
        .min(1)
        .max(catalog.tracks.length)
        .refine((ids) => new Set(ids).size === ids.length)
        .optional(),
      planOnboarding: z.enum(["pending", "dismissed", "configured"]).optional(),
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
          questionPool: z.enum(["transfer", "foundation", "all"]).optional(),
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
