import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AiError, hash, now } from "./policy.mjs";
import { SCALE, MAX, micro, points, quote, usageCharge } from "./amounts.mjs";

const amount = z
  .union([z.string(), z.number()])
  .transform((v) => points(micro(v)));
const positive = amount.refine((v) => micro(v) > 0n, "额度必须大于零");
const days = z.number().int().min(1).max(3650).nullable();
export const grantSchema = z
  .object({
    userId: z.string().uuid(),
    amount: positive.optional(),
    productVersionId: z.string().uuid().optional(),
    source: z.enum(["gift", "compensation"]).default("gift"),
    validDays: days.optional(),
    note: z.string().trim().min(3).max(300),
    operationId: z.string().uuid(),
  })
  .strict()
  .refine(
    (x) => !!x.amount !== !!x.productVersionId,
    "请选择赠送额度或资源包版本之一",
  );
export const userPolicySchema = z
  .object({
    mode: z.enum(["paid", "exempt"]),
    freeDays: days,
    dailyBudget: positive.nullable(),
    note: z.string().trim().min(3).max(300),
    operationId: z.string().uuid(),
  })
  .strict();
export const productSchema = z
  .object({
    id: z.string().uuid().optional(),
    revision: z.string().uuid().optional(),
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9_-]+$/),
    name: z.string().trim().min(1).max(80),
    price: z.union([z.string(), z.number()]).transform((v) => {
      const s = String(v);
      if (!/^\d+(\.\d{1,2})?$/.test(s) || micro(s) > micro("1000000"))
        throw new AiError(400, "售价须为最多两位小数的非负人民币金额");
      return s;
    }),
    credits: positive,
    bonus: amount.default("0"),
    validDays: days,
    description: z.string().trim().max(500).default(""),
    tag: z.string().trim().max(30).default(""),
    sort: z.number().int().min(0).max(10000).default(0),
    note: z.string().trim().min(3).max(300),
  })
  .strict();
export const settingsSchema = z
  .object({
    maxTaskPoints: positive,
    dailyBudget: positive,
    pendingHours: z.number().int().min(1).max(48),
    revision: z.string().uuid().optional(),
  })
  .strict();
const decode = (r) => (r ? { ...r, ...JSON.parse(r.data) } : null);
const integer = (x) => BigInt(x || 0);
const publicProduct = (value) => {
  if (!value) return null;
  const { note, priceFen, ...snapshot } = value;
  return snapshot;
};
const stampAfter = (clock, dayCount) =>
  dayCount === null
    ? ""
    : new Date(clock() + dayCount * 86400000).toISOString();

export class AiBilling {
  constructor(repo, options = {}) {
    this.repo = repo;
    this.clock = options.clock || Date.now;
  }
  time() {
    return new Date(this.clock()).toISOString();
  }
  async settings(db) {
    const row = await db.get(
      "SELECT data FROM ai_config WHERE id=?",
      "billing",
    );
    return row
      ? JSON.parse(row.data)
      : { maxTaskPoints: "90", dailyBudget: "1000", pendingHours: 24 };
  }
  async saveSettings(actor, input) {
    const settings = settingsSchema.parse(input);
    return this.repo.transaction(async (db) => {
      const prior = await this.settings(db);
      if (prior.revision && prior.revision !== settings.revision)
        throw new AiError(409, "预算设置已变化，请刷新");
      const data = { ...settings, revision: randomUUID() };
      const row = await db.get(
        "SELECT id FROM ai_config WHERE id=?",
        "billing",
      );
      if (row)
        await db.run(
          "UPDATE ai_config SET data=?,updatedAt=? WHERE id=?",
          JSON.stringify(data),
          now(),
          "billing",
        );
      else
        await db.run(
          "INSERT INTO ai_config(id,data,encryptedKey,updatedAt) VALUES(?,?,?,?)",
          "billing",
          JSON.stringify(data),
          "",
          now(),
        );
      await this.repo.audit(db, actor, "billing.settings", data);
      return data;
    });
  }
  async ensure(db, userId) {
    if (!(await db.get("SELECT id FROM auth_users WHERE id=?", userId)))
      throw new AiError(404, "账号不存在");
    const legacy = await this.repo.account(db, userId, true);
    let row = await db.get(
      "SELECT * FROM ai_credit_accounts WHERE userId=?",
      userId,
    );
    if (row) return { ...JSON.parse(row.data), blocked: legacy.blocked };
    const policy = {
      version: 2,
      mode: "paid",
      freeFrom: "",
      freeUntil: "",
      dailyBudget: null,
    };
    await db.run(
      "INSERT INTO ai_credit_accounts(userId,data,updatedAt) VALUES(?,?,?)",
      userId,
      JSON.stringify(policy),
      now(),
    );
    const balance = BigInt(legacy.balance) * SCALE,
      reserved = BigInt(legacy.reserved) * SCALE;
    if (balance > 0n) {
      const lot = await this.createLot(db, {
        id: "legacy-" + userId,
        userId,
        source: "legacy",
        title: "历史永久额度",
        amount: balance,
        expiresAt: "",
        data: { legacyBalance: legacy.balance },
      });
      if (reserved) {
        const rows = await db.all(
          "SELECT * FROM ai_runs WHERE userId=? AND (status=? OR status=?) AND feature<>?",
          userId,
          "running",
          "pending",
          "models",
        );
        let bound = 0n;
        for (const raw of rows) {
          const run = { ...JSON.parse(raw.data), id: raw.id };
          const value = micro(run.reservedPoints || 0);
          if (!value) continue;
          bound += value;
          if (bound > reserved)
            throw new AiError(
              503,
              "旧额度预占与调用记录不一致，需要核对后迁移",
            );
          const unit = {
            legacy: true,
            allocations: [{ lotId: lot.id, held: String(value) }],
            rates: run.config,
            tariffVersion: "legacy",
            expiresAt: new Date(this.clock() + 86400000).toISOString(),
            fingerprint: hash(run.input || {}),
          };
          await this.insertUnit(db, {
            id: run.id,
            userId,
            feature: run.feature,
            status: "pending",
            mode: "paid",
            quoted: value,
            budgetUsed: value,
            data: unit,
            createdAt: run.createdAt || now(),
          });
        }
        if (bound !== reserved)
          throw new AiError(
            503,
            "旧额度存在未关联预占，需要人工核对，迁移未修改余额",
          );
        lot.available -= reserved;
        lot.reserved += reserved;
        await this.saveLot(db, lot);
      }
      await this.event(
        db,
        "legacy-migration:" + userId,
        userId,
        "",
        "migration",
        balance,
        "迁移原有余额，保持永久有效",
        { legacyBalance: legacy.balance, legacyReserved: legacy.reserved },
      );
    } else if (reserved) throw new AiError(503, "旧额度余额异常，需要人工核对");
    return { ...policy, blocked: legacy.blocked };
  }
  async lots(db, userId) {
    return (
      await db.all(
        "SELECT * FROM ai_credit_lots WHERE userId=? ORDER BY CASE WHEN expiresAt='' THEN 1 ELSE 0 END,expiresAt,createdAt,id",
        userId,
      )
    ).map((r) => ({
      ...r,
      ...Object.fromEntries(
        [
          "granted",
          "available",
          "reserved",
          "consumed",
          "expired",
          "revoked",
        ].map((k) => [k, integer(r[k])]),
      ),
    }));
  }
  async saveLot(db, lot) {
    for (const key of [
      "available",
      "reserved",
      "consumed",
      "expired",
      "revoked",
    ])
      if (lot[key] < 0n) throw new AiError(503, "额度账目异常，操作已回滚");
    if (
      lot.granted !==
      lot.available + lot.reserved + lot.consumed + lot.expired + lot.revoked
    )
      throw new AiError(503, "额度账目不守恒，操作已回滚");
    await db.run(
      "UPDATE ai_credit_lots SET available=?,reserved=?,consumed=?,expired=?,revoked=?,updatedAt=? WHERE id=?",
      String(lot.available),
      String(lot.reserved),
      String(lot.consumed),
      String(lot.expired),
      String(lot.revoked),
      now(),
      lot.id,
    );
  }
  async createLot(db, x) {
    if (x.amount <= 0n || x.amount > MAX)
      throw new AiError(400, "额度批次数量无效");
    const id = x.id || randomUUID(),
      stamp = this.time();
    const lot = {
      id,
      userId: x.userId,
      source: x.source,
      title: x.title,
      granted: x.amount,
      available: x.amount,
      reserved: 0n,
      consumed: 0n,
      expired: 0n,
      revoked: 0n,
      expiresAt: x.expiresAt || "",
      data: JSON.stringify(x.data || {}),
      createdAt: stamp,
      updatedAt: stamp,
    };
    await db.run(
      "INSERT INTO ai_credit_lots(id,userId,source,title,granted,available,reserved,consumed,expired,revoked,expiresAt,data,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      lot.userId,
      lot.source,
      lot.title,
      String(x.amount),
      String(x.amount),
      "0",
      "0",
      "0",
      "0",
      lot.expiresAt,
      lot.data,
      stamp,
      stamp,
    );
    return lot;
  }
  async event(db, id, userId, runId, kind, value, note, data = {}) {
    await db.run(
      "INSERT INTO ai_credit_events(id,userId,runId,kind,amount,note,data,createdAt) VALUES(?,?,?,?,?,?,?,?)",
      id,
      userId,
      runId || "",
      kind,
      String(value),
      note,
      JSON.stringify(data),
      this.time(),
    );
  }
  async expire(db, userId) {
    const expired = [];
    for (const lot of await this.lots(db, userId))
      if (lot.expiresAt && lot.expiresAt <= this.time() && lot.available > 0n) {
        const n = lot.available;
        lot.available = 0n;
        lot.expired += n;
        await this.saveLot(db, lot);
        expired.push({ lotId: lot.id, amount: points(n) });
      }
    if (expired.length)
      await this.event(
        db,
        randomUUID(),
        userId,
        "",
        "expire",
        -expired.reduce((n, a) => n + micro(a.amount), 0n),
        "额度到期",
        { allocations: expired },
      );
  }
  async view(db, userId) {
    const policy = await this.ensure(db, userId);
    await this.expire(db, userId);
    const lots = await this.lots(db, userId);
    const sums = Object.fromEntries(
      [
        "granted",
        "available",
        "reserved",
        "consumed",
        "expired",
        "revoked",
      ].map((k) => [k, lots.reduce((n, x) => n + x[k], 0n)]),
    );
    const exempt =
      policy.mode === "exempt" &&
      (!policy.freeFrom || policy.freeFrom <= this.time()) &&
      (!policy.freeUntil || policy.freeUntil > this.time());
    const expiring = lots.reduce(
      (n, x) =>
        n +
        (x.expiresAt &&
        x.expiresAt > this.time() &&
        x.expiresAt <= new Date(this.clock() + 7 * 86400000).toISOString()
          ? x.available
          : 0n),
      0n,
    );
    return {
      userId,
      ...Object.fromEntries(
        Object.entries(sums).map(([k, v]) => [k, points(v)]),
      ),
      balance: points(sums.available + sums.reserved),
      expiring: points(expiring),
      blocked: policy.blocked,
      exempt,
      policy: { ...policy, note: undefined },
    };
  }
  async policy(actor, userId, input) {
    const x = userPolicySchema.parse(input),
      fingerprint = hash({ userId, ...x });
    return this.repo.transaction(async (db) => {
      const old = await db.get(
        "SELECT * FROM admin_audit WHERE id=?",
        x.operationId,
      );
      if (old) {
        if (
          JSON.parse(old.data).fingerprint !== fingerprint ||
          old.userId !== actor
        )
          throw new AiError(409, "操作标识已用于其他修改");
        return this.view(db, userId);
      }
      if (!(await db.get("SELECT id FROM auth_users WHERE id=?", userId)))
        throw new AiError(404, "账号不存在");
      const prior = await this.ensure(db, userId);
      const value = {
        version: 2,
        mode: x.mode,
        freeFrom: x.mode === "exempt" ? this.time() : "",
        freeUntil:
          x.mode === "exempt" ? stampAfter(this.clock, x.freeDays) : "",
        dailyBudget: x.dailyBudget,
        note: x.note,
      };
      await db.run(
        "UPDATE ai_credit_accounts SET data=?,updatedAt=? WHERE userId=?",
        JSON.stringify(value),
        now(),
        userId,
      );
      await db.run(
        "INSERT INTO admin_audit(id,userId,action,data,createdAt) VALUES(?,?,?,?,?)",
        x.operationId,
        actor,
        "billing.user-policy",
        JSON.stringify({
          targetUserId: userId,
          prior,
          policy: value,
          fingerprint,
        }),
        now(),
      );
      return this.view(db, userId);
    });
  }
  async grant(actor, input) {
    const x = grantSchema.parse(input),
      fingerprint = hash({ actor, ...x });
    return this.repo.transaction(async (db) => {
      const prior = await db.get(
        "SELECT * FROM ai_credit_events WHERE id=?",
        x.operationId,
      );
      if (prior) {
        if (JSON.parse(prior.data).fingerprint !== fingerprint)
          throw new AiError(409, "操作标识已用于其他发放");
        return this.view(db, x.userId);
      }
      if (!(await db.get("SELECT id FROM auth_users WHERE id=?", x.userId)))
        throw new AiError(404, "账号不存在");
      const account = await this.view(db, x.userId);
      let product = null;
      if (x.productVersionId) {
        const version = await db.get(
          "SELECT * FROM ai_product_versions WHERE id=?",
          x.productVersionId,
        );
        if (!version) throw new AiError(404, "资源包版本不存在");
        product = {
          ...JSON.parse(version.data),
          versionId: version.id,
          version: version.version,
        };
      }
      const value = product
        ? micro(product.credits) + micro(product.bonus)
        : micro(x.amount);
      if (micro(account.balance) + value > MAX)
        throw new AiError(400, "发放后可持有额度超过上限");
      const validDays =
        x.validDays === undefined ? (product?.validDays ?? null) : x.validDays;
      const allocations = [];
      for (const [title, n, kind] of product
        ? [
            [product.name, micro(product.credits), x.source],
            [product.name + " · 附赠", micro(product.bonus), "bonus"],
          ]
        : [
            [
              x.source === "compensation" ? "人工补偿" : "手动赠送",
              value,
              x.source,
            ],
          ])
        if (n > 0n) {
          const lot = await this.createLot(db, {
            userId: x.userId,
            source: kind,
            title,
            amount: n,
            expiresAt: stampAfter(this.clock, validDays),
            data: {
              product,
              grantId: x.operationId,
              actorId: actor,
              note: x.note,
              payment: "none",
            },
          });
          allocations.push({ lotId: lot.id, amount: points(n) });
        }
      await this.event(
        db,
        x.operationId,
        x.userId,
        "",
        "grant",
        value,
        x.note,
        {
          fingerprint,
          actorId: actor,
          productVersionId: x.productVersionId || "",
          allocations,
        },
      );
      await this.repo.audit(db, actor, "credit.grant", {
        userId: x.userId,
        amount: points(value),
        allocations,
        note: x.note,
      });
      return this.view(db, x.userId);
    });
  }
  async revoke(actor, userId, lotId, value, note, operationId) {
    const n = micro(value);
    if (n <= 0n) throw new AiError(400, "收回额度必须大于零");
    const fingerprint = hash({ actor, userId, lotId, value: points(n), note });
    return this.repo.transaction(async (db) => {
      const prior = await db.get(
        "SELECT data FROM ai_credit_events WHERE id=?",
        operationId,
      );
      if (prior) {
        if (JSON.parse(prior.data).fingerprint !== fingerprint)
          throw new AiError(409, "操作标识已用于其他操作");
        return this.view(db, userId);
      }
      await this.view(db, userId);
      const lot = (await this.lots(db, userId)).find((x) => x.id === lotId);
      if (!lot) throw new AiError(404, "额度批次不存在");
      if (lot.available < n)
        throw new AiError(
          400,
          "只能收回该批次的有效可用额度，预占与已消费部分不可收回",
        );
      lot.available -= n;
      lot.revoked += n;
      await this.saveLot(db, lot);
      await this.event(db, operationId, userId, "", "revoke", -n, note, {
        fingerprint,
        actorId: actor,
        allocations: [{ lotId, amount: points(n) }],
      });
      await this.repo.audit(db, actor, "credit.revoke", {
        userId,
        lotId,
        amount: points(n),
        note,
      });
      return this.view(db, userId);
    });
  }
  async insertUnit(db, x) {
    await db.run(
      "INSERT INTO ai_billing_units(id,userId,feature,status,mode,quoted,due,charged,waived,budgetUsed,data,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      x.id,
      x.userId,
      x.feature,
      x.status,
      x.mode,
      String(x.quoted),
      null,
      null,
      null,
      String(x.budgetUsed),
      JSON.stringify(x.data),
      x.createdAt || this.time(),
      this.time(),
    );
  }
  async unit(db, id) {
    return decode(
      await db.get("SELECT * FROM ai_billing_units WHERE id=?", id),
    );
  }
  async saveUnit(db, u) {
    const data = { ...u };
    for (const k of [
      "id",
      "userId",
      "feature",
      "status",
      "mode",
      "quoted",
      "due",
      "charged",
      "waived",
      "budgetUsed",
      "createdAt",
      "updatedAt",
      "data",
    ])
      delete data[k];
    await db.run(
      "UPDATE ai_billing_units SET status=?,due=?,charged=?,waived=?,budgetUsed=?,data=?,updatedAt=? WHERE id=?",
      u.status,
      u.due == null ? null : String(u.due),
      u.charged == null ? null : String(u.charged),
      u.waived == null ? null : String(u.waived),
      String(u.budgetUsed),
      JSON.stringify(data),
      this.time(),
      u.id,
    );
  }
  async reserve(db, run, config, messages) {
    const account = await this.view(db, run.userId),
      settings = await this.settings(db);
    if (account.blocked) throw new AiError(403, "该账号的 AI 使用已暂停");
    const n = quote(messages, config, run.feature);
    if (n > micro(settings.maxTaskPoints))
      throw new AiError(
        400,
        "本次预占超过单次任务预算，请管理员调整输出上限或任务预算",
        "AI_TASK_BUDGET",
      );
    const mode =
      run.feature === "test" ? "platform" : account.exempt ? "exempt" : "paid";
    const today = await db.all(
      "SELECT budgetUsed FROM ai_billing_units WHERE userId=? AND createdAt>=?",
      run.userId,
      new Date(this.clock() - 86400000).toISOString(),
    );
    if (
      today.reduce((v, u) => v + integer(u.budgetUsed), 0n) + n >
      micro(account.policy.dailyBudget || settings.dailyBudget)
    )
      throw new AiError(429, "已达到近 24 小时 AI 预算限制", "AI_DAILY_BUDGET");
    if (mode === "paid" && micro(account.available) < n)
      throw new AiError(
        402,
        "可用 AI 额度不足，本次最多预占 " + points(n) + " 额度",
        "AI_INSUFFICIENT_CREDIT",
      );
    const allocations = [];
    let left = n;
    if (mode === "paid")
      for (const lot of await this.lots(db, run.userId)) {
        const take = lot.available < left ? lot.available : left;
        if (take <= 0n) continue;
        lot.available -= take;
        lot.reserved += take;
        await this.saveLot(db, lot);
        allocations.push({ lotId: lot.id, held: String(take) });
        left -= take;
        if (!left) break;
      }
    const rates = {
      inputRate: config.inputRate,
      cachedRate: config.cachedRate,
      outputRate: config.outputRate,
    };
    await this.insertUnit(db, {
      id: run.id,
      userId: run.userId,
      feature: run.feature,
      status: "reserved",
      mode,
      quoted: n,
      budgetUsed: n,
      data: {
        allocations,
        rates,
        tariffVersion: hash(rates),
        expiresAt: new Date(
          this.clock() + settings.pendingHours * 3600000,
        ).toISOString(),
      },
      createdAt: this.time(),
    });
    if (mode === "paid")
      await this.event(
        db,
        run.id + ":reserve",
        run.userId,
        run.id,
        "reserve",
        0n,
        "预占 " + points(n) + " 额度",
        {
          allocations: allocations.map((a) => ({
            lotId: a.lotId,
            amount: points(a.held),
          })),
        },
      );
    return {
      billingVersion: 2,
      billingMode: mode,
      billingStatus: "reserved",
      reservedPoints: mode === "paid" ? points(n) : "0",
      quotedPoints: points(n),
      chargedPoints: null,
      duePoints: null,
      waivedPoints: null,
      tariffVersion: hash(rates),
    };
  }
  async settle(db, run, usage, success, manual = null, releaseReason = "") {
    await this.ensure(db, run.userId);
    const u = await this.unit(db, run.id);
    if (!u) throw new AiError(503, "计费单元不存在");
    if (!["reserved", "pending"].includes(u.status)) return this.runFields(u);
    let due =
      manual === null
        ? usage
          ? usageCharge(usage, u.rates)
          : null
        : micro(manual);
    if (u.legacy && usage && manual === null)
      due = ((due + SCALE - 1n) / SCALE) * SCALE;
    const max = integer(u.quoted),
      capped = success && due !== null && due > max;
    if (!success && !releaseReason) due = 0n;
    if (due === null && success && u.mode === "paid") {
      u.status = "pending";
      await this.saveUnit(db, u);
      return { ...this.runFields(u), chargeCapped: false };
    }
    const charged = u.mode === "paid" ? (due > max ? max : due || 0n) : 0n;
    const waived = u.mode === "paid" ? 0n : due || 0n;
    let left = charged;
    const split = [];
    const lots = await this.lots(db, run.userId);
    for (const a of u.allocations) {
      const lot = lots.find((x) => x.id === a.lotId);
      if (!lot) throw new AiError(503, "预占批次不存在");
      const held = integer(a.held),
        used = held < left ? held : left,
        released = held - used;
      lot.reserved -= held;
      lot.consumed += used;
      if (lot.expiresAt && lot.expiresAt <= this.time())
        lot.expired += released;
      else lot.available += released;
      await this.saveLot(db, lot);
      left -= used;
      split.push({
        lotId: lot.id,
        held: points(held),
        charged: points(used),
        released: points(released),
        returnedTo:
          lot.expiresAt && lot.expiresAt <= this.time()
            ? "expired"
            : "available",
      });
    }
    if (left) throw new AiError(503, "预占分配不足，结算已回滚");
    u.status = !success ? "released" : u.mode === "paid" ? "settled" : "waived";
    u.due = due;
    u.charged = charged;
    u.waived = waived;
    u.allocations = split;
    u.chargeCapped = capped;
    u.usageMissing = due === null;
    if (releaseReason) u.releaseReason = releaseReason;
    // Failed calls still consume the anti-abuse budget, despite refunding user credit.
    u.budgetUsed = success && due !== null ? (due > max ? max : due) : max;
    await this.saveUnit(db, u);
    await this.event(
      db,
      run.id + ":settle",
      run.userId,
      run.id,
      success ? (u.mode === "paid" ? "settle" : "waive") : "release",
      -charged,
      success ? "AI 调用结算" : releaseReason || "调用未成功，释放预占",
      {
        duePoints: due === null ? null : points(due),
        waivedPoints: points(waived),
        allocations: split,
        mode: u.mode,
      },
    );
    return this.runFields(u);
  }
  runFields(u) {
    return {
      billingVersion: 2,
      billingMode: u.mode,
      billingStatus: u.status,
      reservedPoints:
        u.mode === "paid" && ["reserved", "pending"].includes(u.status)
          ? points(u.quoted)
          : "0",
      quotedPoints: points(u.quoted),
      chargedPoints: u.charged == null ? null : points(u.charged),
      duePoints: u.due == null ? null : points(u.due),
      waivedPoints: u.waived == null ? null : points(u.waived),
      tariffVersion: u.tariffVersion,
      chargeCapped: !!u.chargeCapped,
    };
  }
  async reverse(actor, id, note, operationId) {
    return this.repo.transaction(async (db) => {
      const prior = await db.get(
        "SELECT * FROM ai_credit_events WHERE id=?",
        operationId,
      );
      if (prior) {
        const p = JSON.parse(prior.data);
        if (p.actorId !== actor || p.runId !== id || prior.note !== note)
          throw new AiError(409, "操作标识已用于其他冲正");
        return { ok: true };
      }
      const u = await this.unit(db, id);
      if (!u || u.status !== "settled" || integer(u.charged) <= 0n)
        throw new AiError(409, "仅已扣款且未冲正的记录可冲正");
      await this.ensure(db, u.userId);
      const lots = await this.lots(db, u.userId),
        split = [];
      for (const a of u.allocations) {
        const n = micro(a.charged);
        if (!n) continue;
        const lot = lots.find((x) => x.id === a.lotId);
        lot.consumed -= n;
        const expired = lot.expiresAt && lot.expiresAt <= this.time();
        if (expired) lot.expired += n;
        else lot.available += n;
        await this.saveLot(db, lot);
        split.push({
          lotId: lot.id,
          amount: points(n),
          returnedTo: expired ? "expired" : "available",
        });
      }
      u.status = "reversed";
      u.reversal = {
        actorId: actor,
        note,
        at: this.time(),
        amount: points(u.charged),
      };
      await this.saveUnit(db, u);
      await this.event(
        db,
        operationId,
        u.userId,
        id,
        "reverse",
        integer(u.charged),
        note,
        { actorId: actor, runId: id, allocations: split },
      );
      await this.repo.audit(db, actor, "credit.reverse", {
        runId: id,
        note,
        allocations: split,
      });
      const run = await this.repo.runRaw(id, db);
      if (run) {
        run.billingStatus = "reversed";
        run.refundedPoints = points(u.charged);
        await this.repo.saveRun(db, run);
      }
      return { ok: true };
    });
  }
  async recovery() {
    return this.repo.transaction(async (db) => {
      const rows = await db.all(
        "SELECT * FROM ai_billing_units WHERE status=? OR status=?",
        "pending",
        "reserved",
      );
      for (const raw of rows) {
        const u = decode(raw);
        const run = await this.repo.runRaw(u.id, db);
        if (!run) continue;
        if (u.status === "reserved" && run.status === "pending") {
          u.status = "pending";
          await this.saveUnit(db, u);
        }
        if (
          u.expiresAt > this.time() &&
          !(run.status === "pending" && u.mode !== "paid")
        )
          continue;
        const releaseReason =
          run.status === "pending" && u.mode !== "paid"
            ? "任务恢复后释放免费或平台调用，用户未扣费"
            : "用量核对超时，释放用户预占；上游成本仍待核对";
        const fields = await this.settle(
          db,
          run,
          null,
          false,
          null,
          releaseReason,
        );
        Object.assign(run, fields, {
          status: run.result ? "succeeded" : "released",
          billingNote: releaseReason,
        });
        delete run.error;
        delete run.errorCode;
        if (run.sessionId) {
          const session = await this.repo.sessionRaw(
            run.sessionId,
            run.userId,
            db,
          );
          if (session?.activeRunId === run.id) {
            session.activeRunId = "";
            await this.repo.saveSession(db, session);
          }
        }
        await this.repo.saveRun(db, run);
      }
    });
  }
  async details(userId, page = 1, admin = false) {
    return this.repo.transaction(async (db) => {
      const account = await this.view(db, userId),
        lots = await this.lots(db, userId);
      const rows = await db.all(
        "SELECT * FROM ai_credit_events WHERE userId=? ORDER BY createdAt DESC,id DESC LIMIT 30 OFFSET " +
          (page - 1) * 30,
        userId,
      );
      const total = Number(
        (
          await db.get(
            "SELECT COUNT(*) AS n FROM ai_credit_events WHERE userId=?",
            userId,
          )
        ).n,
      );
      return {
        account,
        lots: lots.map((x) => ({
          ...x,
          data: admin
            ? JSON.parse(x.data)
            : {
                payment: JSON.parse(x.data).payment,
                product: publicProduct(JSON.parse(x.data).product),
              },
          ...Object.fromEntries(
            [
              "granted",
              "available",
              "reserved",
              "consumed",
              "expired",
              "revoked",
            ].map((k) => [k, points(x[k])]),
          ),
        })),
        rows: rows.map((r) => {
          const detail = JSON.parse(r.data);
          if (!admin) {
            delete detail.actorId;
            delete detail.fingerprint;
          }
          return { ...r, amount: points(r.amount), ...detail, data: undefined };
        }),
        total,
        page,
      };
    });
  }
  async products(admin = false) {
    return this.repo.read(async (db) => {
      const products = await db.all(
          "SELECT * FROM ai_products ORDER BY createdAt DESC",
        ),
        rows = [];
      for (const p of products) {
        if (!admin && p.status !== "published") continue;
        const published = p.publishedId
          ? await db.get(
              "SELECT * FROM ai_product_versions WHERE id=?",
              p.publishedId,
            )
          : null;
        const versions = admin
          ? await db.all(
              "SELECT id,version,createdAt FROM ai_product_versions WHERE productId=? ORDER BY version DESC",
              p.id,
            )
          : undefined;
        rows.push({
          id: p.id,
          code: p.code,
          status: p.status,
          revision: admin ? p.revision : undefined,
          draft: admin ? JSON.parse(p.data) : undefined,
          published: published
            ? {
                ...(admin
                  ? JSON.parse(published.data)
                  : publicProduct(JSON.parse(published.data))),
                versionId: published.id,
                version: published.version,
              }
            : null,
          versions,
        });
      }
      return rows.sort(
        (a, b) =>
          (a.published?.sort || a.draft?.sort || 0) -
          (b.published?.sort || b.draft?.sort || 0),
      );
    });
  }
  async saveProduct(actor, input) {
    const x = productSchema.parse(input);
    if (micro(x.credits) + micro(x.bonus) > MAX)
      throw new AiError(400, "总额度超出上限");
    return this.repo.transaction(async (db) => {
      const id = x.id || randomUUID(),
        old = await db.get("SELECT * FROM ai_products WHERE id=?", id);
      if (x.id && !old) throw new AiError(404, "资源包不存在");
      if (old && old.code !== x.code)
        throw new AiError(400, "商品编码创建后不可修改");
      if (old && old.revision !== x.revision)
        throw new AiError(409, "资源包已修改，请刷新后编辑");
      const duplicate = await db.get(
        "SELECT id FROM ai_products WHERE code=?",
        x.code,
      );
      if (duplicate && duplicate.id !== id)
        throw new AiError(409, "商品编码已存在");
      const { revision, ...data } = x;
      data.id = id;
      data.priceFen = String(micro(x.price) / 10000n);
      const next = randomUUID();
      if (old)
        await db.run(
          "UPDATE ai_products SET code=?,revision=?,data=?,updatedAt=? WHERE id=?",
          x.code,
          next,
          JSON.stringify(data),
          now(),
          id,
        );
      else
        await db.run(
          "INSERT INTO ai_products(id,code,status,revision,publishedId,data,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)",
          id,
          x.code,
          "draft",
          next,
          "",
          JSON.stringify(data),
          now(),
          now(),
        );
      await this.repo.audit(db, actor, "product.draft", { id, data });
      return { id, revision: next };
    });
  }
  async publishProduct(actor, id, revision, publish) {
    return this.repo.transaction(async (db) => {
      const p = await db.get("SELECT * FROM ai_products WHERE id=?", id);
      if (!p) throw new AiError(404, "资源包不存在");
      if (p.revision !== revision)
        throw new AiError(409, "资源包已修改，请刷新");
      let publishedId = p.publishedId;
      const warnings = [];
      if (publish) {
        const data = JSON.parse(p.data),
          id = randomUUID(),
          version =
            Number(
              (
                await db.get(
                  "SELECT COUNT(*) AS n FROM ai_product_versions WHERE productId=?",
                  p.id,
                )
              ).n,
            ) + 1;
        const total = micro(data.credits) + micro(data.bonus),
          price = BigInt(data.priceFen);
        for (const other of await db.all(
          "SELECT * FROM ai_products WHERE status=?",
          "published",
        )) {
          if (other.id === p.id || !other.publishedId) continue;
          const v = await db.get(
            "SELECT data FROM ai_product_versions WHERE id=?",
            other.publishedId,
          );
          if (!v) continue;
          const x = JSON.parse(v.data);
          if (x.validDays !== data.validDays) continue;
          const credits = micro(x.credits) + micro(x.bonus),
            cost = BigInt(x.priceFen);
          if (
            (total > credits && price * credits > cost * total) ||
            (total < credits && price * credits < cost * total)
          )
            warnings.push(
              "与“" +
                x.name +
                "”相比，单位额度价格存在倒挂，请确认是否为有意促销。",
            );
          if (
            credits < total &&
            ((total + credits - 1n) / credits) * cost < price
          )
            warnings.push(
              "重复购买“" + x.name + "”可更低价覆盖本包额度，请检查定价。",
            );
        }
        await db.run(
          "INSERT INTO ai_product_versions(id,productId,version,data,createdAt) VALUES(?,?,?,?,?)",
          id,
          p.id,
          version,
          JSON.stringify(data),
          now(),
        );
        publishedId = id;
      }
      await db.run(
        "UPDATE ai_products SET status=?,publishedId=?,revision=?,updatedAt=? WHERE id=?",
        publish ? "published" : "archived",
        publishedId,
        randomUUID(),
        now(),
        p.id,
      );
      await this.repo.audit(
        db,
        actor,
        publish ? "product.publish" : "product.archive",
        { productId: p.id, publishedId },
      );
      return { ok: true, warnings };
    });
  }
}
