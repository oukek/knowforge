import { readFileSync } from "node:fs";
import { modules, lessons, sources } from "../base.mjs";
import { examples } from "../examples/helpers.mjs";
export const transferQuestions = [];
for (const [id, title, subtitle, icon, color] of [
  [
    "agents",
    "Agent 框架与运行时",
    "状态图、工具协议、SDK 与可靠执行",
    "Workflow",
    "#746599",
  ],
  [
    "fde",
    "FDE 与全栈交付",
    "发现问题、验证价值、部署运营与交接",
    "Compass",
    "#9a7952",
  ],
  [
    "aibasics",
    "AI 基础与概念",
    "从 LLM、模型原理到应用与 Agent 的系统入门",
    "Lightbulb",
    "#487b79",
  ],
])
  modules.push({
    id,
    title,
    subtitle,
    icon,
    color,
    priority: id === "aibasics" ? "P0" : "P1",
    budget: 30,
    order: id === "aibasics" ? 0 : modules.length + 1,
  });
modules.sort((a, b) => a.order - b.order);
modules.forEach((module, index) => {
  module.order = index + 1;
});
const references = [
  [
    "ms-agents",
    "Microsoft Agent Framework",
    "https://learn.microsoft.com/en-us/agent-framework/overview/",
    "Agent、会话、工作流与模型客户端",
  ],
  [
    "ms-workflows",
    "Microsoft Agent Framework Workflows",
    "https://learn.microsoft.com/en-us/agent-framework/concepts/workflows/",
    "显式执行图与实验性函数工作流",
  ],
  [
    "agents-sdk",
    "OpenAI Agents SDK",
    "https://developers.openai.com/api/docs/guides/agents/sdk",
    "SDK 的运行时边界与主要抽象",
  ],
  [
    "agents-quick",
    "OpenAI Agents SDK Quickstart",
    "https://developers.openai.com/api/docs/guides/agents/quickstart",
    "Python 与 TypeScript 的 Agent、Runner、工具",
  ],
  [
    "agents-handoff",
    "OpenAI Orchestration and handoffs",
    "https://developers.openai.com/api/docs/guides/agents/orchestration",
    "转交控制权与工具式调用",
  ],
  [
    "agents-guard",
    "OpenAI Guardrails and human review",
    "https://developers.openai.com/api/docs/guides/agents/guardrails-approvals",
    "验证与审批的不同责任",
  ],
  [
    "agents-state",
    "OpenAI Results and state",
    "https://developers.openai.com/api/docs/guides/agents/results",
    "运行结果、历史与恢复状态",
  ],
  [
    "lg-overview",
    "LangGraph Overview",
    "https://docs.langchain.com/oss/python/langgraph/overview",
    "有状态工作流与图运行时",
  ],
  [
    "lg-graph",
    "LangGraph Graph API",
    "https://docs.langchain.com/oss/python/langgraph/graph-api",
    "StateGraph、节点更新与 reducer",
  ],
  [
    "lg-memory",
    "LangGraph Memory",
    "https://docs.langchain.com/oss/python/langgraph/add-memory",
    "checkpointer、thread_id 与长期存储",
  ],
  [
    "lg-interrupt",
    "LangGraph Interrupts",
    "https://docs.langchain.com/oss/python/langgraph/interrupts",
    "暂停、恢复与节点重执行",
  ],
  [
    "fde-official",
    "OpenAI Forward Deployed Engineering",
    "https://openai.com/business/forward-deployed-engineering/",
    "嵌入客户工作流、验证与生产落地",
  ],
  [
    "node-context",
    "Node.js Async Context",
    "https://nodejs.org/api/async_context.html",
    "AsyncLocalStorage 请求上下文",
  ],
  [
    "node-worker",
    "Node.js Worker Threads",
    "https://nodejs.org/api/worker_threads.html",
    "CPU 工作池与线程通信",
  ],
  [
    "fastapi-doc",
    "FastAPI 官方文档",
    "https://fastapi.tiangolo.com/async/",
    "协程端点、线程池与阻塞边界",
  ],
  [
    "sql-transaction",
    "MySQL 事务与锁",
    "https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-model.html",
    "事务、并发控制与隔离",
  ],
  [
    "hf-kv",
    "Transformers Cache strategies",
    "https://huggingface.co/docs/transformers/main/en/kv_cache",
    "KV 缓存、显存与延迟取舍",
  ],
  [
    "hf-generation",
    "Transformers Generation strategies",
    "https://huggingface.co/docs/transformers/main/en/generation_strategies",
    "自回归生成与解码策略",
  ],
  [
    "hf-lora",
    "PEFT LoRA",
    "https://huggingface.co/docs/peft/main/en/conceptual_guides/lora",
    "低秩更新与参数高效适配",
  ],
  [
    "hf-dpo",
    "TRL DPO Trainer",
    "https://huggingface.co/docs/trl/main/en/dpo_trainer",
    "偏好样本与参考策略",
  ],
  [
    "oa-compaction",
    "OpenAI Compaction",
    "https://developers.openai.com/api/docs/guides/compaction",
    "上下文压缩与不透明状态项",
  ],
  [
    "oa-schema",
    "OpenAI Structured outputs",
    "https://developers.openai.com/api/docs/guides/structured-outputs",
    "结构契约、拒绝与不完整输出",
  ],
  [
    "oa-cache",
    "OpenAI Prompt caching",
    "https://developers.openai.com/api/docs/guides/prompt-caching",
    "前缀匹配及模型相关的缓存规则",
  ],
  [
    "oa-eval",
    "OpenAI Evaluation best practices",
    "https://developers.openai.com/api/docs/guides/evaluation-best-practices",
    "任务评估、评审偏差与持续回归",
  ],
  [
    "oa-shell",
    "OpenAI Shell tool",
    "https://developers.openai.com/api/docs/guides/tools-shell",
    "宿主执行环境与工具隔离",
  ],
  [
    "otel-agent",
    "OpenTelemetry GenAI agent spans",
    "https://github.com/open-telemetry/semantic-conventions-genai",
    "独立维护的 GenAI 轨迹语义约定仓库",
  ],
  [
    "lg-subgraphs",
    "LangGraph Subgraphs",
    "https://docs.langchain.com/oss/python/langgraph/use-subgraphs",
    "子图输入输出与状态隔离",
  ],
  [
    "mcp-version",
    "MCP Versioning and Compatibility",
    "https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning",
    "2026 与传统握手版本的兼容边界",
  ],
  [
    "mcp-security",
    "MCP Security Best Practices",
    "https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices",
    "令牌受众、混淆代理与 SSRF",
  ],
  [
    "hf-llm-intro",
    "Hugging Face LLM Course Introduction",
    "https://huggingface.co/learn/llm-course/en/chapter1/1",
    "NLP、LLM 与模型学习路线",
  ],
  [
    "hf-transformers-intro",
    "Hugging Face How do Transformers work?",
    "https://huggingface.co/learn/llm-course/en/chapter1/4",
    "预训练、迁移与 Transformer 家族",
  ],
  [
    "hf-bpe-intro",
    "Hugging Face Byte-Pair Encoding",
    "https://huggingface.co/learn/llm-course/en/chapter6/5",
    "子词分词与 BPE 合并",
  ],
  [
    "google-ml-intro",
    "Google Introduction to Machine Learning",
    "https://developers.google.com/machine-learning/intro-to-ml",
    "机器学习的基本问题与学习方式",
  ],
  [
    "google-embeddings-intro",
    "Google Obtaining embeddings",
    "https://developers.google.com/machine-learning/crash-course/embeddings/obtaining-embeddings",
    "Embedding 的学习与语义表示",
  ],
  [
    "oa-agents-overview",
    "OpenAI Agents Overview",
    "https://developers.openai.com/api/docs/guides/agents",
    "Agent、工具与应用运行时的关系",
  ],
  [
    "a2a-intro",
    "Agent2Agent Protocol",
    "https://a2a-protocol.org/latest/",
    "跨 Agent 应用的通信与互操作边界",
  ],
  [
    "hf-multimodal-intro",
    "Transformers Image-text-to-text",
    "https://huggingface.co/docs/transformers/main/en/tasks/image_text_to_text",
    "视觉语言模型输入与任务边界",
  ],
  [
    "hf-diffusion-intro",
    "Diffusers Pipelines, models and schedulers",
    "https://huggingface.co/docs/diffusers/main/en/using-diffusers/write_own_pipeline",
    "扩散生成流水线与调度器",
  ],
  [
    "hf-grpo-intro",
    "TRL GRPO Trainer",
    "https://huggingface.co/docs/trl/main/en/grpo_trainer",
    "组内奖励、优势与训练配置边界",
  ],
  [
    "hf-ppo-intro",
    "Hugging Face PPO clipped objective",
    "https://huggingface.co/learn/deep-rl-course/en/unit8/clipped-surrogate-objective",
    "裁剪目标与策略更新的区别",
  ],
  [
    "redis-eviction",
    "Redis Key eviction",
    "https://redis.io/docs/latest/develop/reference/eviction/",
    "内存压力下的键淘汰策略",
  ],
  [
    "redis-expire",
    "Redis EXPIRE",
    "https://redis.io/docs/latest/commands/expire/",
    "TTL、过期与删除语义",
  ],
  [
    "mysql-redo",
    "MySQL InnoDB Redo Log",
    "https://dev.mysql.com/doc/refman/8.4/en/innodb-redo-log.html",
    "崩溃恢复与 redo",
  ],
  [
    "mysql-undo",
    "MySQL InnoDB Undo Logs",
    "https://dev.mysql.com/doc/refman/8.4/en/innodb-undo-logs.html",
    "回滚、一致性读与 undo",
  ],
  [
    "mysql-binlog",
    "MySQL Binary Log",
    "https://dev.mysql.com/doc/refman/8.4/en/binary-log.html",
    "服务层变更日志与复制",
  ],
  [
    "mdn-bigint",
    "MDN BigInt",
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt",
    "整数运算、Number 混用和 JSON 边界",
  ],
  [
    "redis-bloom",
    "Redis Bloom filters",
    "https://redis.io/docs/latest/develop/data-types/probabilistic/bloom-filter/",
    "布隆结构、误判与使用限制",
  ],
];
for (const [id, title, url, scope] of references)
  sources.push({
    id,
    title,
    url,
    scope,
    status: "verified",
    checkedAt: "2026-10-23",
  });
const entries = JSON.parse(
  readFileSync(new URL("./entries.json", import.meta.url), "utf8"),
);
for (const entry of entries) {
  const markdown = readFileSync(
    new URL(`./lessons/${entry.id}.md`, import.meta.url),
    "utf8",
  );
  const sections = markdown
    .split(/^## /m)
    .filter(Boolean)
    .map((block) => {
      const newline = block.indexOf("\n");
      return {
        title: block.slice(0, newline).trim(),
        content: block.slice(newline + 1).trim(),
      };
    });
  const code = readFileSync(
    new URL(
      `./code/${entry.id}.${entry.language === "python" ? "py" : "js"}`,
      import.meta.url,
    ),
    "utf8",
  ).trim();
  const row = {
    ...entry,
    sections,
    depth: entry.depth || "deep",
    provenance: "editorial",
    level: entry.level || "进阶",
    priority: entry.priority || "P1",
    updatedAt: "2026-10-23",
    order: lessons.filter((l) => l.moduleId === entry.moduleId).length + 1,
    estimatedMinutes: Math.max(20, Math.ceil(markdown.length / 70)),
    interview: {
      question: entry.title + "的核心模型是什么？",
      answer: sections[0].content,
      rubric: entry.questions[0].rubric,
      scenario: "如何验证" + entry.title + "的关键边界？",
      scenarioAnswer: sections.at(-1).content,
    },
  };
  delete row.questions;
  delete row.logs;
  delete row.explanation;
  lessons.push(row);
  examples.set(entry.id, {
    id: "example-" + entry.id,
    title: entry.title + " · 可验证的机制",
    description:
      entry.description ||
      "浏览器内的确定性实验，用于验证关键不变量。真实服务/SDK 完整示例见正文；不会连接模型或外部服务。",
    language: entry.language,
    runtime: entry.model ? "model" : entry.language,
    code,
    expectedLogs: entry.logs.map(String),
    explanation: entry.explanation,
  });
  entry.questions.forEach((q, i) =>
    transferQuestions.push({
      ...q,
      id: `transfer-${entry.id}-${i + 1}`,
      lessonId: entry.id,
      moduleId: entry.moduleId,
      pool: "transfer",
      priority: entry.priority || "P1",
      difficulty: q.difficulty || entry.level || "进阶",
      keywords: entry.keywords,
      provenance: "editorial",
      type: q.type || "scenario",
    }),
  );
}
