import { readFileSync, writeFileSync } from "node:fs";
import { learningGuides } from "../data/content/learning-guides.mjs";

const catalog = JSON.parse(
  readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"),
);
const questionIds = new Set(catalog.questions.map((question) => question.id));
const sourceIds = new Set(catalog.sources.map((source) => source.id));
const inspect = (lesson) => {
  const sections = lesson.sections || [];
  const proseLength = sections.reduce((n, section) => n + (section.content || "").length, 0);
  const issues = [];
  if (!sections.length || sections.some((section) => !section.title || !section.content?.trim())) issues.push("正文为空");
  if (proseLength < 500) issues.push("短正文（需人工复核）");
  if (!lesson.playground?.code?.trim()) issues.push("缺可运行示例");
  if (!lesson.exercises?.length) issues.push("缺随堂练习");
  if (!lesson.interview?.question?.trim() || !lesson.interview?.answer?.trim() || !questionIds.has(`oral-${lesson.id}`)) issues.push("缺关联问答");
  if (!lesson.sourceIds?.length || lesson.sourceIds.some((id) => !sourceIds.has(id))) issues.push("来源待核对");
  return { id: lesson.id, title: lesson.title, proseLength, introductory: Object.hasOwn(learningGuides, lesson.id), issues };
};
const results = catalog.modules.map((module) => {
  const lessons = catalog.lessons.filter((lesson) => lesson.moduleId === module.id).map(inspect);
  return {
    id: module.id,
    title: module.title,
    total: lessons.length,
    introductory: lessons.filter((lesson) => lesson.introductory).length,
    short: lessons.filter((lesson) => lesson.proseLength < 500).map(({ id, title }) => ({ id, title })),
    lessons,
  };
});
if (process.argv.includes("--json")) console.log(JSON.stringify(results, null, 2));
else if (process.argv.includes("--write-report")) {
  const total = results.reduce((n, item) => n + item.total, 0);
  const guided = results.reduce((n, item) => n + item.introductory, 0);
  const issues = results.flatMap((module) => module.lessons.filter((lesson) => lesson.issues.length));
  const lines = [
    "# 学习资料检查清单", "",
    `共 ${total} 篇；其中 ${guided} 篇已加独立入门说明。构建时会将入门说明同步至课程和面试参考答案。`, "",
    "以下为基于生成数据的**自动结构检查**：正文是否为空或短于 500 字、是否有可运行示例、随堂练习、关联问答及可解析的来源 ID。短正文只是需要复核的信号，未发现结构问题也不证明内容准确、充分或已逐篇人工审定。", "",
    `当前有 ${issues.length} 篇触发上述至少一项检查。课程的技术细节、教学深度、来源时效和例题有效性仍需结合阅读及测试持续复核。`, "",
  ];
  for (const module of results) {
    lines.push(`## ${module.title}`, "", "| 课程 | 正文字数 | 独立入门说明 | 自动检查提示 |", "| --- | ---: | --- | --- |");
    for (const lesson of module.lessons) {
      const name = lesson.title.replaceAll("|", "\\|");
      lines.push(`| ${name}（${lesson.id}） | ${lesson.proseLength} | ${lesson.introductory ? "有" : "保留原有讲解"} | ${lesson.issues.join("、") || "无结构提示"} |`);
    }
    lines.push("");
  }
  writeFileSync(new URL("../docs/学习资料检查清单.md", import.meta.url), lines.join("\n"));
  console.log(`已检查 ${total} 篇课程，清单写入 docs/学习资料检查清单.md；${issues.length} 篇存在结构提示。`);
} else {
  console.log("课程排查（正文少于 500 字仅作为人工复核线索，不能证明课程质量）：");
  for (const module of results) {
    console.log(`${module.title}：${module.total} 篇，已补入门说明 ${module.introductory} 篇，待复核短课 ${module.short.length} 篇`);
    for (const lesson of module.lessons.filter((item) => item.issues.length))
      console.log(`  - ${lesson.id} ${lesson.title}：${lesson.issues.join("、")}`);
  }
}
