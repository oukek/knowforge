import { mkdirSync, writeFileSync } from "node:fs";
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
await import("../data/content/v3/transfer.mjs");
await import("../data/content/v3/deepen.mjs");
await import("../data/content/v3/exercises.mjs");
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
    difficulty: "进阶",
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
    moduleIds: ["python", "restapi", "llmapp", "ai"],
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
    deepLessons: lessons.filter((l) => l.depth === "deep").length,
    expandedLessons: lessons.filter((l) => l.depth === "expanded").length,
    transferQuestions: questions.filter((q) => q.pool === "transfer").length,
    foundationQuestions: questions.filter((q) => q.pool === "foundation")
      .length,
  },
  updatedAt: "2026-10-23",
  title: "KnowForge · 全栈与 AI 工程知识库",
  disclaimer:
    "覆盖前端、Python、数据采集、RESTful API 与 AI 应用的原创学习及练习资料。原微信面试材料保留并校正，不代表任何官方题库；平台行为以目标版本官方文档为准。",
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
      if (question.type === "choice")
        md += `${question.options.map((option, index) => `${index + 1}. ${option}`).join("\n")}\n\n正确选项：${question.correct + 1}。\n\n`;
      md += `${question.answer}\n\n检验要点：\n\n${question.rubric.map((point) => `- ${point}`).join("\n")}\n\n`;
    }
    const links = l.sourceIds
      .map((id) => sources.find((s) => s.id === id))
      .filter(Boolean);
    if (links.length)
      md += `参考：${links.map((s) => `[${s.title}](${s.url})`).join(" · ")}\n\n`;
  }
}
md += "## 基础单选题与解析\n\n迁移单选题位于各篇资料的迁移训练中。\n\n";
for (const q of choices)
  md += `### ${q.prompt}\n\n${q.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\n答案：${q.correct + 1}。${q.explanation}\n\n`;
md += "## 手写实验\n\n";
for (const l of labs)
  md += `### ${l.title}\n\n${l.prompt}\n\n${l.complexity}\n\n\x60\x60\x60javascript\n${l.solution}\n\x60\x60\x60\n\n用例：${l.tests.map((t) => t.name).join("、")}。\n\n`;
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
