import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  modules,
  lessons,
  sources,
  corrections,
} from "../data/content/base.mjs";
import "../data/content/foundations.mjs";
import "../data/content/platform.mjs";
import "../data/content/engineering.mjs";
import "../data/content/applied.mjs";
import "../data/content/advanced.mjs";
import "../data/content/deepening.mjs";
import { choices } from "../data/content/choices.mjs";
import { labs } from "../data/content/labs.mjs";
import { attachExamples } from "../data/content/examples/index.mjs";
await import("../data/content/expansion/python.mjs");
await import("../data/content/expansion/crawler.mjs");
await import("../data/content/expansion/restapi.mjs");
await import("../data/content/expansion/ai.mjs");
await import("../data/content/expansion/practice.mjs");
const { transferQuestions } = await import("../data/content/v3/index.mjs");
await import("../data/content/v3/algorithms.mjs");
await import("../data/content/acm/index.mjs");
await import("../data/content/v3/transfer.mjs");
await import("../data/content/v3/deepen.mjs");
await import("../data/content/v3/exercises.mjs");
await import("../data/content/v3/ai-exercises.mjs");
await import("../data/content/ai-foundations/exercises.mjs");
const { interviewSources } =
  await import("../data/content/interviews/index.mjs");
await import("../data/content/interview-engineering/index.mjs");
const glossary = JSON.parse(
  readFileSync(
    new URL("../data/content/ai-foundations/glossary.json", import.meta.url),
    "utf8",
  ),
);
attachExamples(lessons);
lessons.sort(
  (a, b) =>
    modules.find((x) => x.id === a.moduleId).order -
      modules.find((x) => x.id === b.moduleId).order || a.order - b.order,
);
const questions = lessons.flatMap((l) => [
  {
    id: `oral-${l.id}`,
    lessonId: l.id,
    moduleId: l.moduleId,
    type: "oral",
    prompt: l.interview.question,
    answer: l.interview.answer,
    rubric: l.interview.rubric,
    priority: l.priority,
    keywords: l.keywords,
    difficulty: l.level,
    provenance: "editorial",
  },
  {
    id: `case-${l.id}`,
    lessonId: l.id,
    moduleId: l.moduleId,
    type: "scenario",
    prompt: l.interview.scenario,
    answer: l.interview.scenarioAnswer,
    rubric: [
      l.interview.scenarioAnswer,
      ...l.sections[2].content.split("\n").map((x) => x.replace(/^- /, "")),
    ],
    priority: l.priority,
    keywords: l.keywords,
    difficulty: "进阶",
    provenance: "editorial",
  },
]);
for (const q of choices) {
  const l = lessons.find((x) => x.id === q.lessonId);
  questions.push({
    ...q,
    moduleId: l.moduleId,
    priority: l.priority,
    keywords: l.keywords,
    difficulty: l.level,
    answer: q.explanation,
    rubric: [q.explanation],
  });
}
for (const lab of labs) {
  const l = lessons.find((x) => x.id === lab.lessonId);
  Object.assign(lab, { moduleId: l.moduleId, priority: l.priority });
  questions.push({
    id: `code-${lab.id}`,
    lessonId: l.id,
    moduleId: l.moduleId,
    type: "coding",
    labId: lab.id,
    pool: lab.pool ?? "foundation",
    prompt: lab.title,
    answer: lab.solution,
    rubric: lab.hints,
    priority: l.priority,
    keywords: l.keywords,
    difficulty: lab.difficulty || "进阶",
    provenance: "editorial",
  });
}
questions.push(...transferQuestions);
for (const question of questions) question.pool ??= "foundation";
const normalizePrompt = (text) =>
  text.replace(/\s|[，。？！、：；,.?!:;]/g, "");
const prompts = new Set();
for (const question of questions.filter((q) => q.pool === "transfer")) {
  const normalized = normalizePrompt(question.prompt);
  if (prompts.has(normalized)) throw new Error("迁移题重复：" + question.id);
  prompts.add(normalized);
  const lesson = lessons.find((l) => l.id === question.lessonId);
  if (
    [lesson.interview.question, lesson.interview.scenario].some(
      (p) => normalizePrompt(p) === normalized,
    )
  )
    throw new Error("迁移题复制了基础自测：" + question.id);
}
for (const m of modules) {
  m.lessonCount = lessons.filter((x) => x.moduleId === m.id).length;
  m.questionCount = questions.filter((x) => x.moduleId === m.id).length;
  m.estimatedMinutes = lessons
    .filter((x) => x.moduleId === m.id)
    .reduce((s, l) => s + l.estimatedMinutes, 0);
}
const tracks = [
  {
    id: "frontend",
    title: "前端工程",
    description: "语言、页面、浏览器、框架、性能与算法，小程序可另外选。",
    moduleIds: [
      "js",
      "css",
      "network",
      "framework",
      "performance",
      "engineering",
      "algorithm",
    ],
  },
  {
    id: "database-saas",
    title: "数据库与 SaaS",
    description: "MySQL、事务、服务设计、租户隔离与线上排查。",
    moduleIds: ["design", "architecture", "node", "restapi", "engineering"],
  },
  {
    id: "ai-from-zero",
    title: "AI 从概念到应用",
    description: "概念、模型机制、应用、RAG、工具与 Agent",
    moduleIds: ["aibasics", "llmapp", "agents", "fde"],
  },
  {
    id: "fullstack",
    title: "Node / Python 全栈进阶",
    description: "请求预算、事务、并发、流与跨语言契约",
    moduleIds: ["node", "python", "restapi", "design"],
  },
  {
    id: "agent-delivery",
    title: "Agent 与 FDE 交付",
    description: "框架原理、状态恢复、工具授权、评估和生产落地",
    moduleIds: ["agents", "fde", "llmapp", "python", "node"],
  },
  {
    id: "python-data",
    title: "Python 与数据采集",
    description: "从语言、可靠采集到数据接口。",
    moduleIds: ["python", "crawler", "restapi"],
  },
  {
    id: "ai-application",
    title: "AI 应用工程",
    description: "打通 Python、服务契约、RAG 与工具执行。",
    moduleIds: ["aibasics", "python", "restapi", "llmapp", "ai"],
  },
  {
    id: "foundation",
    title: "语言与网络地基",
    description: "先能解释机制，再能写出边界。",
    moduleIds: ["js", "network", "css"],
  },
  {
    id: "wxg",
    title: "微信场景与工程实践",
    description: "把宿主限制转成可验证的方案。",
    moduleIds: ["mini", "framework", "performance", "algorithm"],
  },
  {
    id: "delivery",
    title: "系统设计与交付",
    description: "从单点实现走到长期稳定运行。",
    moduleIds: ["engineering", "node", "design", "project"],
  },
  {
    id: "extension",
    title: "AI 与架构思辨",
    description: "按岗位和简历需要拓展，保持证据意识。",
    moduleIds: ["ai", "architecture", "strategy"],
  },
];
const data = {
  schemaVersion: 1,
  edition: "2026.10 · 深度与迁移训练",
  curriculum: {
    friendInterviewQuestions: questions.filter(
      (q) => q.provenance === "user-reported",
    ).length,
    inferredInterviewQuestions: questions.filter(
      (q) => q.provenance === "editorial-inference",
    ).length,
    acmProblems: labs.filter((l) => l.mode === "stdin").length,
    aiFoundationLessons: lessons.filter((l) => l.moduleId === "aibasics")
      .length,
    glossaryTerms: glossary.length,
    publicInterviewQuestions: questions.filter(
      (q) => q.provenance === "public-report-adapted",
    ).length,
    publicInterviewSources: interviewSources.length,
    deepLessons: lessons.filter((l) => l.depth === "deep").length,
    expandedLessons: lessons.filter((l) => l.depth === "expanded").length,
    transferQuestions: questions.filter((q) => q.pool === "transfer").length,
    foundationQuestions: questions.filter((q) => q.pool === "foundation")
      .length,
  },
  updatedAt: "2026-10-24",
  title: "KnowForge · 全栈与 AI 工程知识库",
  disclaimer:
    "覆盖前端、Python、数据采集、RESTful API 与 AI 应用的原创学习及练习资料。原微信面试材料保留并校正，不代表任何官方题库；平台行为以目标版本官方文档为准。",
  glossary,
  interviewSources,
  modules,
  tracks,
  lessons,
  questions,
  labs,
  sources,
  corrections,
};
mkdirSync("data", { recursive: true });
writeFileSync("data/catalog.json", JSON.stringify(data, null, 2) + "\n");
let md = `# ${data.title}\n\n整理日期：${data.updatedAt}\n\n${data.disclaimer}\n\n共 ${modules.length} 个专题、${lessons.length} 篇知识讲解、${questions.length} 道题、${labs.length} 个可运行代码实验。\n\n## 阅读前的校正\n\n`;
for (const c of corrections) md += `### ${c.title}\n\n${c.correction}\n\n`;
for (const mod of modules) {
  md += `## ${mod.order}. ${mod.title}\n\n${mod.subtitle} · ${mod.priority}\n\n`;
  for (const l of lessons.filter((x) => x.moduleId === mod.id)) {
    md += `### ${l.title}\n\n${l.summary}\n\n`;
    for (const s of l.sections) md += `#### ${s.title}\n\n${s.content}\n\n`;
    if (l.code) md += `\x60\x60\x60javascript\n${l.code}\n\x60\x60\x60\n\n`;
    md += `#### 可编辑运行的 ${l.language === "python" ? "Python" : "JavaScript"} 示例

${l.playground.title}

${l.playground.description}

运行范围：${l.playground.runtime === "model" ? "教学模拟，不等于真实宿主/协议实现" : l.language === "python" ? "浏览器 CPython / Pyodide，内置标准库" : "标准 JavaScript / Worker"}

\x60\x60\x60${l.language}
${l.playground.code}
\x60\x60\x60

`;
    for (const exercise of l.exercises) {
      md += `#### 随堂练习：${exercise.title}

${exercise.prompt}

`;
      if (exercise.type === "output")
        md += `参考输出：

\x60\x60\x60text
${exercise.expectedLogs.join("\n")}
\x60\x60\x60

${exercise.explanation}

`;
      else
        md += `\x60\x60\x60${l.language}
${exercise.starter}
\x60\x60\x60

参考补全：

\x60\x60\x60${l.language}
${exercise.solution}
\x60\x60\x60

${exercise.explanation}

`;
    }
    md += `#### 基础自测\n\n**${l.interview.question}**\n\n${l.interview.answer}\n\n**场景追问：${l.interview.scenario}**\n\n${l.interview.scenarioAnswer}\n\n`;
    for (const question of questions.filter(
      (q) =>
        q.lessonId === l.id && q.pool === "transfer" && q.type !== "coding",
    )) {
      md += `#### 迁移训练：${question.prompt}\n\n`;
      if (question.origin) {
        const refs = question.origin.sourceIds.map((id) =>
          sources.find((s) => s.id === id),
        );
        const label =
          question.provenance === "user-reported"
            ? "朋友面试记录 · 用户转述"
            : question.provenance === "editorial-inference"
              ? "原创延伸 · 考点推演"
              : `公开面经考点改编 · ${question.company}`;
        md += `${label}。${question.origin.adaptation}\n\n${refs.map((s) => `来源：[${s.title}](${s.url})。${s.dateNote || ""}`).join("\n\n")}\n\n`;
      }
      if (question.type === "choice")
        md += `${question.options.map((option, index) => `${index + 1}. ${option}`).join("\n")}\n\n正确选项：${question.correct + 1}。\n\n`;
      if (question.followUps?.length)
        md += `追问：${question.followUps.join("；")}\n\n`;
      md += `${question.answer}\n\n检验要点：\n\n${question.rubric.map((point) => `- ${point}`).join("\n")}\n\n`;
    }
    const links = l.sourceIds
      .map((id) => sources.find((s) => s.id === id))
      .filter(Boolean);
    if (links.length)
      md += `参考：${links.map((s) => `[${s.title}](${s.url})`).join(" · ")}\n\n`;
  }
}
md += "## AI 概念速查\n\n";
for (const term of glossary) {
  const lesson = lessons.find((l) => l.id === term.lessonId);
  md += `### ${term.term} · ${term.chinese}\n\n${term.definition}\n\n辨析：${term.distinction}\n\n关联课程：${lesson.title}\n\n`;
}
md +=
  "## 公开面经来源边界\n\n只记录可访问公开内容。公司归属与面试经历为发布者自述或汇总，未经公司确认；发布日期不自动等于面试日期，不据有限样本宣称出题频率。\n\n";
for (const source of interviewSources)
  md += `- [${source.title}](${source.url})：${source.dateNote}\n`;
md += "\n";
md += "## 基础单选题与解析\n\n迁移单选题位于各篇资料的迁移训练中。\n\n";
for (const q of choices)
  md += `### ${q.prompt}\n\n${q.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\n答案：${q.correct + 1}。${q.explanation}\n\n`;
md += "## 手写实验\n\n";
for (const l of labs) {
  md += `### ${l.title}\n\n${l.prompt}\n\n`;
  if (l.inputFormat) {
    md += `输入：${l.inputFormat}\n\n输出：${l.outputFormat}\n\n约束：${l.constraints}\n\n`;
    for (const [i, sample] of l.samples.entries())
      md += `样例 ${i + 1} 输入/调用：\n\n\x60\x60\x60text\n${sample.input}\n\x60\x60\x60\n\n输出/返回：\n\n\x60\x60\x60text\n${sample.output}\n\x60\x60\x60\n\n解释：${sample.explanation}\n\n`;
  }
  if (l.judge)
    md += `提交判题：${l.tests.length} 组固定边界 + ${l.judge.randomCases} 组固定种子随机对照 + ${l.judge.stressCases} 组约束上限，共 ${l.judge.caseCount} 组；每组限时 ${l.caseTimeLimitMs / 1000} 秒，整次限时 ${l.timeLimitMs / 1000} 秒。随机预期值由独立小规模算法生成；通过测试不能代替证明。\n\n`;
  md += `${l.analysis || ""}\n\n${l.complexity}\n\n\x60\x60\x60javascript\n${l.solution}\n\x60\x60\x60\n\n用例：${l.tests.map((t) => t.name).join("、")}。\n\n`;
}
mkdirSync("docs", { recursive: true });
writeFileSync("docs/完整学习手册.md", md);
console.log(
  JSON.stringify({
    modules: modules.length,
    lessons: lessons.length,
    questions: questions.length,
    choices: questions.filter((q) => q.type === "choice").length,
    labs: labs.length,
    examples: lessons.filter((l) => l.playground).length,
    exercises: lessons.reduce((s, l) => s + l.exercises.length, 0),
    bytes: Buffer.byteLength(JSON.stringify(data)),
  }),
);
