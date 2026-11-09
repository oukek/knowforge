import { readFileSync, readdirSync } from "node:fs";
import { modules, lessons, sources, topic } from "../base.mjs";
import { examples } from "../examples/helpers.mjs";
const root = new URL("./", import.meta.url);
const assessments = JSON.parse(
  readFileSync(new URL("./assessments.json", import.meta.url), "utf8"),
);
export const chapters = new Map();
for (const directory of readdirSync(root, { withFileTypes: true }).filter(
  (entry) => entry.isDirectory(),
)) {
  for (const file of readdirSync(new URL(`${directory.name}/`, root))
    .filter((name) => name.endsWith(".md"))
    .sort()) {
    const text = readFileSync(
      new URL(`${directory.name}/${file}`, root),
      "utf8",
    );
    const match = text.match(/^---\n([^\n]+)\n---\n([\s\S]+)$/);
    if (!match) throw new Error(`课程文件缺少元数据：${file}`);
    const meta = JSON.parse(match[1]);
    const sections = match[2]
      .trim()
      .split(/^## /m)
      .filter(Boolean)
      .map((part, i) => {
        const end = part.indexOf("\n");
        return {
          title: part.slice(0, end),
          content: part.slice(end + 1).trim(),
          kind: i === 0 ? "chapter-introduction" : "chapter-body",
        };
      });
    if (chapters.has(meta.id)) throw new Error(`课程正文重复：${meta.id}`);
    if (sections.length < 4 || sections.some((s) => !s.title || !s.content))
      throw new Error(`教程没有展开：${file}`);
    chapters.set(meta.id, {
      ...meta,
      sections,
      body: match[2].trim(),
      file: `data/content/chapters/${directory.name}/${file}`,
    });
  }
}
export function registerChapters() {
  const framework = modules.find((m) => m.id === "framework");
  Object.assign(framework, {
    id: "vue",
    title: "Vue 专题",
    subtitle: "从模板、组件到响应式、编译和服务端渲染",
  });
  modules.push({
    id: "react",
    title: "React 专题",
    subtitle: "从组件与状态到调度、服务端和性能",
    icon: "Layers3",
    priority: "P1",
    color: "#4c829b",
    budget: 24,
    order: framework.order + 0.1,
  });
  modules.push({
    id: "go",
    title: "Go 语言与后端",
    subtitle: "基础语法、类型、并发、运行时与服务交付",
    icon: "Braces",
    priority: "P1",
    color: "#4a8790",
    budget: 30,
    order: modules.find((m) => m.id === "python").order + 0.1,
  });
  sources.push({
    id: "go-docs",
    title: "Go 官方文档与语言规范",
    url: "https://go.dev/doc/",
    scope: "语言、标准库、并发和工具链；具体行为按所用版本阅读",
    status: "verified",
    checkedAt: "2026-11-09",
  });
  for (const lesson of lessons)
    if (lesson.moduleId === "framework")
      lesson.moduleId = lesson.id.startsWith("react-") ? "react" : "vue";
  for (const chapter of chapters.values()) {
    let lesson = lessons.find((l) => l.id === chapter.id);
    if (!lesson) {
      if (!chapter.new) throw new Error(`重写正文找不到旧课程：${chapter.id}`);
      const intro = chapter.sections[0].content;
      const summary = chapter.summary || intro.split("\n\n")[0];
      topic(
        chapter.moduleId,
        chapter.id,
        chapter.title,
        summary,
        intro,
        chapter.sections[1].content.replaceAll("|", "／"),
        chapter.sections.at(-1).content.replaceAll("|", "／"),
        chapter.question ||
          `${chapter.title}：核心概念之间是什么关系，如何在实际程序里使用？`,
        chapter.scenario ||
          `围绕“${chapter.title}”，说明一个错误用法如何影响程序，并给出改进方法。`,
        chapter.sections.at(-1).content,
        chapter.keywords || chapter.title.replace(/[：、，]/g, " "),
        "",
        chapter.sources,
      );
      lesson = lessons.at(-1);
      const assessment = assessments[chapter.id];
      if (!assessment) throw new Error(`新课程缺少独立问答：${chapter.id}`);
      Object.assign(lesson.interview, {
        question: assessment.question,
        answer: assessment.answer,
        scenario: assessment.scenario,
        scenarioAnswer: assessment.answer,
        rubric: assessment.answer.split("。").filter(Boolean),
      });
      lesson.level =
        chapter.level ||
        (chapter.order < 0 || (chapter.language === "go" && chapter.order <= 6)
          ? "基础"
          : "进阶");
      const code =
        chapter.example ||
        (chapter.language === "go"
          ? chapter.body.match(/```go\n([\s\S]*?)```/)?.[1]
          : null);
      if (!code || !chapter.logs?.length)
        throw new Error(`新课缺少配套示例与预期：${chapter.id}`);
      examples.set(chapter.id, {
        id: `example-${chapter.id}`,
        title:
          chapter.exampleTitle ||
          (chapter.language === "go" ? "本地 Go 示例" : "配套机制实验"),
        description:
          chapter.exampleDescription ||
          "本段是独立的基础程序；完整项目上下文与进阶用法见正文。",
        code: code.trim(),
        expectedLogs: chapter.logs.map(String),
        explanation: chapter.exampleExplanation || chapter.exampleDescription || chapter.sections[1].content,
        language: chapter.language || "javascript",
        runtime:
          chapter.runtime ||
          (chapter.language === "go"
            ? "local"
            : chapter.language || "javascript"),
      });
    }
    lesson.chapterFile = chapter.file;
    if (chapter.title) lesson.title = chapter.title;
    if (chapter.order !== undefined) lesson.order = chapter.order;
  }
  modules.sort((a, b) => a.order - b.order);
}
export function attachChapters() {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  for (const chapter of chapters.values()) {
    const lesson = byId.get(chapter.id);
    lesson.interview.scenarioRubric ??= [lesson.interview.scenarioAnswer];
    lesson.sections = chapter.sections.map((section) => ({ ...section }));
    lesson.prerequisiteLessonIds = chapter.prerequisites || [];
    for (const id of lesson.prerequisiteLessonIds)
      if (!byId.has(id) || id === lesson.id)
        throw new Error(`先修关系错误：${lesson.id} → ${id}`);
    lesson.teachingRevision = "2026-11-09-textbook";
    lesson.teachingFormat = "chapter";
    lesson.updatedAt = "2026-11-09";
    lesson.estimatedMinutes = Math.max(
      15,
      Math.ceil(chapter.body.replace(/```[\s\S]*?```/g, "").length / 150) + 10,
    );
    lesson.understandingCheck ??= {
      question: lesson.interview.question,
      answer: lesson.interview.answer,
    };
  }
  // 同一专题先展示先修课，保留稳定 ID；跨专题的先修通过显式链接引导。
  for (const module of modules) {
    const ordered = [],
      done = new Set(),
      active = new Set();
    const visit = (lesson) => {
      if (done.has(lesson.id)) return;
      if (active.has(lesson.id))
        throw new Error(`课程顺序存在循环：${lesson.id}`);
      active.add(lesson.id);
      for (const id of lesson.prerequisiteLessonIds || []) {
        const prerequisite = byId.get(id);
        if (prerequisite?.moduleId === module.id) visit(prerequisite);
      }
      active.delete(lesson.id);
      done.add(lesson.id);
      ordered.push(lesson);
    };
    for (const lesson of lessons
      .filter((l) => l.moduleId === module.id)
      .sort((a, b) => a.order - b.order))
      visit(lesson);
    ordered.forEach((lesson, index) => {
      lesson.order = index + 1;
    });
  }
}
