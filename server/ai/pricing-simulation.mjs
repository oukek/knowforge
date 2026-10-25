import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AiError, now } from "./policy.mjs";
import {
  PRICING_SIMULATION_DEFAULTS,
  normalizePricingSimulation,
} from "../../shared/pricing-simulation.mjs";
import { effectivePolicy, ratesOf } from "./model-policy.mjs";
const key = "pricing-simulation";
// Procurement assumptions are returned only by authenticated admin endpoints,
// never embedded in the public frontend bundle or learner bootstrap.
const receipt = {
  modelName: "截图模型示例",
  inputPrice: "5",
  outputPrice: "30",
  costDiscount: "0.15",
};
const inputSchema = z
  .object({
    revision: z.string().uuid().nullable(),
    plan: z.record(z.string(), z.unknown()),
  })
  .strict();
export class PricingSimulation {
  constructor(repo, pool) {
    this.repo = repo;
    this.pool = pool;
  }
  async read() {
    return this.repo.read(async (db) => {
      const row = await db.get(
        "SELECT data,updatedAt FROM ai_config WHERE id=?",
        key,
      );
      const pool = await this.pool.raw(db);
      const live = pool?.policy || PRICING_SIMULATION_DEFAULTS;
      const liveRates = Object.fromEntries(
        ["inputRate", "cachedRate", "outputRate"].map((k) => [
          k,
          String(live[k]),
        ]),
      );
      return {
        ...(row
          ? {
              ...JSON.parse(row.data),
              plan: normalizePricingSimulation(JSON.parse(row.data).plan),
              updatedAt: row.updatedAt,
            }
          : {
              revision: null,
              updatedAt: null,
              plan: normalizePricingSimulation({
                ...PRICING_SIMULATION_DEFAULTS,
                ...receipt,
                ...liveRates,
              }),
            }),
        liveRates,
        models: (pool?.providers || []).flatMap((p) =>
          p.models.map((m) => ({
            id: m.id,
            model: m.model,
            providerName: p.name,
            kind: m.kind || "text",
            procurement: m.procurement || null,
            imageProcurement: m.imageProcurement ?? null,
            imageCredits: m.imageCredits || "1",
            rates: ratesOf(effectivePolicy(m, live)),
          })),
        ),
        examplePlan: normalizePricingSimulation({
          ...PRICING_SIMULATION_DEFAULTS,
          ...receipt,
          modelName: "截图模型 · 建议费率试算",
          inputRate: "0.125",
          outputRate: "0.75",
        }),
      };
    });
  }
  async save(actor, raw) {
    const input = inputSchema.parse(raw);
    let plan;
    try {
      plan = normalizePricingSimulation(input.plan);
    } catch (error) {
      throw new AiError(400, error.message, "PRICING_INVALID");
    }
    await this.repo.transaction(async (db) => {
      const prior = await db.get("SELECT data FROM ai_config WHERE id=?", key);
      if ((prior ? JSON.parse(prior.data).revision : null) !== input.revision)
        throw new AiError(
          409,
          "测算方案已被其他管理员修改，请重新载入后再保存",
          "PRICING_CONFLICT",
        );
      const value = { plan, revision: randomUUID() },
        stamp = now();
      if (prior)
        await db.run(
          "UPDATE ai_config SET data=?,updatedAt=? WHERE id=?",
          JSON.stringify(value),
          stamp,
          key,
        );
      else
        await db.run(
          "INSERT INTO ai_config(id,data,encryptedKey,updatedAt) VALUES(?,?,?,?)",
          key,
          JSON.stringify(value),
          "",
          stamp,
        );
      await this.repo.audit(db, actor, "pricing.simulation.save", value);
    });
    return this.read();
  }
}
