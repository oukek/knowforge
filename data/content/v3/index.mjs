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
])
  modules.push({
    id,
    title,
    subtitle,
    icon,
    color,
    priority: "P1",
    budget: 30,
    order: modules.length + 1,
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
    depth: "deep",
    provenance: "editorial",
    level: "进阶",
    priority: "P1",
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
      priority: "P1",
      difficulty: q.difficulty || "进阶",
      keywords: entry.keywords,
      provenance: "editorial",
      type: q.type || "scenario",
    }),
  );
}
