import { readFileSync } from "node:fs";
import { lessons, sources } from "../base.mjs";
import { ex, fill } from "../examples/helpers.mjs";
import { transferQuestions } from "../v3/index.mjs";
sources.push({
  id: "mit-algorithms",
  title: "MIT 6.006 · Introduction to Algorithms lecture notes",
  url: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/pages/lecture-notes/",
  status: "verified",
  checkedAt: "2026-10-24",
  scope: "排序、贪心与动态规划的技术参考；以下讲解、反例和练习为项目原创整理。",
});
const entries = JSON.parse(
  readFileSync(new URL("./lesson-entries.json", import.meta.url), "utf8"),
);
for (const [index, entry] of entries.entries()) {
  const sections = readFileSync(
    new URL(`./lessons/${entry.id}.md`, import.meta.url),
    "utf8",
  )
    .split(/^## /m)
    .filter(Boolean)
    .map((block) => {
      const at = block.indexOf("\n");
      return { title: block.slice(0, at), content: block.slice(at + 1).trim() };
    });
  const lesson = {
    id: entry.id,
    title: entry.title,
    moduleId: "algorithm",
    summary: sections[0].content.split("\n")[0],
    sections,
    keywords: entry.keywords,
    sourceIds: ["mdn-js", "mit-algorithms"],
    relatedLessonIds: entries.filter((e) => e.id !== entry.id).map((e) => e.id),
    collection: "algorithm-foundations",
    depth: "expanded",
    level: "基础",
    priority: "P1",
    provenance: "editorial",
    updatedAt: "2026-10-24",
    order: 200 + index,
    estimatedMinutes: 25,
    interview: {
      question: `学习“${entry.title}”后，如何解释其核心机制与适用前提？`,
      answer: sections
        .slice(1, 3)
        .map((s) => s.content)
        .join("\n\n"),
      rubric: entry.questions[0].rubric,
      scenario: `请设计一组能暴露“${entry.title}”常见误区的测试，并解释测试依据。`,
      scenarioAnswer: sections
        .slice(-2)
        .map((s) => s.content)
        .join("\n\n"),
    },
  };
  lessons.push(lesson);
  ex(
    entry.id,
    entry.title + " · 手推后运行",
    "先预测输出，再修改一处输入，检查你的状态与不变量解释是否成立。",
    entry.code,
    entry.logs,
    sections[1].content,
  );
  fill(
    entry.id,
    entry.fill.prompt,
    entry.fill.starter,
    entry.fill.solution,
    entry.fill.signature,
    entry.fill.tests,
    sections.at(-1).content,
    entry.fill.hint,
  );
  entry.questions.forEach((q, i) =>
    transferQuestions.push({
      ...q,
      id: `transfer-${entry.id}-${i + 1}`,
      lessonId: entry.id,
      moduleId: "algorithm",
      type: "scenario",
      pool: "transfer",
      priority: "P1",
      difficulty: "基础",
      keywords: entry.keywords,
      provenance: "editorial",
      technicalSourceIds: lesson.sourceIds,
    }),
  );
}
