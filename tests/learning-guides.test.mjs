import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { learningGuides } from "../data/content/learning-guides.mjs";
import { extraLearningGuides } from "../data/content/learning-guides-extra.mjs";
import { platformLearningGuides } from "../data/content/learning-guides-platform.mjs";
import { reviewedGuides } from "../data/content/learning-guides-review.mjs";
import { advancedGuides } from "../data/content/learning-guides-advanced.mjs";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
test("入门解释与生成课程、面试答案保持同步，不覆盖示例和原有材料", () => {
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
    assert(lesson.sections[0].content.startsWith(learningGuides[id]), `${id} 内容未同步`);
    assert(lesson.interview.answer.startsWith(learningGuides[id]), `${id} 回答未同步`);
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
  const text = catalog.lessons.find((lesson) => lesson.id === "js-rate-limit").sections[0].content;
  for (const part of ["300ms", "500ms", "防抖", "节流", "leading", "trailing", "不能撤销已经执行", "| 对比 |"])
    assert(text.includes(part), `缺少 ${part}`);
});
