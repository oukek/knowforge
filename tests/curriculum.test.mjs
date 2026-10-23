import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const data = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const normalize = (text) => text.replace(/\s|[，。？！、：；,.?!:;]/g, "");
test("离线学习手册包含全部独立迁移题及答案", () => {
  const handbook = readFileSync("docs/完整学习手册.md", "utf8");
  for (const question of data.questions.filter((q) => q.pool === "transfer")) {
    assert(handbook.includes(question.prompt), question.id);
    assert(handbook.includes(question.answer), question.id);
  }
});
test("迁移题不复制资料问答，也没有相同归一化题干", () => {
  const prompts = new Set();
  const transfer = data.questions.filter((q) => q.pool === "transfer");
  assert(transfer.length >= 110);
  for (const question of transfer) {
    const prompt = normalize(question.prompt);
    assert(!prompts.has(prompt), question.id);
    prompts.add(prompt);
    const lesson = data.lessons.find((l) => l.id === question.lessonId);
    assert(
      ![lesson.interview.question, lesson.interview.scenario]
        .map(normalize)
        .includes(prompt),
      question.id,
    );
    assert(
      question.rubric.length >= (question.type === "choice" ? 1 : 2),
      question.id,
    );
  }
});
test("新增深入专题具有机制、代码、边界、来源和关联练习", () => {
  const deep = data.lessons.filter((l) => l.depth === "deep");
  assert.equal(deep.length, 21);
  for (const lesson of deep) {
    assert(lesson.sections.length >= 5, lesson.id);
    assert(
      lesson.sections.reduce((n, s) => n + s.content.length, 0) > 1000,
      lesson.id,
    );
    assert(lesson.sourceIds.length > 0, lesson.id);
    assert(lesson.playground.code.length > 100, lesson.id);
    assert(
      data.questions.filter(
        (q) => q.lessonId === lesson.id && q.pool === "transfer",
      ).length >= 2,
      lesson.id,
    );
    assert(
      lesson.relatedLessonIds.every(
        (id) => data.lessons.some((l) => l.id === id) && id !== lesson.id,
      ),
    );
  }
  assert.equal(data.curriculum.expandedLessons, 13);
  assert.equal(data.labs.filter((l) => l.pool === "transfer").length, 12);
  for (const moduleId of [
    "agents",
    "fde",
    "node",
    "python",
    "restapi",
    "algorithm",
  ])
    assert(
      deep.some((l) => l.moduleId === moduleId),
      moduleId,
    );
});
