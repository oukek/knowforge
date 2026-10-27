import { AiError } from "./policy.mjs";

export const ratesOf = (policy) =>
  Object.fromEntries(
    ["inputRate", "cachedRate", "outputRate"].map((key) => [key, policy[key]]),
  );
export const schedulingKeys = [
  "maxAttempts",
  "attemptTimeoutMs",
  "totalTimeoutMs",
];
export const modelOnlyPolicy = (policy) => {
  if (!policy) return policy;
  const result = { ...policy };
  for (const key of schedulingKeys) delete result[key];
  return result;
};
export const effectivePolicy = (model, legacy) => ({
  ...legacy,
  ...(modelOnlyPolicy(model.policy) || {}),
  maxAttempts: legacy?.maxAttempts ?? 3,
  attemptTimeoutMs: legacy?.attemptTimeoutMs ?? 25000,
  totalTimeoutMs: legacy?.totalTimeoutMs ?? 80000,
});

// Persisted attempt slots enforce per-model limits across restarts. A failed
// upstream call counts; rejected requests and cached answers consume no slot.
export async function eligibleModels(db, targets, userId, questionId, feature) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const counts = await db.all(
    `SELECT modelId,COUNT(*) AS total,
    SUM(CASE WHEN userId=? THEN 1 ELSE 0 END) AS personal,
    SUM(CASE WHEN userId=? AND questionId=? AND feature=? THEN 1 ELSE 0 END) AS question
    FROM ai_model_invocations WHERE createdAt>=? GROUP BY modelId`,
    userId,
    userId,
    questionId || "",
    "grade",
    since,
  );
  return targets.filter((target) => {
    const c = counts.find((c) => c.modelId === target.id),
      p = target.policy;
    return (
      !c ||
      (Number(c.total) < p.siteDailyRuns &&
        Number(c.personal) < p.dailyRuns &&
        (feature !== "grade" || Number(c.question) < p.perQuestionRuns))
    );
  });
}
export async function claimModel(db, target, run) {
  await db.run(
    "INSERT INTO ai_model_invocations(id,modelId,runId,userId,questionId,feature,createdAt) VALUES(?,?,?,?,?,?,?)",
    run.id + ":" + target.id,
    target.id,
    run.id,
    run.userId,
    run.questionId || "",
    run.feature,
    new Date().toISOString(),
  );
}
export async function checkEligible(db, targets, userId, questionId, feature) {
  const eligible = await eligibleModels(
    db,
    targets,
    userId,
    questionId,
    feature,
  );
  if (!eligible.length)
    throw new AiError(
      429,
      "可用模型已达到近 24 小时调用限制，请稍后重试",
      "AI_MODEL_LIMIT",
    );
  return eligible;
}
