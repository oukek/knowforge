import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesQuestionSource } from "../shared/question-filters.mjs";
const data = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const handbook = readFileSync("docs/完整学习手册.md", "utf8");
test("AI 入门包含独立的二十四课、基本术语与递进关联", () => {
  const lessons = data.lessons.filter((l) => l.moduleId === "aibasics");
  assert.equal(lessons.length, 24);
  assert.equal(lessons[0].id, "ai-concept-map");
  assert(lessons.find((l) => l.id === "ai-llm-primer"));
  assert(lessons.find((l) => l.id === "ai-agent-primer"));
  assert(lessons.find((l) => l.id === "ai-rag-primer"));
  for (const lesson of lessons) {
    assert.equal(lesson.level, "入门", lesson.id);
    assert(lesson.sections.length >= 5, lesson.id);
    assert(
      lesson.sections.reduce((n, s) => n + s.content.length, 0) >= 900,
      lesson.id,
    );
    assert(lesson.relatedLessonIds.length >= 2, lesson.id);
    assert(lesson.playground.expectedLogs.length > 0, lesson.id);
    assert.equal(
      data.questions.filter(
        (q) =>
          q.lessonId === lesson.id &&
          q.provenance === "editorial" &&
          q.pool === "transfer",
      ).length,
      3,
      lesson.id,
    );
  }
  assert.equal(
    data.tracks.find((t) => t.id === "ai-from-zero").moduleIds[0],
    "aibasics",
  );
  assert.equal(
    data.lessons.filter((l) =>
      ["aibasics", "ai", "llmapp", "agents", "fde"].includes(l.moduleId),
    ).length,
    103,
  );
});
test("AI 词条具有中文解释、辨析与有效课程，离线手册保留全文", () => {
  assert.equal(data.glossary.length, 108);
  assert.equal(
    new Set(data.glossary.map((x) => x.term.toLowerCase())).size,
    data.glossary.length,
  );
  for (const term of data.glossary) {
    assert(
      term.chinese &&
        term.definition.length > 15 &&
        term.distinction.length > 10,
      term.term,
    );
    assert(
      data.lessons.some((l) => l.id === term.lessonId),
      term.term,
    );
    assert(
      handbook.includes(term.definition) && handbook.includes(term.distinction),
      term.term,
    );
  }
  for (const term of [
    "LLM",
    "Agent",
    "MCP",
    "RAG",
    "Token",
    "Embedding",
    "PPO",
    "GRPO",
  ])
    assert(
      data.glossary.some((x) => x.term === term),
      term,
    );
});
test("公开面经按来源改编，保留日期边界、参考依据与追问", () => {
  const questions = data.questions.filter(
    (q) => q.provenance === "public-report-adapted",
  );
  assert.equal(questions.length, 60);
  assert.equal(new Set(questions.map((q) => q.company)).size, 10);
  assert.equal(data.interviewSources.length, 9);
  for (const q of questions) {
    assert.equal(q.pool, "transfer");
    assert.equal(q.origin.kind, "public-report-adapted");
    assert(q.answer.length >= 140, q.id);
    assert(q.rubric.length >= 4 && q.followUps.length >= 2, q.id);
    for (const id of q.origin.sourceIds) {
      const s = data.interviewSources.find((s) => s.id === id);
      assert(s && s.companies.includes(q.company), q.id);
      assert(handbook.includes(s.url) && handbook.includes(s.dateNote), q.id);
    }
    assert(
      q.technicalSourceIds.every((id) => data.sources.some((s) => s.id === id)),
      q.id,
    );
  }
  for (const s of data.interviewSources) {
    assert.equal(s.kind, "interview-report");
    assert.notEqual(s.status, "verified");
    assert(s.dateNote && s.sourceType && s.url.startsWith("https://"));
    for (const date of [...s.interviewDates, s.publishedAt].filter(Boolean))
      assert(date <= s.checkedAt, s.id);
    assert(!("fullText" in s) && !("html" in s));
  }
  assert.equal(
    data.interviewSources.find((s) => s.id === "report-ant-edited")
      .interviewDates.length,
    0,
  );
  assert.equal(
    data.interviewSources.find((s) => s.id === "report-jd-sep").publishedAt,
    null,
  );
});
test("题目来源与公司筛选交集正确，不把原创题冒充公司题", () => {
  const publicQ = { provenance: "public-report-adapted", company: "腾讯" };
  const editorial = { provenance: "editorial" };
  assert(matchesQuestionSource(publicQ));
  assert(matchesQuestionSource(editorial));
  assert(matchesQuestionSource(publicQ, { origin: "public", company: "腾讯" }));
  assert(
    !matchesQuestionSource(publicQ, { origin: "public", company: "阿里巴巴" }),
  );
  assert(!matchesQuestionSource(editorial, { company: "腾讯" }));
  assert(!matchesQuestionSource(publicQ, { origin: "editorial" }));
  assert(matchesQuestionSource(editorial, { origin: "editorial" }));
  assert(!matchesQuestionSource(publicQ, { origin: "unknown" }));
  assert.equal(
    data.questions.filter((q) =>
      matchesQuestionSource(q, { origin: "public", company: "腾讯" }),
    ).length,
    6,
  );
});
