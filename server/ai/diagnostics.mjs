import { AiError } from "./policy.mjs";

export function invalidOutput(message, kind, issues = []) {
  const error = new AiError(502, message, "AI_INVALID_OUTPUT");
  error.outputIssue = kind;
  error.validationIssues = issues.slice(0, 8).map((issue) => ({
    path: issue.path.map((part) => String(part)).join("."),
    code: issue.code,
    message:
      issue.code === "too_small"
        ? `至少需要 ${issue.minimum} ${issue.origin === "string" ? "个字符" : "项"}`
        : issue.code === "too_big"
          ? `最多允许 ${issue.maximum} ${issue.origin === "string" ? "个字符" : "项"}`
          : issue.code === "invalid_type"
            ? `应为 ${issue.expected}`
            : "字段类型、取值或额外字段不符合要求",
    // Never echo invalid values, the answer, or Zod's full error object.
  }));
  return error;
}

// Only fixed explanations go to learners. Upstream bodies and schema diagnostics
// remain in the authenticated admin record, separate from this public summary.
export function failureSummary(error = {}) {
  const status = error.upstreamStatus || null;
  const code = error.code || error.errorCode || "AI_ERROR";
  const upstream =
    `${error.upstreamCode || ""} ${error.providerDetail || ""}`.toLowerCase();
  let kind = "unknown",
    title = error.message || error.error || "本次 AI 调用未完成",
    suggestion = "请稍后重试；若持续失败，请让管理员按调用编号查看明细。";
  if (status === 401 || status === 403) {
    kind = "auth";
    title = "服务商鉴权或模型权限校验失败";
    suggestion = "请管理员检查服务商 Key、账号权限和模型访问权限。";
  } else if (
    status === 429 &&
    /quota|credit|balance|billing|spend|insufficient|余额|欠费|额度耗尽/.test(
      upstream,
    )
  ) {
    kind = "quota";
    title = "服务商余额或上游额度不足";
    suggestion = "请管理员检查上游余额与额度，或配置其他可用服务商。";
  } else if (status === 429) {
    kind = "rate_limit";
    title = "服务商正在限流";
    suggestion = "请稍后重试；管理员可检查上游并发、速率限制与服务池备用模型。";
  } else if ([400, 404, 405, 422].includes(status)) {
    kind = "compatibility";
    title = "模型或接口参数不兼容";
    suggestion =
      "请管理员检查模型 ID、接口协议、输出上限参数和结构化输出模式；具体不兼容参数见后台服务商返回信息。";
  } else if (code === "AI_TIMEOUT" || [408, 504].includes(status)) {
    kind = "timeout";
    title = "等待服务商响应超时";
    suggestion =
      "可稍后重试，或先减少生成题数；管理员可检查网络和该模型的单次、总任务超时。";
  } else if (code === "AI_OUTPUT_TRUNCATED") {
    kind = "truncated";
    title = "模型输出达到上限，结果被截断";
    suggestion =
      "可减少生成题数；管理员请检查模型最大输出 Token。推理消耗也可能占用输出预算。";
  } else if (code === "AI_INVALID_OUTPUT") {
    kind = error.outputIssue || "schema";
    const descriptions = {
      json: [
        "模型返回的内容不是有效 JSON",
        "请管理员检查模型结构化输出模式。不要直接把未经校验的文本保存为题目。",
      ],
      schema: [
        "模型返回内容不符合当前任务的格式要求",
        "请管理员查看字段校验明细，检查模型能力和结构化输出模式。",
      ],
      count: [
        "模型返回的题目数量与请求不一致",
        "可先生成 1 道题；管理员可通过举一反三测试检查模型的指令遵循能力。",
      ],
      duplicate: [
        "模型生成了与已有内容重复的题目",
        "请换一个出题方向或重试；重复内容未加入题库。",
      ],
      empty: [
        "模型没有返回可用的回答内容",
        "请管理员检查响应结束原因、输出上限及模型所用接口。",
      ],
      evidence: [
        "模型评分依据未通过证据校验",
        "模型引用的内容必须确实出现在当前回答中；本次评阅未记录为答题成绩。",
      ],
    };
    [title, suggestion] = descriptions[kind] || [
      error.message || "模型结果未通过内容校验",
      "请管理员检查后台的结果校验明细。",
    ];
  } else if (code === "AI_REFUSAL") {
    kind = "refusal";
    title = "模型拒绝处理本次学习任务";
    suggestion = "可调整回答或出题方向；本次未保存为有效结果。";
  } else if (code === "AI_CANCELLED") {
    kind = "cancelled";
    title = "任务已取消";
    suggestion = "本次未交付的结果不会扣个人额度。";
  } else if (
    code === "AI_PROVIDER_NETWORK" ||
    code === "AI_PROVIDER_INTERRUPTED"
  ) {
    kind = "network";
    title = "无法连接服务商或响应连接中断";
    suggestion = "请稍后重试；管理员可检查服务商地址、服务器出口网络和代理。";
  } else if (code === "AI_PROVIDER_JSON") {
    kind = "protocol";
    title = "服务商没有返回有效的接口 JSON";
    suggestion = "请管理员检查接口地址与反向代理，确认返回的是 API 响应。";
  } else if (status >= 500) {
    kind = "upstream";
    title = "服务商接口暂时不可用";
    suggestion =
      "请稍后重试；管理员可查看上游请求 ID 和返回信息，或配置备用服务商。";
  }
  return { code, kind, title, suggestion, httpStatus: status };
}

export function runFailure(run) {
  if (run.status === "running" || run.status === "succeeded") return null;
  const last = run.attempts?.findLast((attempt) => attempt.status === "failed");
  return failureSummary({
    ...last,
    code: run.errorCode || last?.errorCode,
    message: run.error,
    providerDetail: last?.providerError,
  });
}
