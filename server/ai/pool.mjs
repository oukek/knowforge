import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AiError, encrypt, decrypt, now } from "./policy.mjs";
import { micro, points } from "./amounts.mjs";

const integer = (min, max, fallback) =>
  z.number().int().min(min).max(max).default(fallback);
export const policySchema = z
  .object({
    outputLimit: integer(512, 4096, 2048),
    inputRate: integer(1, 1000, 1),
    cachedRate: integer(1, 1000, 1),
    outputRate: integer(1, 1000, 3),
    dailyRuns: integer(1, 100, 20),
    siteDailyRuns: integer(1, 10000, 200),
    perQuestionRuns: integer(1, 10, 3),
    maxAttempts: integer(1, 3, 3),
    attemptTimeoutMs: integer(10000, 60000, 25000),
    totalTimeoutMs: integer(10000, 90000, 80000),
  })
  .strict()
  .refine(
    (x) => x.totalTimeoutMs >= x.attemptTimeoutMs,
    "总超时不能小于单次超时",
  );
const modelSchema = z
  .object({
    id: z.string().uuid(),
    model: z.string().trim().min(1).max(160),
    enabled: z.boolean().default(true),
    features: z
      .array(z.enum(["grade", "variants", "interview"]))
      .min(1)
      .max(3)
      .refine((x) => new Set(x).size === x.length, "用途不能重复"),
    priority: integer(0, 10, 0),
    weight: integer(1, 100, 1),
    maxConcurrent: integer(1, 10, 3),
    format: z.enum(["schema", "json", "prompt"]).default("schema"),
    tokenParameter: z
      .enum(["max_completion_tokens", "max_tokens"])
      .default("max_completion_tokens"),
    procurement: z
      .object({
        input: z
          .union([z.string(), z.number()])
          .transform((v) => points(micro(v))),
        cached: z
          .union([z.string(), z.number()])
          .transform((v) => points(micro(v))),
        output: z
          .union([z.string(), z.number()])
          .transform((v) => points(micro(v))),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export const poolSchema = z
  .object({
    revision: z.string().uuid().optional(),
    policy: policySchema,
    providers: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().trim().min(1).max(80),
            baseUrl: z.string().url().max(500),
            protocol: z.enum(["chat", "responses"]),
            enabled: z.boolean().default(true),
            maxConcurrent: integer(1, 10, 3),
            apiKey: z
              .string()
              .min(1)
              .max(1000)
              .refine((x) => !/[\r\n]/.test(x), "Key 不能包含换行")
              .optional(),
            models: z.array(modelSchema).max(16),
          })
          .strict(),
      )
      .max(12),
  })
  .strict()
  .superRefine((x, ctx) => {
    const ids = x.providers.flatMap((p) => [
      p.id,
      ...p.models.map((m) => m.id),
    ]);
    if (new Set(ids).size !== ids.length || ids.length > 76)
      ctx.addIssue({
        code: "custom",
        message: "服务商与模型 ID 必须唯一，最多配置 64 个模型",
      });
    if (x.providers.reduce((n, p) => n + p.models.length, 0) > 64)
      ctx.addIssue({ code: "custom", message: "最多配置 64 个模型" });
    for (const p of x.providers)
      if (new Set(p.models.map((m) => m.model)).size !== p.models.length)
        ctx.addIssue({
          code: "custom",
          message: "同一服务商的模型 ID 不能重复，请在同一模型上选择多个用途",
        });
  });

// Health is credential-wide for authentication/quota errors, model-scoped for
// model compatibility and output errors. Persist cooldowns, never active leases.
export function failurePolicy(error) {
  const status = error.upstreamStatus;
  const info = (
    String(error.upstreamCode || "") +
    " " +
    String(error.providerDetail || "")
  ).toLowerCase();
  if ([401, 403].includes(status))
    return {
      scope: "provider",
      reason: "凭据或权限错误，修正配置后恢复",
      manual: true,
      cooldown: 0,
    };
  if (
    status === 429 &&
    /quota|credit|balance|billing|spend|insufficient|余额|欠费|额度耗尽/.test(
      info,
    )
  )
    return {
      scope: "provider",
      reason: "服务商余额或总额度不足",
      cooldown: Math.max(3600000, error.retryAfterMs || 0),
    };
  if (status === 429)
    return {
      scope: "provider",
      reason: "服务商限流",
      cooldown: Math.max(10000, error.retryAfterMs || 60000),
    };
  if ([400, 404, 405, 422].includes(status))
    return {
      scope: "model",
      reason: "模型或接口参数不兼容",
      manual: true,
      cooldown: 0,
    };
  if (error.code === "AI_INVALID_OUTPUT")
    return { scope: "model", reason: "模型输出未通过校验", cooldown: 30000 };
  if (error.code === "AI_KEY_UNAVAILABLE")
    return {
      scope: "provider",
      reason: "服务凭据无法解密",
      manual: true,
      cooldown: 0,
    };
  return {
    scope: "provider",
    reason: "服务连接或上游异常",
    cooldown: Math.max(15000, error.retryAfterMs || 0),
  };
}

export class AiPool {
  constructor(repo, adapter, rootKey, options = {}) {
    this.repo = repo;
    this.adapter = adapter;
    this.rootKey = rootKey;
    this.clock = options.clock || Date.now;
    this.health = new Map();
    this.active = new Map();
    this.weights = new Map();
    this.epochs = new Map();
  }
  async init() {
    await this.repo.transaction(async (db) => {
      const existing = await this.raw(db);
      const legacy = await this.repo.configRaw(db);
      if (!existing && legacy)
        await this.importLegacy(
          db,
          JSON.parse(legacy.data),
          legacy.encryptedKey,
        );
      if (!(await this.raw(db)))
        await this.put(db, "pool", {
          revision: randomUUID(),
          providers: [],
          policy: policySchema.parse({}),
        });
      for (const row of await db.all("SELECT * FROM ai_health"))
        this.health.set(row.id, JSON.parse(row.data));
    });
  }
  async raw(db) {
    const row = await db.get("SELECT * FROM ai_config WHERE id=?", "pool");
    return row ? { ...JSON.parse(row.data), updatedAt: row.updatedAt } : null;
  }
  async put(db, id, data, key = "") {
    const old = await db.get("SELECT id FROM ai_config WHERE id=?", id);
    if (old)
      await db.run(
        "UPDATE ai_config SET data=?,encryptedKey=?,updatedAt=? WHERE id=?",
        JSON.stringify(data),
        key,
        now(),
        id,
      );
    else
      await db.run(
        "INSERT INTO ai_config(id,data,encryptedKey,updatedAt) VALUES(?,?,?,?)",
        id,
        JSON.stringify(data),
        key,
        now(),
      );
  }
  async importLegacy(db, config, encryptedKey) {
    const old = await this.raw(db);
    const id = old?.providers[0]?.id || randomUUID();
    const map = new Map();
    for (const feature of ["grade", "interview", "variants"]) {
      const name =
        config[
          {
            grade: "gradingModel",
            interview: "interviewModel",
            variants: "variantsModel",
          }[feature]
        ] || config.model;
      if (!name) continue;
      if (!map.has(name))
        map.set(name, {
          id: randomUUID(),
          model: name,
          enabled: true,
          features: [],
          priority: 0,
          weight: 1,
          maxConcurrent: 3,
          format: config.format,
          tokenParameter: config.tokenParameter || "max_completion_tokens",
        });
      map.get(name).features.push(feature);
    }
    const provider = {
      id,
      name: config.name,
      baseUrl: config.baseUrl,
      protocol: config.protocol,
      enabled: true,
      maxConcurrent: 3,
      models: [...map.values()],
    };
    const keys = [
      "outputLimit",
      "inputRate",
      "cachedRate",
      "outputRate",
      "dailyRuns",
      "siteDailyRuns",
      "perQuestionRuns",
    ];
    const policy = policySchema.parse(
      Object.fromEntries(keys.map((key) => [key, config[key]])),
    );
    await this.put(db, "provider:" + id, {}, encryptedKey);
    await this.put(db, "pool", {
      revision: randomUUID(),
      policy,
      providers: [provider],
    });
  }
  async admin() {
    return this.repo.read(async (db) => {
      const pool = (await this.raw(db)) || {
        policy: policySchema.parse({}),
        providers: [],
      };
      const providers = [];
      for (const p of pool.providers)
        providers.push({
          ...p,
          hasKey: !!(
            await db.get(
              "SELECT encryptedKey FROM ai_config WHERE id=?",
              "provider:" + p.id,
            )
          )?.encryptedKey,
        });
      return {
        ...pool,
        providers,
        health: this.healthView(pool),
        strategy: "weighted-least-active",
      };
    });
  }
  async save(actorId, input) {
    const parsed = poolSchema.parse(input);
    for (const p of parsed.providers) await this.adapter.validate(p.baseUrl);
    const result = await this.repo.transaction(async (db) => {
      const old = await this.raw(db);
      if (old && parsed.revision !== old.revision)
        throw new AiError(
          409,
          "配置已被修改，请重新加载后保存",
          "AI_CONFIG_CONFLICT",
        );
      const providers = [];
      const reset = [];
      for (const p of parsed.providers) {
        const { apiKey, ...settings } = p;
        const keyRow = await db.get(
          "SELECT * FROM ai_config WHERE id=?",
          "provider:" + p.id,
        );
        if (!apiKey && !keyRow)
          throw new AiError(400, p.name + " 首次保存需要填写 API Key");
        const encoded = apiKey
          ? encrypt(apiKey, this.rootKey)
          : keyRow.encryptedKey;
        decrypt(encoded, this.rootKey);
        await this.put(db, "provider:" + p.id, {}, encoded);
        providers.push(settings);
        const prior = old?.providers.find((x) => x.id === p.id);
        if (
          apiKey ||
          (prior &&
            (prior.baseUrl !== p.baseUrl || prior.protocol !== p.protocol))
        )
          reset.push(p.id, ...p.models.map((m) => m.id));
        else
          for (const m of p.models)
            if (
              JSON.stringify(m) !==
              JSON.stringify(prior?.models.find((x) => x.id === m.id))
            )
              reset.push(m.id);
      }
      for (const p of old?.providers || [])
        if (!providers.some((x) => x.id === p.id)) {
          await db.run("DELETE FROM ai_config WHERE id=?", "provider:" + p.id);
          reset.push(p.id, ...p.models.map((m) => m.id));
        } else {
          const nextProvider = providers.find((x) => x.id === p.id);
          reset.push(
            ...p.models
              .filter((m) => !nextProvider.models.some((x) => x.id === m.id))
              .map((m) => m.id),
          );
        }
      const next = { revision: randomUUID(), policy: parsed.policy, providers };
      await this.put(db, "pool", next);
      // Retire the legacy duplicate credential after the pool is explicitly saved.
      await db.run("DELETE FROM ai_config WHERE id=?", "main");
      await this.repo.audit(db, actorId, "ai.pool.save", {
        ...next,
        credentialsChanged: parsed.providers
          .filter((p) => p.apiKey)
          .map((p) => p.id),
      });
      for (const id of reset)
        await db.run("DELETE FROM ai_health WHERE id=?", id);
      return { next, reset };
    });
    for (const id of result.reset) {
      this.health.delete(id);
      this.epochs.set(id, (this.epochs.get(id) || 0) + 1);
    }
    this.weights.clear();
    return this.admin();
  }
  async snapshot(db, feature, targetId) {
    const pool = await this.raw(db);
    if (!pool)
      throw new AiError(503, "管理员尚未配置 AI 服务", "AI_NOT_CONFIGURED");
    const targets = [];
    for (const p of pool.providers) {
      if (!p.enabled) continue;
      const models = p.models.filter(
        (m) =>
          m.enabled &&
          (feature === "test"
            ? !targetId || m.id === targetId
            : m.features.includes(feature)),
      );
      if (!models.length) continue;
      const row = await db.get(
        "SELECT encryptedKey FROM ai_config WHERE id=?",
        "provider:" + p.id,
      );
      for (const m of models)
        targets.push({
          providerId: p.id,
          providerName: p.name,
          providerMaxConcurrent: p.maxConcurrent,
          ...m,
          baseUrl: p.baseUrl,
          protocol: p.protocol,
          encryptedKey: row?.encryptedKey || "",
        });
    }
    if (!targets.length)
      throw new AiError(503, "该功能尚未配置启用的模型", "AI_NOT_CONFIGURED");
    return { ...pool.policy, revision: pool.revision, targets };
  }
  healthView(pool) {
    return pool.providers
      .flatMap((p) => [p, ...p.models])
      .map((x) => {
        const h = this.health.get(x.id);
        return {
          id: x.id,
          state: h?.manual
            ? "disabled"
            : h?.until > this.clock()
              ? "cooldown"
              : h
                ? "half-open"
                : "healthy",
          ...h,
          active: this.active.get(x.id) || 0,
        };
      });
  }
  ready(target) {
    return (
      [target.providerId, target.id].every((id) => {
        const h = this.health.get(id);
        return (
          !h?.manual &&
          !(h?.until > this.clock()) &&
          (!h || !(this.active.get(id) > 0))
        );
      }) &&
      (this.active.get(target.providerId) || 0) <
        target.providerMaxConcurrent &&
      (this.active.get(target.id) || 0) < target.maxConcurrent
    );
  }
  acquire(targets, excluded = new Set()) {
    const eligible = targets.filter(
      (x) => !excluded.has(x.id) && this.ready(x),
    );
    if (!eligible.length)
      throw new AiError(
        503,
        "AI 服务暂时繁忙或正在恢复，请稍后重试",
        "AI_POOL_UNAVAILABLE",
      );
    const priority = Math.min(...eligible.map((x) => x.priority));
    const tier = eligible.filter((x) => x.priority === priority);
    const load = (x) => (this.active.get(x.id) || 0) / x.weight;
    const minimum = Math.min(...tier.map(load));
    const available = tier.filter((x) => load(x) === minimum);
    let total = 0;
    for (const x of available) {
      total += x.weight;
      this.weights.set(x.id, (this.weights.get(x.id) || 0) + x.weight);
    }
    const target = available.reduce((a, b) =>
      this.weights.get(a.id) >= this.weights.get(b.id) ? a : b,
    );
    this.weights.set(target.id, this.weights.get(target.id) - total);
    for (const id of [target.providerId, target.id])
      this.active.set(id, (this.active.get(id) || 0) + 1);
    let released = false;
    const observed = Object.fromEntries(
      [target.providerId, target.id].map((id) => [
        id,
        { health: this.health.get(id), epoch: this.epochs.get(id) || 0 },
      ]),
    );
    return {
      target,
      observed,
      release: () => {
        if (released) return;
        released = true;
        for (const id of [target.providerId, target.id]) {
          const n = (this.active.get(id) || 1) - 1;
          if (n) this.active.set(id, n);
          else this.active.delete(id);
        }
      },
    };
  }
  async outcome(target, error, observed) {
    const ids = [target.providerId, target.id];
    if (
      observed &&
      ids.some((id) => (this.epochs.get(id) || 0) !== observed[id].epoch)
    )
      return;
    if (!error) {
      const unchanged = ids.filter(
        (id) => !observed || this.health.get(id) === observed[id].health,
      );
      await this.repo.transaction(async (db) => {
        for (const id of unchanged) {
          if (!observed || this.health.get(id) === observed[id].health) {
            await db.run("DELETE FROM ai_health WHERE id=?", id);
            this.health.delete(id);
          }
        }
      });
      return;
    }
    if (["AI_CANCELLED", "AI_REFUSAL"].includes(error.code)) return;
    const rule = failurePolicy(error);
    const id = rule.scope === "provider" ? target.providerId : target.id;
    const count = (this.health.get(id)?.failures || 0) + 1;
    let h = {
      failures: count,
      reason: rule.reason,
      code: error.code,
      upstreamStatus: error.upstreamStatus || null,
      manual: !!rule.manual,
      until:
        this.clock() +
        Math.min(
          86400000,
          rule.cooldown * Math.min(8, 2 ** Math.min(count - 1, 3)),
        ),
      updatedAt: now(),
    };
    await this.repo.transaction(async (db) => {
      if (
        observed &&
        ids.some((key) => (this.epochs.get(key) || 0) !== observed[key].epoch)
      )
        return;
      const prior = this.health.get(id);
      // A later transient failure must not weaken a credential block or quota cooldown.
      if (prior && (prior.manual || prior.until > h.until))
        h = {
          ...prior,
          failures: Math.max(prior.failures, h.failures),
          updatedAt: now(),
        };
      if (await db.get("SELECT id FROM ai_health WHERE id=?", id))
        await db.run(
          "UPDATE ai_health SET data=?,updatedAt=? WHERE id=?",
          JSON.stringify(h),
          now(),
          id,
        );
      else
        await db.run(
          "INSERT INTO ai_health(id,data,updatedAt) VALUES(?,?,?)",
          id,
          JSON.stringify(h),
          now(),
        );
      this.health.set(id, h);
    });
  }
  async reset(actorId, id) {
    await this.repo.transaction(async (db) => {
      const pool = await this.raw(db);
      const provider = pool?.providers.find((p) => p.id === id);
      const ids = provider ? [id, ...provider.models.map((m) => m.id)] : [id];
      if (
        !pool?.providers.some(
          (p) => p.id === id || p.models.some((m) => m.id === id),
        )
      )
        throw new AiError(404, "服务商或模型不存在");
      for (const key of ids) {
        await db.run("DELETE FROM ai_health WHERE id=?", key);
        this.health.delete(key);
        this.epochs.set(key, (this.epochs.get(key) || 0) + 1);
      }
      await this.repo.audit(db, actorId, "ai.health.reset", { ids });
    });
    return this.admin();
  }
}
