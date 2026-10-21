import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const unique = (rows, label) => {
  assert.equal(
    new Set(rows.map((x) => x.id)).size,
    rows.length,
    `${label} ID 重复`,
  );
};
for (const k of [
  "modules",
  "lessons",
  "questions",
  "labs",
  "sources",
  "corrections",
])
  unique(d[k], k);
const modules = new Set(d.modules.map((x) => x.id)),
  lessons = new Set(d.lessons.map((x) => x.id)),
  sources = new Set(d.sources.map((x) => x.id)),
  labs = new Set(d.labs.map((x) => x.id));
assert.equal(d.modules.length, 18);
for (const id of ["python", "crawler", "restapi", "llmapp"])
  assert(modules.has(id));
for (const track of d.tracks)
  assert(track.moduleIds.every((id) => modules.has(id)));
const exercises = d.lessons.flatMap((l) => l.exercises ?? []);
unique(exercises, "随堂练习");
for (const l of d.lessons) {
  assert(modules.has(l.moduleId));
  assert(l.summary.length > 30);
  assert(l.sections.length >= 3);
  assert(l.sections.every((s) => s.content.length > 50));
  assert(l.interview.scenarioAnswer.length > 50);
  assert(l.sourceIds.every((id) => sources.has(id)));
  assert(l.playground?.code.length > 20, `${l.id} 缺少可运行示例`);
  assert(["javascript", "python", "model"].includes(l.playground.runtime));
  assert(l.playground.expectedLogs.length > 0);
  assert(l.playground.description && l.playground.explanation);
  assert.equal(l.exercises.filter((e) => e.type === "output").length, 1);
  for (const exercise of l.exercises) {
    assert(exercise.prompt && exercise.explanation);
    if (exercise.type === "output") {
      assert.equal(exercise.code, l.playground.code);
      assert.deepEqual(exercise.expectedLogs, l.playground.expectedLogs);
    } else {
      assert.equal(exercise.type, "fill");
      assert(
        exercise.signature &&
          exercise.starter &&
          exercise.solution &&
          exercise.hint,
      );
      assert(exercise.tests.length > 0);
      assert(exercise.tests.every((t) => t.name && t.code));
    }
  }
}
for (const q of d.questions) {
  assert(lessons.has(q.lessonId));
  assert(modules.has(q.moduleId));
  assert(q.answer.length > 20);
  assert(q.rubric.length);
  if (q.type === "choice") {
    assert.equal(q.options.length, 4);
    assert(q.correct >= 0 && q.correct < 4);
  }
  if (q.type === "coding") assert(labs.has(q.labId));
}
for (const l of d.labs) {
  assert(lessons.has(l.lessonId));
  assert(l.tests.length >= 3);
  assert(l.solution.length > 80);
  assert(l.hints.length >= 3);
}
for (const c of d.corrections)
  assert(c.sourceIds.every((id) => sources.has(id)));
assert(
  d.modules.every(
    (m) =>
      d.lessons.filter((l) => l.moduleId === m.id).length === m.lessonCount,
  ),
);
console.log(
  `校验通过：${d.modules.length} 专题 / ${d.lessons.length} 知识点与运行示例 / ${exercises.length} 随堂练习 / ${d.questions.length} 题 / ${d.labs.length} 实验 / ${d.labs.reduce((s, l) => s + l.tests.length, 0)} 实验用例`,
);
