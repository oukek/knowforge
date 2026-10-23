import { readFileSync } from "node:fs";
import { lessons, sources } from "../base.mjs";
import { transferQuestions } from "../v3/index.mjs";
export const interviewSources = JSON.parse(
  readFileSync(new URL("./sources.json", import.meta.url), "utf8"),
);
sources.push(...interviewSources);
const rows = JSON.parse(
  readFileSync(new URL("./questions.json", import.meta.url), "utf8"),
);
for (const row of rows) {
  const lesson = lessons.find((l) => l.id === row.lessonId);
  if (!lesson)
    throw Error("Missing interview lesson: " + row.id + " -> " + row.lessonId);
  transferQuestions.push({
    ...row,
    moduleId: lesson.moduleId,
    pool: "transfer",
    priority: "P1",
    difficulty: "进阶",
    provenance: "public-report-adapted",
    technicalSourceIds: row.technicalSourceIds ?? lesson.sourceIds,
  });
}
