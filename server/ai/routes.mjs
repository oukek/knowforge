import { z } from "zod";
import { AiService } from "./service.mjs";
import { AiError, answerSchema, requestKey } from "./policy.mjs";
import { grantSchema, userPolicySchema } from "./billing.mjs";
import { micro, points } from "./amounts.mjs";
import { PricingSimulation } from "./pricing-simulation.mjs";
const id = z.string().min(1).max(191);
const historyQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    feature: z
      .enum(["grade", "variants", "interview", "test", "models"])
      .optional(),
    status: z
      .enum(["running", "succeeded", "failed", "released", "pending"])
      .optional(),
    questionId: id.optional(),
    lessonId: id.optional(),
    userId: z.string().uuid().optional(),
  })
  .strict();

export async function installAi(app, store, auth, catalog, options) {
  const ai = new AiService(store, catalog, options);
  await ai.init();
  const pricingSimulation = new PricingSimulation(ai.repo, ai.pool);
  function route(method, path, handler, admin = false) {
    app[method](path, async (req, res, next) => {
      try {
        const session = await store.session(async () => {
          const value = await auth.authenticate(req);
          if (!value) {
            res.status(401).json({ error: "请先登录" });
            return null;
          }
          if (
            req.headers["x-knowforge-user"] &&
            req.headers["x-knowforge-user"] !== value.user.id
          ) {
            res
              .status(409)
              .json({ error: "账号已在其他页面切换", code: "SESSION_CHANGED" });
            return null;
          }
          if (admin && value.user.role !== "admin") {
            res.status(403).json({ error: "需要管理员权限" });
            return null;
          }
          if (method !== "get" && !auth.csrf(req, res, value)) return null;
          return value;
        });
        if (!session) return;
        req.user = session.user;
        const result = await handler(req, res);
        if (!res.headersSent && !res.writableEnded) res.json(result);
      } catch (e) {
        if (e instanceof AiError)
          res.status(e.status).json({ error: e.message, code: e.code });
        else next(e);
      }
    });
  }
  route("get", "/api/ai/status", (r) => ai.status(r.user.id));
  route("post", "/api/ai/grade", (r, res) => {
    const input = z
      .object({ questionId: id, answer: answerSchema, requestId: requestKey })
      .strict()
      .parse(r.body);
    res.status(202);
    return ai.start(r.user, "grade", input, r.ip);
  });
  route("post", "/api/ai/variants", (r, res) => {
    const input = z
      .object({
        lessonId: id,
        questionId: id.optional(),
        count: z.number().int().min(1).max(3),
        difficulty: z.enum(["入门", "进阶", "挑战"]),
        direction: z.enum(["改变约束", "故障排查", "反例分析", "方案比较"]),
        requestId: requestKey,
      })
      .strict()
      .parse(r.body);
    res.status(202);
    return ai.start(r.user, "variants", input, r.ip);
  });
  route("get", "/api/ai/runs", (r) => {
    const input = historyQuery.parse(r.query);
    if (input.userId) throw new AiError(400, "只能查看自己的调用记录");
    return ai.history(r.user.id, input);
  });
  route("get", "/api/ai/runs/:id", (r) =>
    ai.getRun(r.user.id, z.string().uuid().parse(r.params.id)),
  );
  route("get", "/api/ai/runs/:id/events", (req, res) => {
    if (req.method === "HEAD") return res.status(405).end();
    const runId = z.string().uuid().parse(req.params.id);
    return ai.events.stream({
      req,
      res,
      id: runId,
      userId: req.user.id,
      load: () => ai.getRun(req.user.id, runId),
      authenticate: () =>
        store.session(
          async () => (await auth.authenticate(req))?.user.id === req.user.id,
        ),
    });
  });
  route("post", "/api/ai/runs/:id/cancel", (r) => {
    z.object({}).strict().parse(r.body);
    return ai.cancel(r.user.id, z.string().uuid().parse(r.params.id));
  });
  route("get", "/api/ai/questions/:id", (r) =>
    ai.repo.read(async (db) => {
      const question = await ai.repo.generatedRaw(
        r.user.id,
        id.parse(r.params.id),
        db,
      );
      if (!question) throw new AiError(404, "生成题不存在");
      return { question };
    }),
  );
  route("get", "/api/ai/credits", (r) =>
    ai.billing.details(
      r.user.id,
      z.coerce.number().int().min(1).max(10000).default(1).parse(r.query.page),
    ),
  );
  route("get", "/api/ai/products", async () => ({
    rows: await ai.billing.products(false),
  }));
  route("get", "/api/ai/ledger", (r) => {
    const input = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        legacy: z.enum(["1"]).optional(),
      })
      .strict()
      .parse(r.query);
    if (!input.legacy) return ai.billing.details(r.user.id, input.page);
    return ai.repo.read(async (db) => ({
      rows: await db.all(
        "SELECT * FROM ai_ledger WHERE userId=? ORDER BY createdAt DESC,id DESC LIMIT 30 OFFSET " +
          (input.page - 1) * 30,
        r.user.id,
      ),
      total: Number(
        (
          await db.get(
            "SELECT COUNT(*) AS n FROM ai_ledger WHERE userId=?",
            r.user.id,
          )
        ).n,
      ),
      page: input.page,
      legacy: true,
    }));
  });
  route("get", "/api/ai/interviews", async (r) => ({
    rows: await ai.sessions(r.user.id),
  }));
  route("post", "/api/ai/interviews", async (r) => {
    const input = z
      .object({
        mode: z.enum(["practice", "interview"]),
        difficulty: z.enum(["入门", "进阶", "挑战"]),
        count: z.number().int().min(2).max(10),
        moduleId: z.enum(["", ...catalog.modules.map((m) => m.id)]).default(""),
      })
      .strict()
      .parse(r.body);
    return ai.publicSession(await ai.startInterview(r.user.id, input));
  });
  route("get", "/api/ai/interviews/:id", (r) =>
    ai.getSession(r.user.id, z.string().uuid().parse(r.params.id)),
  );
  route("post", "/api/ai/interviews/:id/end", (r) => {
    z.object({}).strict().parse(r.body);
    return ai.endInterview(r.user.id, z.string().uuid().parse(r.params.id));
  });
  route("post", "/api/ai/interviews/:id/turns", async (r, res) => {
    const input = z
      .object({
        answer: answerSchema,
        turn: z.number().int().min(0).max(19),
        requestId: requestKey,
      })
      .strict()
      .parse(r.body);
    const sessionId = z.string().uuid().parse(r.params.id),
      session = await ai.getSession(r.user.id, sessionId);
    res.status(202);
    return ai.start(
      r.user,
      "interview",
      {
        ...input,
        sessionId,
        questionId: session.currentQuestionId,
        lessonId: session.currentLessonId,
      },
      r.ip,
    );
  });
  route("get", "/api/admin/ai/config", () => ai.adminConfig(), true);
  route(
    "get",
    "/api/admin/ai/pricing-simulation",
    () => pricingSimulation.read(),
    true,
  );
  route(
    "put",
    "/api/admin/ai/pricing-simulation",
    (r) => pricingSimulation.save(r.user.id, r.body),
    true,
  );
  route(
    "get",
    "/api/admin/ai/pool",
    async () => ({
      pool: await ai.pool.admin(),
      encryptionReady: ai.keyReady(),
    }),
    true,
  );
  route(
    "put",
    "/api/admin/ai/pool",
    async (r) => ({ pool: await ai.pool.save(r.user.id, r.body) }),
    true,
  );
  route(
    "put",
    "/api/admin/ai/scheduling",
    async (r) => ({
      pool: await ai.pool.saveScheduling(r.user.id, r.body),
    }),
    true,
  );
  route(
    "post",
    "/api/admin/ai/health/:id/reset",
    (r) => {
      z.object({}).strict().parse(r.body);
      return ai.pool.reset(r.user.id, z.string().uuid().parse(r.params.id));
    },
    true,
  );
  route(
    "put",
    "/api/admin/ai/config",
    async (r) => ({ config: await ai.saveConfig(r.user.id, r.body) }),
    true,
  );
  route(
    "post",
    "/api/admin/ai/models",
    (r) => {
      const input = z
        .object({ providerId: z.string().uuid().optional() })
        .strict()
        .parse(r.body);
      ai.limitIp(r.ip);
      return ai.models(r.user.id, input.providerId);
    },
    true,
  );
  route(
    "post",
    "/api/admin/ai/test",
    (r, res) => {
      const input = z
        .object({
          requestId: requestKey,
          targetId: z.string().uuid().optional(),
          testFeature: z.enum(["connection", "variants"]).optional(),
        })
        .strict()
        .parse(r.body);
      res.status(202);
      return ai.start(r.user, "test", input, r.ip);
    },
    true,
  );
  route(
    "get",
    "/api/admin/ai/users",
    async (r) => ({
      users: await ai.users(
        z
          .object({ query: z.string().max(40).default("") })
          .strict()
          .parse(r.query).query,
      ),
    }),
    true,
  );
  route(
    "post",
    "/api/admin/ai/credits",
    (r) => ai.billing.grant(r.user.id, grantSchema.parse(r.body)),
    true,
  );
  route(
    "get",
    "/api/admin/ai/users/:id/credits",
    (r) =>
      ai.billing.details(
        z.string().uuid().parse(r.params.id),
        z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .default(1)
          .parse(r.query.page),
        true,
      ),
    true,
  );
  route(
    "put",
    "/api/admin/ai/users/:id/billing-policy",
    (r) =>
      ai.billing.policy(
        r.user.id,
        z.string().uuid().parse(r.params.id),
        userPolicySchema.parse(r.body),
      ),
    true,
  );
  route(
    "post",
    "/api/admin/ai/users/:id/credits/:lotId/revoke",
    (r) => {
      const x = z
        .object({
          amount: z.union([z.string(), z.number()]),
          note: z.string().trim().min(3).max(300),
          operationId: requestKey,
        })
        .strict()
        .parse(r.body);
      return ai.billing.revoke(
        r.user.id,
        z.string().uuid().parse(r.params.id),
        id.parse(r.params.lotId),
        x.amount,
        x.note,
        x.operationId,
      );
    },
    true,
  );
  route(
    "get",
    "/api/admin/ai/products",
    async () => ({ rows: await ai.billing.products(true) }),
    true,
  );
  route(
    "post",
    "/api/admin/ai/products",
    (r) => ai.billing.saveProduct(r.user.id, r.body),
    true,
  );
  route(
    "post",
    "/api/admin/ai/products/:id/publish",
    (r) => {
      const x = z
        .object({ revision: requestKey, publish: z.boolean() })
        .strict()
        .parse(r.body);
      return ai.billing.publishProduct(
        r.user.id,
        z.string().uuid().parse(r.params.id),
        x.revision,
        x.publish,
      );
    },
    true,
  );
  route(
    "get",
    "/api/admin/ai/billing-settings",
    () => ai.repo.read((db) => ai.billing.settings(db)),
    true,
  );
  route(
    "put",
    "/api/admin/ai/billing-settings",
    (r) => ai.billing.saveSettings(r.user.id, r.body),
    true,
  );
  route(
    "post",
    "/api/admin/ai/runs/:id/reverse",
    (r) => {
      const x = z
        .object({
          note: z.string().trim().min(5).max(300),
          operationId: requestKey,
        })
        .strict()
        .parse(r.body);
      return ai.billing.reverse(
        r.user.id,
        z.string().uuid().parse(r.params.id),
        x.note,
        x.operationId,
      );
    },
    true,
  );
  route(
    "post",
    "/api/admin/ai/users/:id/block",
    (r) =>
      ai.block(
        r.user.id,
        z.string().uuid().parse(r.params.id),
        z.object({ blocked: z.boolean() }).strict().parse(r.body).blocked,
      ),
    true,
  );
  route(
    "get",
    "/api/admin/ai/runs",
    (r) => ai.history(r.user.id, historyQuery.parse(r.query), true),
    true,
  );
  route(
    "get",
    "/api/admin/ai/runs/:id",
    (r) => ai.getRun(r.user.id, z.string().uuid().parse(r.params.id), true),
    true,
  );
  route(
    "post",
    "/api/admin/ai/runs/:id/cost-review",
    (r) => {
      const x = z
        .object({
          note: z.string().trim().min(5).max(300),
          costCny: z
            .union([z.string(), z.number()])
            .transform((v) => points(micro(v)))
            .optional(),
        })
        .strict()
        .parse(r.body);
      return ai.reviewCosts(
        r.user.id,
        z.string().uuid().parse(r.params.id),
        x.note,
        x.costCny,
      );
    },
    true,
  );
  route(
    "post",
    "/api/admin/ai/runs/:id/reconcile",
    (r) => {
      const x = z
        .object({
          points: z
            .union([z.string(), z.number()])
            .transform((v) => points(micro(v))),
          note: z.string().trim().min(5).max(300),
        })
        .strict()
        .parse(r.body);
      return ai.reconcile(
        r.user.id,
        z.string().uuid().parse(r.params.id),
        x.points,
        x.note,
      );
    },
    true,
  );
  route("get", "/api/admin/ai/summary", () => ai.summary(), true);
  return ai;
}
