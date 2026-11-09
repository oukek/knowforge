import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { learningGuides } from "../data/content/learning-guides.mjs";
import { extraLearningGuides } from "../data/content/learning-guides-extra.mjs";
import { platformLearningGuides } from "../data/content/learning-guides-platform.mjs";
import { reviewedGuides } from "../data/content/learning-guides-review.mjs";
import { advancedGuides } from "../data/content/learning-guides-advanced.mjs";
import { chapters } from "../data/content/chapters/index.mjs";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
test("旧入门材料由独立章节替换，面试答案独立组织，示例与练习不丢失", () => {
  const ids = Object.keys(learningGuides);
  assert(ids.length >= 220);
  assert(Object.keys(extraLearningGuides).every((id) => learningGuides[id].startsWith(extraLearningGuides[id])), "同一课程不可覆盖另一份入门说明");
  assert(Object.keys(platformLearningGuides).every((id) => learningGuides[id].startsWith(platformLearningGuides[id])), "同一课程不可覆盖另一份入门说明");
  assert(Object.keys(reviewedGuides).every((id) => learningGuides[id].startsWith(reviewedGuides[id])), "同一课程不可覆盖另一份入门说明");
  assert(Object.keys(advancedGuides).every((id) => learningGuides[id].startsWith(advancedGuides[id])), "同一课程不可覆盖另一份入门说明");
  for (const id of ids) {
    const lesson = catalog.lessons.find((item) => item.id === id);
    assert(lesson, `缺少课程 ${id}`);
    assert(learningGuides[id].length >= 200, `${id} 的说明过短`);
    assert.deepEqual(lesson.sections, chapters.get(id).sections, `${id} 未使用逐课正文`);
    assert(!lesson.interview.answer.startsWith(learningGuides[id]), `${id} 不应把完整教材复制为面试答案`);
    assert(lesson.playground?.code && lesson.exercises?.length, `${id} 缺少可运行示例或练习`);
    const oral = catalog.questions.find((q) => q.id === `oral-${id}`);
    assert.equal(oral.answer, lesson.interview.answer, `${id} 题库答案未同步`);
  }
});

test("课程检查清单覆盖每篇课程，并且标出没有来源的内容", () => {
  const report = JSON.parse(execFileSync(process.execPath, ["scripts/audit-lessons.mjs", "--json"], { encoding: "utf8" }));
  const lessons = report.flatMap((module) => module.lessons);
  assert.equal(lessons.length, catalog.lessons.length);
  assert.equal(new Set(lessons.map((lesson) => lesson.id)).size, catalog.lessons.length);
  for (const lesson of catalog.lessons) {
    const item = lessons.find((entry) => entry.id === lesson.id);
    assert(item, `检查清单遗漏 ${lesson.id}`);
    if (!lesson.sourceIds?.length) assert(item.issues.includes("来源待核对"));
  }
});

test("新增参考来源正确关联课程并保留原有来源", () => {
  for (const [lessonId, sourceId] of [
    ["study-review", "review-retrieval-study"],
    ["arch-tradeoff", "review-architecture-tradeoffs"],
    ["project-story", "review-harvard-interview"],
    ["project-incident", "ie-sre-troubleshoot"],
    ["project-refactor", "review-refactoring"],
    ["arch-crossplatform", "review-react-native"],
    ["arch-crossplatform", "review-flutter-architecture"],
    ["arch-platform", "review-platform-engineering"],
  ]) {
    const lesson = catalog.lessons.find((entry) => entry.id === lessonId);
    assert(lesson?.sourceIds.includes(sourceId), `${lessonId} 未关联 ${sourceId}`);
    assert(catalog.sources.some((source) => source.id === sourceId && source.url.startsWith("https://")));
  }
});

test("防抖与节流课解释时间线、末尾调用与取消的区别", () => {
  const text = catalog.lessons.find((lesson) => lesson.id === "js-rate-limit").sections.map(section => section.content).join("\n");
  for (const part of ["300ms", "500ms", "防抖", "节流", "leading", "trailing", "不能撤销已经执行"])
    assert(text.includes(part), `缺少 ${part}`);
  assert(/\|[^\n]*防抖[^\n]*节流[^\n]*\|/.test(text), "缺少两种时间行为的对比表");
});
