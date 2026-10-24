import { readFileSync } from "node:fs";
import { lessons, sources } from "../base.mjs";
import { examples } from "../examples/helpers.mjs";
import { transferQuestions } from "../v3/index.mjs";
const references = [
  [
    "mysql-index",
    "MySQL 8.4 · Clustered and Secondary Indexes",
    "https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html",
  ],
  [
    "mysql-mrr",
    "MySQL 8.4 · Multi-Range Read",
    "https://dev.mysql.com/doc/refman/8.4/en/mrr-optimization.html",
  ],
  [
    "mysql-icp",
    "MySQL 8.4 · Index Condition Pushdown",
    "https://dev.mysql.com/doc/refman/8.4/en/index-condition-pushdown-optimization.html",
  ],
  [
    "mysql-engine",
    "MySQL 8.4 · Storage Engines",
    "https://dev.mysql.com/doc/refman/8.4/en/storage-engines.html",
  ],
  [
    "mysql-read",
    "MySQL 8.4 · Consistent Nonlocking Reads",
    "https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html",
  ],
  [
    "mysql-isolation",
    "MySQL 8.4 · Transaction Isolation Levels",
    "https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html",
  ],
  [
    "openai-limits",
    "OpenAI · Rate limits",
    "https://developers.openai.com/api/docs/guides/rate-limits",
  ],
  [
    "openai-errors",
    "OpenAI · Error codes",
    "https://developers.openai.com/api/docs/guides/error-codes",
  ],
  [
    "claude-stream",
    "Claude · Streaming messages",
    "https://platform.claude.com/docs/en/build-with-claude/streaming",
  ],
  [
    "rag-eval",
    "Microsoft Foundry · RAG evaluators",
    "https://learn.microsoft.com/en-us/azure/foundry/concepts/evaluation-evaluators/rag-evaluators",
  ],
  [
    "qdrant-hybrid",
    "Qdrant · Hybrid queries",
    "https://qdrant.tech/documentation/search/hybrid-queries/",
  ],
  [
    "qdrant-points",
    "Qdrant · Points",
    "https://qdrant.tech/documentation/manage-data/points/",
  ],
  [
    "agentscope-core",
    "AgentScope · Key concepts",
    "https://doc.agentscope.io/tutorial/quickstart_key_concept.html",
  ],
  [
    "agentscope-react",
    "AgentScope · ReAct agent",
    "https://doc.agentscope.io/tutorial/quickstart_agent.html",
  ],
  [
    "agentscope-eval",
    "AgentScope · Evaluation",
    "https://doc.agentscope.io/tutorial/task_eval.html",
  ],
  [
    "skills",
    "Agent Skills · Specification",
    "https://agentskills.io/specification",
  ],
  [
    "langgraph-memory",
    "LangChain / LangGraph · Memory",
    "https://docs.langchain.com/oss/python/concepts/memory",
  ],
  [
    "saas-isolation",
    "AWS SaaS Lens · Silo, pool and bridge",
    "https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html",
  ],
  [
    "saas-silo",
    "AWS SaaS Lens · Full stack isolation",
    "https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/full-stack-isolation.html",
  ],
  [
    "sre-monitor",
    "Google SRE · Monitoring",
    "https://sre.google/sre-book/monitoring-distributed-systems/",
  ],
  [
    "sre-troubleshoot",
    "Google SRE · Effective troubleshooting",
    "https://sre.google/sre-book/effective-troubleshooting/",
  ],
  [
    "sre-toil",
    "Google SRE · Eliminating toil",
    "https://sre.google/sre-book/eliminating-toil/",
  ],
];
sources.push(
  ...references.map(([id, title, url]) => ({
    id: "ie-" + id,
    title,
    url,
    status: "verified",
    checkedAt: "2026-10-24",
    scope:
      "技术依据；章节中的故障案例、选择框架及追问题由本项目原创整理，不代表来源原文或公司官方题库。",
  })),
);
const entries = JSON.parse(
  readFileSync(new URL("./entries.json", import.meta.url), "utf8"),
);
export const interviewEngineeringEntries = entries;
for (const entry of entries) {
  const sections = readFileSync(
    new URL(`./lessons/${entry.id}.md`, import.meta.url),
    "utf8",
  )
    .split(/^## /m)
    .filter(Boolean)
    .map((block) => {
      const i = block.indexOf("\n");
      return { title: block.slice(0, i), content: block.slice(i + 1).trim() };
    });
  const related = lessons
    .filter((l) => l.moduleId === entry.moduleId)
    .slice(-3)
    .map((l) => l.id);
  const lesson = {
    id: entry.id,
    moduleId: entry.moduleId,
    title: entry.title,
    summary: sections[0].content.split("\n")[0],
    sections,
    keywords: entry.keywords,
    sourceIds: entry.sourceIds,
    relatedLessonIds: related,
    depth: "deep",
    level: "进阶",
    priority: "P1",
    provenance: "editorial",
    collection: "interview-engineering",
    updatedAt: "2026-10-24",
    order: lessons.filter((l) => l.moduleId === entry.moduleId).length + 1,
    estimatedMinutes: Math.max(
      25,
      Math.ceil(sections.reduce((sum, s) => sum + s.content.length, 0) / 55),
    ),
    interview: {
      question: `请建立“${entry.title}”的机制模型，并说明适用边界。`,
      answer: entry.answer,
      rubric: entry.followups[0].rubric,
      scenario: `你需要把“${entry.title}”落地到一个新业务，如何先做验证再上线？`,
      scenarioAnswer: sections.at(-1).content,
    },
  };
  lessons.push(lesson);
  examples.set(entry.id, {
    id: "example-" + entry.id,
    title: entry.title + " · 确定性实验",
    description:
      "使用本地 JavaScript 模型验证关键不变量；不调用真实数据库、模型或生产服务。实验简化之处与真实系统步骤见正文。",
    runtime: "javascript",
    language: "javascript",
    code: readFileSync(
      new URL(`./code/${entry.id}.js`, import.meta.url),
      "utf8",
    ).trim(),
    expectedLogs: entry.logs,
    explanation: sections.at(-2).content,
  });
  const common = {
    lessonId: entry.id,
    moduleId: entry.moduleId,
    pool: "transfer",
    priority: "P1",
    difficulty: "进阶",
    keywords: entry.keywords,
    technicalSourceIds: entry.sourceIds,
    type: "scenario",
  };
  entry.reported.forEach((prompt, i) =>
    transferQuestions.push({
      ...common,
      id: `friend-${entry.id}-${i + 1}`,
      prompt,
      answer: entry.answer,
      rubric: [...new Set(entry.followups.flatMap((q) => q.rubric))].slice(
        0,
        6,
      ),
      provenance: "user-reported",
      origin: {
        kind: "user-reported",
        recordedAt: "2026-10-24",
        sourceIds: [],
        adaptation:
          "用户转述的朋友近期面试问题，保留考点；未提供公司、准确面试日期或原始记录，未独立核实。答案为本项目整理。",
      },
      followUps: entry.followups.map((q) => q.prompt),
    }),
  );
  entry.followups.forEach((q, i) =>
    transferQuestions.push({
      ...common,
      ...q,
      id: `inferred-${entry.id}-${i + 1}`,
      provenance: "editorial-inference",
      origin: {
        kind: "editorial-inference",
        sourceIds: [],
        relatedQuestionIds: entry.reported.map(
          (_, j) => `friend-${entry.id}-${j + 1}`,
        ),
        adaptation:
          "根据用户提供的面试考点推演的原创延伸题，用于训练故障诊断与方案取舍；不是已证实的公司原题或高频统计。",
      },
    }),
  );
}
