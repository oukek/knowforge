import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesQuestionSource } from "../shared/question-filters.mjs";
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const entries = JSON.parse(
  readFileSync("data/content/interview-engineering/entries.json", "utf8"),
);
test("22 条朋友原题完整收录，60 条推演有独立身份且关联原题与资料", () => {
  assert.equal(
    catalog.questions.filter((q) => q.provenance === "user-reported").length,
    22,
  );
  assert.equal(
    catalog.questions.filter((q) => q.provenance === "editorial-inference")
      .length,
    60,
  );
  for (const entry of entries) {
    const lesson = catalog.lessons.find((l) => l.id === entry.id);
    assert.equal(lesson.collection, "interview-engineering");
    assert(lesson.sections.length >= 8);
    assert(
      lesson.sections.reduce((n, s) => n + s.content.length, 0) > 1500,
      entry.id,
    );
    for (const prompt of entry.reported) {
      const q = catalog.questions.find((q) => q.prompt === prompt);
      assert.equal(q.provenance, "user-reported");
      assert(!q.company);
      assert(!q.origin.interviewDate);
      assert(lesson.sections.some((s) => s.content.includes(prompt)));
      assert(q.followUps.length === 3);
      assert(q.answer.length > 100);
    }
    for (const row of entry.followups) {
      const q = catalog.questions.find((q) => q.prompt === row.prompt);
      assert.equal(q.provenance, "editorial-inference");
      assert(
        q.origin.relatedQuestionIds.every((id) =>
          catalog.questions.some(
            (x) => x.id === id && x.provenance === "user-reported",
          ),
        ),
      );
    }
  }
});
test("朋友记录、推演与公开公司题筛选不混淆", () => {
  const friend = catalog.questions.find(
    (q) => q.provenance === "user-reported",
  );
  const inferred = catalog.questions.find(
    (q) => q.provenance === "editorial-inference",
  );
  assert(matchesQuestionSource(friend, { origin: "friend" }));
  assert(!matchesQuestionSource(friend, { origin: "editorial" }));
  assert(!matchesQuestionSource(friend, { origin: "public" }));
  assert(matchesQuestionSource(inferred, { origin: "inferred" }));
  assert(!matchesQuestionSource(inferred, { origin: "friend" }));
  assert(!matchesQuestionSource(friend, { company: "某公司" }));
});
