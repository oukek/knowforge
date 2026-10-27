import { randomUUID } from "node:crypto";
import { AiRepository, decodeRun } from "./repository.mjs";
import { createProvider } from "./provider.mjs";
import { AiPool } from "./pool.mjs";
import { AiRunEvents } from "./run-events.mjs";
import { invalidOutput, runFailure } from "./diagnostics.mjs";
import {
  effectivePolicy,
  ratesOf,
  checkEligible,
  claimModel,
} from "./model-policy.mjs";
import { AiBilling } from "./billing.mjs";
import { micro, points, procurementCost, usageCharge } from "./amounts.mjs";
import { ensureProfile } from "../account-profile.mjs";
import {
  AiError,
  hash,
  now,
  encrypt,
  decrypt,
  encryptionKey,
  configSchema,
  gradeSchema,
  variantsSchema,
  interviewSchema,
  testSchema,
  checkedGrade,
  taskInstructions,
} from "./policy.mjs";

const templateVersion = "knowforge-ai-1";
const finalStates = new Set(["succeeded", "failed", "released"]);
export class AiService {
  constructor(store, catalog, options = {}) {
    this.repo = new AiRepository(store);
    this.catalog = catalog;
    this.rootKey = options.encryptionKey ?? process.env.AI_ENCRYPTION_KEY;
    this.provider = options.provider || createProvider(options);
    this.pool = new AiPool(this.repo, this.provider, this.rootKey, options);
    this.billing = new AiBilling(this.repo, options);
    this.jobs = new Map();
    this.events = new AiRunEvents(options.events);
    this.ipLimits = new Map();
  }
  async init() {
    await this.pool.init();
    await this.billing.init();
    await this.repo.recoverExpired();
    await this.billing.recovery();
    this.lastRecovery = Date.now();
  }
  keyReady() {
    try {
      encryptionKey(this.rootKey);
      return true;
    } catch {
      return false;
    }
  }
  async recover() {
    if (Date.now() - this.lastRecovery < 30000) return;
    this.lastRecovery = Date.now();
    await this.repo.recoverExpired();
    await this.billing.recovery();
  }
  async question(userId, id, db = this.repo.store) {
    return (
      this.catalog.questions.find((q) => q.id === id) ||
      this.repo.generatedRaw(userId, id, db)
    );
  }
  limitIp(ip) {
    const time = Date.now();
    for (const [key, value] of this.ipLimits)
      if (value.until <= time) this.ipLimits.delete(key);
    const key = hash(ip || "");
    if (!this.ipLimits.has(key)) {
      if (this.ipLimits.size >= 10000)
        throw new AiError(429, "服务繁忙，请稍后重试");
      this.ipLimits.set(key, { until: time + 600000, count: 0 });
    }
    if (++this.ipLimits.get(key).count > 30)
      throw new AiError(429, "请求过于频繁，请稍后重试");
  }
  async status(userId) {
    await this.recover();
    return this.repo.transaction(async (db) => {
      const row = await this.pool.raw(db),
        account = await this.billing.view(db, userId),
        settings = await this.billing.settings(db);
      const configured = !!row?.providers.some(
        (p) =>
          p.enabled &&
          p.models.some((m) => m.enabled && (m.kind || "text") === "text"),
      );
      const unsettled = Number(
        (
          await db.get(
            "SELECT COUNT(*) AS n FROM ai_billing_units WHERE userId=? AND status=? AND mode=?",
            userId,
            "pending",
            "paid",
          )
        ).n,
      );
      const tariffs = (row?.providers || [])
        .filter((p) => p.enabled)
        .flatMap((p) =>
          p.models
            .filter((m) => m.enabled && (m.kind || "text") === "text")
            .map((m) => ({
              targetId: m.id,
              model: m.model,
              ...ratesOf(effectivePolicy(m, row.policy)),
            })),
        );
      const same = tariffs.every(
        (t) => hash(ratesOf(t)) === hash(ratesOf(tariffs[0])),
      );
      return {
        configured,
        available:
          configured &&
          this.keyReady() &&
          !account.blocked &&
          !(unsettled && !account.exempt),
        reason: account.blocked
          ? "管理员已暂停该账号的 AI 使用"
          : unsettled && !account.exempt
            ? "存在额度待核对的调用，请联系管理员处理"
            : configured && !this.keyReady()
              ? "服务端加密配置不可用，请联系管理员"
              : "",
        account,
        tariffs,
        tariff:
          same && tariffs.length
            ? { ...ratesOf(tariffs[0]), version: hash(ratesOf(tariffs[0])) }
            : null,
        budgets: {
          maxTaskPoints: settings.maxTaskPoints,
          dailyBudget: account.policy.dailyBudget || settings.dailyBudget,
          pendingHours: settings.pendingHours,
        },
        answerLimit: 3000,
      };
    });
  }
  async adminConfig() {
    return this.repo.read(async (db) => {
      const row = await this.repo.configRaw(db);
      return {
        config: row
          ? { ...JSON.parse(row.data), hasKey: true, updatedAt: row.updatedAt }
          : null,
        encryptionReady: this.keyReady(),
      };
    });
  }
  async saveConfig(actorId, input) {
    const parsed = configSchema.parse(input);
    if (parsed.apiKey && /[\r\n]/.test(parsed.apiKey))
      throw new AiError(400, "Key 不能包含换行");
    await this.provider.validate(parsed.baseUrl);
    return this.repo.transaction(async (db) => {
      const pool = await this.pool.raw(db);
      if (
        pool?.providers.length > 1 ||
        pool?.providers.some((p) => p.models.some((m) => m.policy))
      )
        throw new AiError(
          409,
          "请使用多服务商配置页面保存，旧版接口不能覆盖服务池",
        );
      const old = await this.repo.configRaw(db),
        { apiKey, ...settings } = parsed;
      if (!apiKey && !old) throw new AiError(400, "首次配置需要填写 API Key");
      const encryptedKey = apiKey
        ? encrypt(apiKey, this.rootKey)
        : old.encryptedKey;
      // Verify the master key even when preserving an existing credential.
      decrypt(encryptedKey, this.rootKey);
      const stamp = now(),
        data = JSON.stringify({ ...settings, revision: randomUUID() });
      if (old)
        await db.run(
          "UPDATE ai_config SET data=?,encryptedKey=?,updatedAt=? WHERE id=?",
          data,
          encryptedKey,
          stamp,
          "main",
        );
      else
        await db.run(
          "INSERT INTO ai_config(id,data,encryptedKey,updatedAt) VALUES(?,?,?,?)",
          "main",
          data,
          encryptedKey,
          stamp,
        );
      await this.repo.audit(db, actorId, "ai.config.save", {
        ...settings,
        credentialChanged: !!apiKey,
      });
      await this.pool.importLegacy(db, JSON.parse(data), encryptedKey);
      return { ...JSON.parse(data), hasKey: true, updatedAt: stamp };
    });
  }
  async models(actorId, providerId) {
    const { row, config } = await this.repo.read(async (db) => {
      const pool = await this.pool.raw(db);
      const p = providerId
        ? pool?.providers.find((x) => x.id === providerId)
        : pool?.providers[0];
      if (!p) throw new AiError(409, "请先保存服务商配置");
      return {
        row: await db.get(
          "SELECT * FROM ai_config WHERE id=?",
          "provider:" + p.id,
        ),
        config: {
          name: p.name,
          providerId: p.id,
          baseUrl: p.baseUrl,
          protocol: p.protocol,
        },
      };
    });
    if (!row) throw new AiError(409, "请先保存服务商配置");
    const id = randomUUID(),
      stamp = now();
    const run = {
      id,
      userId: actorId,
      requestKey: randomUUID(),
      fingerprint: id,
      feature: "models",
      status: "running",
      createdAt: stamp,
      reservedPoints: 0,
      messages: [],
      config,
      templateVersion,
    };
    await this.repo.transaction((db) => this.repo.insertRun(db, run));
    try {
      const models = await this.provider.models(
        config,
        decrypt(row.encryptedKey, this.rootKey),
      );
      run.status = "succeeded";
      run.result = { models };
      run.usage = { input: 0, output: 0, total: 0, cached: 0, reasoning: 0 };
      run.chargedPoints = 0;
      return { models };
    } catch (e) {
      run.status = "failed";
      run.providerError = e.providerDetail || "";
      run.error = e instanceof AiError ? e.message : "模型列表读取失败";
      throw e;
    } finally {
      await this.repo.transaction((db) => this.repo.saveRun(db, run));
    }
  }
  async prepare(userId, feature, input) {
    if (feature === "test" && input.testFeature === "variants") {
      const lesson = this.catalog.lessons.find(
        (value) => value.sections?.length,
      );
      if (!lesson) throw new AiError(409, "没有可用于出题测试的知识点");
      return this.prepare(userId, "variants", {
        lessonId: lesson.id,
        count: 1,
        difficulty: "进阶",
        direction: "改变约束",
      });
    }
    return this.repo.read(async (db) => {
      if (feature === "test")
        return {
          context: { task: "connection-test" },
          messages: [
            { role: "system", content: '只返回 JSON 对象 {"ok":true}。' },
          ],
          schema: testSchema,
        };
      const question = input.questionId
        ? await this.question(userId, input.questionId, db)
        : null;
      if (input.questionId && !question)
        throw new AiError(404, "关联题目不存在");
      const lesson = this.catalog.lessons.find(
        (l) => l.id === (question?.lessonId || input.lessonId),
      );
      if (!lesson) throw new AiError(404, "关联知识点不存在");
      if (
        feature === "grade" &&
        (!question || ["choice", "coding"].includes(question.type))
      )
        throw new AiError(400, "请选择原理或场景主观题");
      let session = null;
      if (feature === "interview") {
        session = await this.repo.sessionRaw(input.sessionId, userId, db);
        if (!session || session.status !== "active")
          throw new AiError(409, "面试不存在或已经结束");
        if (session.turns.length !== input.turn)
          throw new AiError(409, "面试轮次已变化，请刷新后重试");
        const current = this.catalog.questions.find(
          (q) => q.id === session.questionIds[session.position],
        );
        if (
          !current ||
          current.lessonId !== lesson.id ||
          current.id !== input.questionId
        )
          throw new AiError(409, "请回答当前面试问题");
      }
      const context = {
        lessonId: lesson.id,
        questionId: question?.id || "",
        title: lesson.title,
        question: question
          ? {
              id: question.id,
              prompt: question.prompt,
              answer: question.answer.slice(0, 4500),
              rubric: question.rubric,
            }
          : null,
        material: lesson.sections
          .slice(0, 3)
          .map((s) => ({ title: s.title, content: s.content.slice(0, 550) })),
      };
      if (feature === "variants") {
        context.previousPrompts = (
          await db.all(
            "SELECT data FROM ai_questions WHERE userId=? AND lessonId=? ORDER BY createdAt DESC LIMIT 3",
            userId,
            lesson.id,
          )
        ).map((row) => JSON.parse(row.data).prompt);
      }
      const schema =
        feature === "variants"
          ? variantsSchema.extend({
              questions: variantsSchema.shape.questions.length(input.count),
            })
          : feature === "interview"
            ? interviewSchema
            : gradeSchema;
      let task =
        feature === "variants"
          ? "围绕关联考点生成 " +
            input.count +
            " 道全新场景迁移题。方向：" +
            input.direction +
            "；难度：" +
            input.difficulty +
            "。改变约束或失败情景，不仅换变量名；题目答案自洽，不冒充公司原题。"
          : "按正确性、要点覆盖、原理解释、边界分析、表达五项分别打 0–100 分。五个维度各出现一次。参考答案是依据，不要求字面一致。";
      if (feature === "variants")
        task += "不得复用上下文 previousPrompts 中已经生成的题目。";
      if (session)
        task +=
          "评阅当前面试回答，并选择 followup 或 advance。难度：" +
          session.difficulty +
          "。最多追问一次，追问必须围绕当前考点，不回答无关需求。";
      const messages = [
        {
          role: "system",
          content:
            taskInstructions +
            "\n" +
            task +
            "\n输出 JSON Schema：" +
            JSON.stringify((await import("zod")).z.toJSONSchema(schema)),
        },
        {
          role: "user",
          content: JSON.stringify({
            trustedQuestionContext: context,
            currentPrompt:
              session?.currentPrompt || question?.prompt || lesson.title,
            priorAnswer: session?.turns.at(-1)?.answer?.slice(0, 500) || "",
            candidateAnswer: input.answer || "",
          }),
        },
      ];
      return { context, messages, schema, session };
    });
  }
  async start(user, feature, input, ip) {
    this.limitIp(ip);
    const repeated = await this.repo.read(async (db) =>
      decodeRun(
        await db.get(
          "SELECT * FROM ai_runs WHERE userId=? AND requestKey=?",
          user.id,
          input.requestId,
        ),
      ),
    );
    if (repeated) {
      const identity = (data) =>
        feature === "interview"
          ? { sessionId: data.sessionId, answer: data.answer, turn: data.turn }
          : data;
      if (
        repeated.feature !== feature ||
        hash(identity(repeated.input)) !== hash(identity(input))
      )
        throw new AiError(409, "请求标识已用于不同内容");
      return { run: await this.publicRun(repeated, user.id), reused: true };
    }
    const prepared = await this.prepare(user.id, feature, input);
    let acquired;
    const operation = await this.repo
      .transaction(async (db) => {
        const snapshot = await this.pool.snapshot(db, feature, input.targetId);
        let { targets, ...policy } = snapshot;
        const config = { ...policy, model: "自动调度" };
        const fingerprint = hash({
          feature,
          input: { ...input, requestId: undefined },
          context: prepared.context,
          revision: config.revision,
          templateVersion,
        });
        const priorKey = decodeRun(
          await db.get(
            "SELECT * FROM ai_runs WHERE userId=? AND requestKey=?",
            user.id,
            input.requestId,
          ),
        );
        if (priorKey) {
          if (priorKey.fingerprint !== fingerprint)
            throw new AiError(409, "请求标识已用于不同内容");
          return { run: priorKey, reused: true };
        }
        const cached = decodeRun(
          await db.get(
            "SELECT * FROM ai_runs WHERE userId=? AND fingerprint=? ORDER BY createdAt DESC LIMIT 1",
            user.id,
            fingerprint,
          ),
        );
        if (
          feature === "grade" &&
          cached &&
          ["succeeded", "running", "pending"].includes(cached.status)
        )
          return { run: cached, reused: true };
        const account = await this.billing.view(db, user.id);
        if (account.blocked) throw new AiError(403, "该账号的 AI 使用已暂停");
        const active = await db.get(
          "SELECT COUNT(*) AS n FROM ai_runs WHERE userId=? AND (status=? OR status=?) AND feature<>?",
          user.id,
          "running",
          "pending",
          "models",
        );
        const siteActive = await db.get(
          "SELECT COUNT(*) AS n FROM ai_runs WHERE status=? AND feature<>?",
          "running",
          "models",
        );
        const outstanding = Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM ai_billing_units WHERE userId=? AND status=? AND mode=?",
              user.id,
              "pending",
              "paid",
            )
          ).n,
        );
        if (outstanding && !account.exempt)
          throw new AiError(409, "已有额度待核对的任务，请先联系管理员处理");
        if (Number(active.n))
          throw new AiError(
            409,
            "已有 AI 任务正在处理或等待用量核对，请先查看历史",
          );
        if (Number(siteActive.n) >= 3)
          throw new AiError(429, "AI 服务繁忙，请稍后重试");
        targets = await checkEligible(
          db,
          targets,
          user.id,
          input.questionId,
          feature,
        );
        let session = null;
        if (feature === "interview") {
          session = await this.repo.sessionRaw(input.sessionId, user.id, db);
          if (
            !session ||
            session.status !== "active" ||
            session.activeRunId ||
            session.turns.length !== input.turn
          )
            throw new AiError(409, "面试状态已变化，请刷新");
        }
        acquired = this.pool.acquire(targets);
        Object.assign(config, acquired.target.policy, {
          tariffCandidates: targets.map((t) => ({
            targetId: t.id,
            model: t.model,
            ...ratesOf(t.policy),
            outputLimit: t.policy.outputLimit,
          })),
        });
        const id = randomUUID(),
          stamp = now();
        const run = {
          id,
          userId: user.id,
          requestKey: input.requestId,
          fingerprint,
          feature,
          status: "running",
          progress: { phase: "preparing", attempt: 0, updatedAt: stamp },
          sessionId: input.sessionId || "",
          lessonId: prepared.context.lessonId || "",
          questionId: input.questionId || "",
          createdAt: stamp,
          input,
          context: prepared.context,
          messages: prepared.messages,
          config,
          templateVersion,
          chargedPoints: null,
          usage: null,
          attempts: [],
        };
        await claimModel(db, acquired.target, run);
        Object.assign(
          run,
          await this.billing.reserve(db, run, config, prepared.messages),
        );
        await this.repo.insertRun(db, run);
        if (session) {
          session.activeRunId = id;
          await this.repo.saveSession(db, session);
        }
        return { run, config, targets, lease: acquired, reused: false };
      })
      .catch((e) => {
        acquired?.release();
        throw e;
      });
    if (!operation.reused) {
      const controller = new AbortController();
      const job = { controller };
      this.jobs.set(operation.run.id, job);
      job.promise = this.execute(operation, prepared.schema, controller.signal)
        .catch((e) =>
          console.error(
            "AI task persistence error:",
            operation.run.id,
            e.code || e.name,
          ),
        )
        .finally(() => this.jobs.delete(operation.run.id));
    }
    return {
      run: await this.publicRun(operation.run, user.id),
      reused: operation.reused,
    };
  }
  async execute(operation, schema, signal) {
    let response = null,
      result = null,
      error = null;
    const attempts = [],
      excluded = new Set();
    const started = Date.now();
    const limit =
      operation.run.feature === "test" ? 1 : operation.config.maxAttempts;
    let lease = operation.lease;
    try {
      for (let index = 0; index < limit; index++) {
        if (signal.aborted) {
          lease?.release();
          lease = null;
          error = {
            message: "任务已取消",
            code: "AI_CANCELLED",
            noCharge: attempts.every((a) => a.noCharge),
          };
          break;
        }
        const remaining =
          operation.config.totalTimeoutMs - (Date.now() - started);
        if (remaining <= 0) break;
        if (!lease) {
          let candidateLease;
          try {
            lease = await this.repo.transaction(async (db) => {
              const targets = await checkEligible(
                db,
                operation.targets.filter((t) => !excluded.has(t.id)),
                operation.run.userId,
                operation.run.questionId,
                operation.run.feature,
              );
              const next = this.pool.acquire(targets, excluded);
              candidateLease = next;
              try {
                await claimModel(db, next.target, operation.run);
                return next;
              } catch (e) {
                next.release();
                throw e;
              }
            });
          } catch {
            candidateLease?.release();
            break;
          }
        }
        const target = lease.target;
        excluded.add(target.id);
        const { encryptedKey, features, ...settings } = target;
        const config = {
          ...operation.config,
          ...target.policy,
          ...settings,
          outputLimit: target.policy.outputLimit,
          timeoutMs: Math.min(operation.config.attemptTimeoutMs, remaining),
        };
        const attempt = {
          id: randomUUID(),
          number: index + 1,
          providerId: target.providerId,
          providerName: target.providerName,
          targetId: target.id,
          model: target.model,
          startedAt: now(),
          status: "running",
          config,
        };
        attempts.push(attempt);
        // Persist an intent before sending. A process crash must not erase a possibly paid call.
        await this.saveAttempts(operation.run.id, attempts);
        response = null;
        result = null;
        let sent = false,
          failure = null;
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) controller.abort();
        config.timeoutMs = Math.max(
          1,
          Math.min(
            config.timeoutMs,
            operation.config.totalTimeoutMs - (Date.now() - started),
          ),
        );
        const timer = setTimeout(abort, config.timeoutMs);
        try {
          response = await this.provider.generate(
            config,
            decrypt(encryptedKey, this.rootKey),
            operation.run.messages,
            schema,
            controller.signal,
            () => {
              sent = true;
            },
          );
          // A transient progress-write failure must not retry a successful paid request.
          await this.updateProgress(
            operation.run.id,
            "validating",
            attempt.number,
          ).catch(() => {});
          if (response.refusal || response.finishReason === "content_filter")
            throw new AiError(
              502,
              "模型拒绝了本次评阅，未记录答题成绩",
              "AI_REFUSAL",
            );
          if (!response.complete) {
            if (["length", "max_output_tokens"].includes(response.finishReason))
              throw new AiError(
                502,
                "模型输出达到上限，结果被截断",
                "AI_OUTPUT_TRUNCATED",
              );
            throw invalidOutput("模型未返回完整结果", "empty");
          }
          if (!response.text || response.text.length > 100000)
            throw invalidOutput("模型未返回有效长度的结果", "empty");
          let json;
          try {
            json = JSON.parse(
              response.text.replace(
                /^\x60{3}(?:json)?\s*([\s\S]*?)\s*\x60{3}$/,
                "$1",
              ),
            );
          } catch {
            throw invalidOutput("模型返回的内容不是有效 JSON", "json");
          }
          const isVariants =
            operation.run.feature === "variants" ||
            (operation.run.feature === "test" &&
              operation.run.input.testFeature === "variants");
          const expectedCount =
            operation.run.feature === "test" ? 1 : operation.run.input.count;
          if (
            isVariants &&
            Array.isArray(json?.questions) &&
            json.questions.length !== expectedCount
          )
            throw invalidOutput("模型返回的题目数量与请求不一致", "count");
          const checked = schema.safeParse(json);
          if (!checked.success)
            throw invalidOutput(
              "模型返回内容未通过字段校验",
              "schema",
              checked.error.issues,
            );
          const parsed = checked.data;
          if (operation.run.feature === "grade")
            result = checkedGrade(parsed, operation.run.input.answer);
          else if (operation.run.feature === "interview")
            result = {
              ...parsed,
              evaluation: checkedGrade(
                parsed.evaluation,
                operation.run.input.answer,
              ),
            };
          else if (
            operation.run.feature === "variants" ||
            (operation.run.feature === "test" &&
              operation.run.input.testFeature === "variants")
          ) {
            const normalized = (s) =>
              s.replace(/[\s\p{P}]/gu, "").toLowerCase();
            const seen = new Set([
              ...this.catalog.questions.map((q) => normalized(q.prompt)),
              ...(operation.run.context.previousPrompts || []).map(normalized),
            ]);
            if (
              parsed.questions.length !==
              (operation.run.feature === "test" ? 1 : operation.run.input.count)
            )
              throw invalidOutput("模型返回的题目数量与请求不一致", "count");
            for (const q of parsed.questions) {
              const key = normalized(q.prompt);
              if (seen.has(key))
                throw invalidOutput("模型生成了重复题目", "duplicate");
              seen.add(key);
            }
            result = parsed;
          } else result = parsed;

          attempt.status = "succeeded";
          error = null;
        } catch (e) {
          const timedOut = !signal.aborted && controller.signal.aborted;
          failure =
            e instanceof AiError
              ? e
              : new AiError(
                  502,
                  "模型结果未通过格式或内容校验，未记录为答题成绩",
                  "AI_INVALID_OUTPUT",
                );
          if (signal.aborted)
            failure = new AiError(499, "任务已取消", "AI_CANCELLED");
          else if (timedOut)
            failure = new AiError(504, "服务商响应超时", "AI_TIMEOUT");
          error = {
            message: failure.message,
            code: failure.code,
            noCharge: e.noCharge || !(sent || e.sent),
            providerDetail: e.providerDetail || "",
          };
          attempt.status = "failed";
          attempt.error = error.message;
          attempt.errorCode = error.code;
          attempt.providerError = error.providerDetail;
          attempt.outputIssue = failure.outputIssue || "";
          attempt.validationIssues = failure.validationIssues || [];
          attempt.upstreamStatus = e.upstreamStatus || null;
          attempt.upstreamCode = e.upstreamCode || "";
          attempt.retryAfterMs = e.retryAfterMs || 0;
          attempt.noCharge = !!error.noCharge;
          attempt.requestId = e.requestId || "";
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          attempt.endedAt = now();
          attempt.durationMs =
            Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt);
          attempt.usage = response?.usage || null;
          attempt.requestId = response?.requestId || attempt.requestId || "";
          attempt.actualModel = response?.actualModel || target.model;
          attempt.responseText = response?.text || response?.refusal || "";
          attempt.finishReason = response?.finishReason || "";
          attempt.outputLimit = config.outputLimit;
          attempt.networkCode = failure?.networkCode || "";
          attempt.usageUnknown = !attempt.usage && !attempt.noCharge;
          attempt.estimatedPoints = attempt.usage
            ? points(usageCharge(attempt.usage, config))
            : null;
          attempt.estimatedCostCny = procurementCost(
            attempt.usage,
            target.procurement,
          );
          attempt.costBasis = target.procurement || null;
          await this.saveAttempts(operation.run.id, attempts);
          try {
            await this.pool.outcome(target, failure, lease.observed);
          } finally {
            lease.release();
            lease = null;
          }
        }
        if (result || signal.aborted || error?.code === "AI_REFUSAL") break;
      }
    } finally {
      lease?.release();
    }
    // A failed fallback cannot turn an earlier ambiguous paid request into a free call.
    if (error && attempts.some((a) => a.usageUnknown)) {
      error.noCharge = false;
      response = null;
    }
    if (
      error &&
      !attempts.some((a) => a.usageUnknown) &&
      attempts.some((a) => a.usage)
    ) {
      const known = attempts.filter((a) => a.usage).map((a) => a.usage);
      response = {
        ...response,
        usage: Object.fromEntries(
          ["input", "output", "cached", "reasoning", "total"].map((key) => [
            key,
            known.reduce((n, u) => n + u[key], 0),
          ]),
        ),
      };
    }
    // Only retry DB persistence; upstream retries are bounded, distinct-target attempts above.
    for (let retry = 0; retry < 3; retry++) {
      try {
        await this.finish(operation.run.id, response, result, error);
        return;
      } catch (failure) {
        if (retry === 2) throw failure;
        await new Promise((resolve) => setTimeout(resolve, 200 * (retry + 1)));
      }
    }
  }
  async saveAttempts(id, attempts) {
    await this.repo.transaction(async (db) => {
      const run = await this.repo.runRaw(id, db);
      if (!run || finalStates.has(run.status))
        throw new AiError(409, "任务已结束");
      run.attempts = structuredClone(attempts);
      run.failoverCount = Math.max(0, attempts.length - 1);
      run.upstreamCostPending = attempts.some(
        (a) => a.usageUnknown || a.status === "running",
      );
      run.upstreamUsage = Object.fromEntries(
        ["input", "output", "cached", "reasoning", "total"].map((key) => [
          key,
          attempts.reduce((n, a) => n + (a.usage?.[key] || 0), 0),
        ]),
      );
      run.estimatedCostCny = points(
        attempts.reduce(
          (n, a) =>
            n + (a.estimatedCostCny == null ? 0n : micro(a.estimatedCostCny)),
          0n,
        ),
      );
      run.costIncomplete = attempts.some((a) => a.estimatedCostCny == null);
      const last = attempts.at(-1);
      if (run.progress?.phase !== "cancelling")
        run.progress = {
          phase:
            last.status === "running"
              ? "requesting"
              : last.status === "succeeded"
                ? "saving"
                : ["AI_CANCELLED", "AI_REFUSAL"].includes(last.errorCode) ||
                    attempts.length >=
                      (run.feature === "test" ? 1 : run.config.maxAttempts)
                  ? "saving"
                  : "retrying",
          attempt: attempts.length,
          updatedAt: now(),
        };
      await this.repo.saveRun(db, run);
    });
    this.events.notify(id);
  }
  async updateProgress(id, phase, attempt) {
    await this.repo.transaction(async (db) => {
      const run = await this.repo.runRaw(id, db);
      if (
        !run ||
        run.status !== "running" ||
        run.progress?.phase === "cancelling"
      )
        return;
      run.progress = {
        phase,
        attempt: attempt ?? run.progress?.attempt ?? 0,
        updatedAt: now(),
      };
      await this.repo.saveRun(db, run);
    });
    this.events.notify(id);
  }
  async finish(id, response, result, error) {
    await this.repo.transaction(async (db) => {
      const run = await this.repo.runRaw(id, db);
      if (!run || finalStates.has(run.status)) return;

      run.responseText = response?.text || response?.refusal || "";
      run.upstreamRequestId = String(response?.requestId || "").slice(0, 191);
      run.actualModel = response?.actualModel || run.config.model;
      if (run.attempts?.length) {
        // Keep the initial task policy intact. Each attempt stores its own
        // model configuration; actualRates records the settled model tariff.
        run.actualModel =
          response?.actualModel || run.attempts.at(-1).actualModel;
      }
      run.usage = response?.usage || null;
      run.endedAt = now();
      run.durationMs = Date.parse(run.endedAt) - Date.parse(run.createdAt);
      run.result = result;
      if (error) {
        run.error = error.message;
        run.errorCode = error.code;
        run.providerError = error.providerDetail || "";
      }
      Object.assign(
        run,
        await this.billing.settle(db, run, response?.usage || null, !!result),
      );
      run.status = result ? "succeeded" : "released";
      run.progress = {
        phase: run.status,
        attempt: run.attempts?.length || 0,
        updatedAt: now(),
      };
      if (run.billingStatus === "pending")
        run.billingNote = "服务商未提供有效用量，额度预占待管理员核对";
      await this.recordGrade(db, run);
      if (result && run.feature === "variants") {
        const lesson = this.catalog.lessons.find((l) => l.id === run.lessonId);
        run.result.questions = result.questions.map((q) => ({
          ...q,
          id: "ai-" + randomUUID(),
          lessonId: lesson.id,
          moduleId: lesson.moduleId,
          type: "scenario",
          pool: "transfer",
          priority: "P1",
          difficulty: run.input.difficulty,
          provenance: "ai-generated",
          parentQuestionId: run.questionId,
          aiRunId: run.id,
          createdAt: run.endedAt,
        }));
        for (const q of run.result.questions)
          await db.run(
            "INSERT INTO ai_questions(id,userId,lessonId,parentQuestionId,runId,data,createdAt) VALUES(?,?,?,?,?,?,?)",
            q.id,
            run.userId,
            q.lessonId,
            q.parentQuestionId,
            run.id,
            JSON.stringify(q),
            run.endedAt,
          );
      }
      if (run.sessionId) {
        const session = await this.repo.sessionRaw(
          run.sessionId,
          run.userId,
          db,
        );
        if (session?.activeRunId === id) {
          session.activeRunId = "";
          if (result) {
            session.turns.push({
              runId: id,
              questionId: run.questionId,
              lessonId: run.lessonId,
              prompt: session.currentPrompt,
              answer: run.input.answer,
              evaluation: result.evaluation,
              createdAt: run.endedAt,
            });
            if (
              result.action === "followup" &&
              result.followUp.trim() &&
              session.followups < 1
            ) {
              session.currentPrompt = result.followUp;
              session.followups++;
            } else {
              session.position++;
              session.followups = 0;
              if (session.position >= session.questionIds.length) {
                session.status = "completed";
                session.endedAt = now();
              } else
                session.currentPrompt = this.catalog.questions.find(
                  (q) => q.id === session.questionIds[session.position],
                ).prompt;
            }
          }
          await this.repo.saveSession(db, session);
        }
      }
      await this.repo.saveRun(db, run);
    });
    this.events.notify(id);
  }
  async publicRun(run, userId, admin = false) {
    if (!run || (!admin && run.userId !== userId))
      throw new AiError(404, "AI 记录不存在");
    if (admin)
      return {
        ...run,
        failure: runFailure(run),
        testFeature:
          run.feature === "test"
            ? run.input?.testFeature || "connection"
            : undefined,
        data: undefined,
      };
    const value = {
      id: run.id,
      feature: run.feature,
      status: run.status,
      progress: run.progress || null,
      lessonId: run.lessonId,
      questionId: run.questionId,
      sessionId: run.sessionId,
      createdAt: run.createdAt,
      endedAt: run.endedAt,
      title: run.context?.title || "",
      answer: run.input?.answer || "",
      result: run.result,
      usage: run.usage ? { ...run.usage, raw: undefined } : null,
      reservedPoints: run.reservedPoints,
      chargedPoints: run.chargedPoints,
      model: run.actualModel || run.config?.model,
      durationMs: run.durationMs,
      error: run.error,
      errorCode: run.errorCode,
      failure: runFailure(run),
      testFeature:
        run.feature === "test"
          ? run.input?.testFeature || "connection"
          : undefined,
      attemptId: run.attemptId,
      failoverCount: run.failoverCount || 0,
      billingMode: run.billingMode,
      billingStatus: run.billingStatus,
      quotedPoints: run.quotedPoints,
      duePoints: run.duePoints,
      waivedPoints: run.waivedPoints,
      refundedPoints: run.refundedPoints,
      billingNote: run.billingNote,
      chargeCapped: !!run.chargeCapped,
      actualRates: run.actualRates || null,
    };
    if (run.sessionId) {
      const session = await this.repo.read((db) =>
        this.repo.sessionRaw(run.sessionId, run.userId, db),
      );
      if (session?.mode === "interview" && session.status === "active")
        value.result = null;
    }
    return value;
  }
  async recordGrade(db, run) {
    if (
      run.feature !== "grade" ||
      run.status !== "succeeded" ||
      !run.result ||
      run.attemptId
    )
      return;
    const personal = db.forUser(run.userId),
      result = run.result;
    const stamp = run.endedAt || now();
    const inserted = await personal.run(
      "INSERT INTO attempts(questionId,kind,answer,score,passed,createdAt) VALUES(?,?,?,?,?,?)",
      run.questionId,
      "ai",
      JSON.stringify(run.input.answer),
      result.score,
      result.score >= 70 ? 1 : 0,
      stamp,
    );
    run.attemptId = Number(inserted.insertId ?? inserted.lastInsertRowid);
    await personal.schedule(
      run.questionId,
      result.score >= 85
        ? 3
        : result.score >= 70
          ? 2
          : result.score >= 40
            ? 1
            : 0,
      result.score < 70,
      stamp,
    );
    await personal.touch(stamp);
  }
  async getRun(userId, id, admin = false) {
    await this.recover();
    return this.publicRun(
      await this.repo.read((db) => this.repo.runRaw(id, db)),
      userId,
      admin,
    );
  }
  async history(userId, filters = {}, admin = false) {
    return this.repo.read(async (db) => {
      const parts = [],
        args = [];
      for (const [column, value] of [
        ["userId", admin ? filters.userId : userId],
        ["feature", filters.feature],
        ["questionId", filters.questionId],
        ["lessonId", filters.lessonId],
        ["status", filters.status],
      ])
        if (value) {
          if (column === "status" && value === "pending") {
            parts.push(
              "id IN (SELECT id FROM ai_billing_units WHERE status='pending')",
            );
            continue;
          }
          parts.push(column + "=?");
          args.push(value);
        }
      const where = parts.length ? " WHERE " + parts.join(" AND ") : "";
      const page = filters.page || 1;
      const rows = await db.all(
        "SELECT * FROM ai_runs" +
          where +
          " ORDER BY createdAt DESC,id DESC LIMIT 30 OFFSET " +
          (page - 1) * 30,
        ...args,
      );
      const total = Number(
        (await db.get("SELECT COUNT(*) AS n FROM ai_runs" + where, ...args)).n,
      );
      return {
        total,
        page,
        rows: rows.map((row) => {
          const run = decodeRun(row);
          return {
            id: run.id,
            userId: run.userId,
            feature: run.feature,
            status: run.status,
            lessonId: run.lessonId,
            questionId: run.questionId,
            sessionId: run.sessionId,
            title: run.context?.title || "服务配置",
            createdAt: run.createdAt,
            usage: run.usage ? { ...run.usage, raw: undefined } : null,
            chargedPoints: run.chargedPoints,
            reservedPoints: run.reservedPoints,
            model: run.actualModel || run.config?.model,
            durationMs: run.durationMs,
            failoverCount: run.failoverCount || 0,
            billingMode: run.billingMode,
            billingStatus: run.billingStatus,
            quotedPoints: run.quotedPoints,
            duePoints: run.duePoints,
            waivedPoints: run.waivedPoints,
            refundedPoints: run.refundedPoints,
            billingNote: run.billingNote,
            ...(admin
              ? { upstreamCostPending: run.upstreamCostPending || false }
              : {}),
          };
        }),
      };
    });
  }
  async cancel(userId, id) {
    const run = await this.repo.read((db) => this.repo.runRaw(id, db));
    if (!run || run.userId !== userId) throw new AiError(404, "AI 记录不存在");
    if (run.status !== "running")
      throw new AiError(409, "该任务已结束或等待核对");
    const job = this.jobs.get(id);
    if (!job)
      throw new AiError(409, "任务正在其他进程处理或恢复中，请稍后刷新");
    job.controller.abort();
    await this.updateProgress(id, "cancelling");
    return { ok: true };
  }
  async reviewCosts(actorId, id, note, costCny) {
    return this.repo.transaction(async (db) => {
      const run = await this.repo.runRaw(id, db);
      if (!run) throw new AiError(404, "AI 记录不存在");
      if (
        run.status === "running" ||
        run.upstreamCostReview ||
        !run.attempts?.length
      )
        throw new AiError(409, "没有待核对的上游成本");
      run.upstreamCostPending = false;
      run.upstreamCostReview = {
        actorId,
        note,
        createdAt: now(),
        actualCostCny: costCny === undefined ? null : points(micro(costCny)),
      };
      await this.repo.saveRun(db, run);
      await this.repo.audit(db, actorId, "ai.upstream.cost.review", {
        runId: id,
        note,
      });
      return { ok: true };
    });
  }
  async reconcile(actorId, id, value, note) {
    await this.billing.recovery();
    return this.repo.transaction(async (db) => {
      const run = await this.repo.runRaw(id, db);
      if (!run) throw new AiError(404, "调用记录不存在");
      await this.billing.ensure(db, run.userId);
      const unit = await this.billing.unit(db, id);
      if (!unit || unit.status !== "pending")
        throw new AiError(409, "仅额度待核对记录可人工结算");
      if (micro(value) > BigInt(unit.quoted))
        throw new AiError(400, "结算不能超过预占额度");
      if (!run.result && micro(value) > 0n)
        throw new AiError(400, "未交付有效结果的调用不能向用户扣费");
      Object.assign(
        run,
        await this.billing.settle(db, run, null, !!run.result, value),
      );
      run.status = run.result ? "succeeded" : "released";
      run.reconciliation = {
        actorId,
        points: String(value),
        note,
        at: now(),
        usageStillUnknown: !run.usage,
      };
      delete run.billingNote;
      await this.repo.audit(db, actorId, "ai.reconcile", {
        runId: id,
        points: String(value),
        note,
      });
      await this.recordGrade(db, run);
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
      return { ok: true };
    });
  }
  async startInterview(userId, input) {
    const ids = this.catalog.questions.filter(
      (q) =>
        !["choice", "coding"].includes(q.type) &&
        q.pool === "transfer" &&
        (!input.moduleId || q.moduleId === input.moduleId),
    );
    if (ids.length < input.count)
      throw new AiError(400, "该专题的主观题数量不足");
    const questions = ids
      .map((q) => ({ q, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .slice(0, input.count)
      .map((x) => x.q);
    return this.repo.transaction(async (db) => {
      await this.pool.snapshot(db, "interview");
      const account = await this.billing.view(db, userId);
      if (
        account.blocked ||
        (!account.exempt && micro(account.available) <= 0n)
      )
        throw new AiError(402, "可用资源点不足，请联系管理员");
      const active = await db.get(
        "SELECT COUNT(*) AS n FROM ai_sessions WHERE userId=? AND status=?",
        userId,
        "active",
      );
      if (Number(active.n) >= 3) throw new AiError(409, "请先结束已有面试");
      const session = {
        id: randomUUID(),
        userId,
        status: "active",
        mode: input.mode,
        difficulty: input.difficulty,
        questionIds: questions.map((q) => q.id),
        position: 0,
        followups: 0,
        activeRunId: "",
        currentPrompt: questions[0].prompt,
        turns: [],
        createdAt: now(),
      };
      await db.run(
        "INSERT INTO ai_sessions(id,userId,status,data,createdAt,updatedAt) VALUES(?,?,?,?,?,?)",
        session.id,
        userId,
        session.status,
        JSON.stringify(session),
        session.createdAt,
        session.createdAt,
      );
      return session;
    });
  }
  publicSession(session) {
    if (!session) throw new AiError(404, "面试记录不存在");
    const visible = {
      ...session,
      turns: session.turns.map((t) => ({
        ...t,
        evaluation:
          session.mode === "interview" && session.status === "active"
            ? null
            : t.evaluation,
      })),
    };
    const latest = new Map(
      session.turns.map((t) => [t.questionId, t.evaluation]),
    );
    if (session.status === "completed")
      visible.report = {
        score: latest.size
          ? Math.round(
              [...latest.values()].reduce((n, e) => n + e.score, 0) /
                latest.size,
            )
          : null,
        covered: latest.size,
        planned: session.questionIds.length,
        missing: [
          ...new Set([...latest.values()].flatMap((e) => e.missing)),
        ].slice(0, 12),
      };
    visible.currentQuestionId = session.questionIds[session.position] || "";
    visible.currentLessonId =
      this.catalog.questions.find((q) => q.id === visible.currentQuestionId)
        ?.lessonId || "";
    return visible;
  }
  async getSession(userId, id) {
    return this.publicSession(
      await this.repo.read((db) => this.repo.sessionRaw(id, userId, db)),
    );
  }
  async endInterview(userId, id) {
    return this.repo.transaction(async (db) => {
      const session = await this.repo.sessionRaw(id, userId, db);
      if (!session) throw new AiError(404, "面试记录不存在");
      if (session.activeRunId)
        throw new AiError(409, "请等待当前评阅完成后结束面试");
      session.status = "completed";
      session.endedAt = now();
      await this.repo.saveSession(db, session);
      return this.publicSession(session);
    });
  }
  async sessions(userId) {
    return this.repo.read(async (db) =>
      (
        await db.all(
          "SELECT * FROM ai_sessions WHERE userId=? ORDER BY createdAt DESC LIMIT 30",
          userId,
        )
      ).map((row) => {
        const s = JSON.parse(row.data);
        return {
          id: row.id,
          status: row.status,
          mode: s.mode,
          createdAt: row.createdAt,
          turns: s.turns.length,
          planned: s.questionIds.length,
        };
      }),
    );
  }
  async users(query = "") {
    return this.repo.transaction(async (db) => {
      const users = await db.all(
        "SELECT id,username,createdAt FROM auth_users WHERE username LIKE ? OR id IN (SELECT userId FROM auth_profiles WHERE publicId=? OR displayName LIKE ?) ORDER BY createdAt DESC LIMIT 100",
        "%" + query.toLowerCase() + "%",
        query,
        "%" + query + "%",
      );
      if (!users.length) return [];
      const ids = users.map((u) => u.id),
        slots = ids.map(() => "?").join(",");
      const roles = new Map(
        (
          await db.all(
            "SELECT * FROM auth_roles WHERE userId IN (" + slots + ")",
            ...ids,
          )
        ).map((x) => [x.userId, x.role]),
      );
      const profiles = [];
      for (const user of users) profiles.push(await ensureProfile(db, user));
      const result = [];
      for (const user of profiles)
        result.push({
          ...user,
          role: roles.get(user.id) || "user",
          ...(await this.billing.view(db, user.id)),
        });
      return result;
    });
  }
  async summary() {
    return this.repo.read(async (db) => {
      const since = new Date(Date.now() - 86400000).toISOString();
      const rows = await db.all(
        "SELECT feature,COUNT(*) AS calls,SUM(inputTokens) AS inputTokens,SUM(outputTokens) AS outputTokens FROM ai_runs WHERE createdAt>=? GROUP BY feature",
        since,
      );
      const units = await db.all(
        "SELECT feature,status,charged,due,waived FROM ai_billing_units WHERE createdAt>=?",
        since,
      );
      for (const row of rows) {
        const own = units.filter((u) => u.feature === row.feature);
        for (const [field, key] of [
          ["points", "charged"],
          ["duePoints", "due"],
          ["waivedPoints", "waived"],
        ])
          row[field] = points(
            own.reduce(
              (n, u) =>
                n +
                (key === "charged" && u.status === "reversed"
                  ? 0n
                  : BigInt(u[key] || 0)),
              0n,
            ),
          );
        row.pending = own.filter((u) => u.status === "pending").length;
      }
      return {
        rows,
        audit: await db.all(
          "SELECT * FROM admin_audit ORDER BY createdAt DESC LIMIT 30",
        ),
      };
    });
  }
  async block(actorId, userId, blocked) {
    return this.repo.transaction(async (db) => {
      if (!(await db.get("SELECT id FROM auth_users WHERE id=?", userId)))
        throw new AiError(404, "账号不存在");
      const account = await this.repo.account(db, userId, true);
      account.blocked = blocked;
      await this.repo.saveAccount(db, account);
      await this.repo.audit(db, actorId, "ai.account.block", {
        userId,
        blocked,
      });
      return { ok: true };
    });
  }
  async shutdown() {
    for (const job of this.jobs.values()) job.controller.abort();
    await Promise.allSettled([...this.jobs.values()].map((j) => j.promise));
    this.events.close();
  }
}
