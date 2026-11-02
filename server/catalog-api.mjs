import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const pick = (value, fields) =>
  Object.fromEntries(
    fields
      .filter((field) => value[field] !== undefined)
      .map((field) => [field, value[field]]),
  );
const labels = {
  choice: "单选题",
  oral: "原理问答",
  scenario: "场景分析",
  coding: "代码实验",
};

// Full content is never placed in the index: detail responses are versioned and
// only materialized when the reader actually opens a lesson, question or lab.
export function createCatalogApi(catalog) {
  const fullBody = Buffer.from(JSON.stringify(catalog));
  const version = createHash("sha256").update(fullBody).digest("hex");
  const index = {
    ...catalog,
    summaryOnly: true,
    contentVersion: version,
    lessons: catalog.lessons.map((lesson) => ({
      ...pick(lesson, [
        "id",
        "moduleId",
        "title",
        "summary",
        "level",
        "priority",
        "estimatedMinutes",
        "keywords",
        "order",
        "depth",
        "collection",
        "series",
        "language",
        "updatedAt",
        "sourceIds",
        "relatedLessonIds",
      ]),
      exercises: (lesson.exercises || []).map((exercise) =>
        pick(exercise, ["id", "title", "type"]),
      ),
    })),
    questions: catalog.questions.map((question) =>
      pick(question, [
        "id",
        "lessonId",
        "moduleId",
        "type",
        "prompt",
        "priority",
        "keywords",
        "difficulty",
        "provenance",
        "pool",
        "company",
        "labId",
      ]),
    ),
    labs: catalog.labs.map((lab) =>
      pick(lab, [
        "id",
        "lessonId",
        "title",
        "prompt",
        "mode",
        "pool",
        "category",
        "difficulty",
        "moduleId",
        "priority",
        "judge",
      ]),
    ),
  };
  const byType = {
    lessons: new Map(catalog.lessons.map((item) => [item.id, item])),
    questions: new Map(catalog.questions.map((item) => [item.id, item])),
    labs: new Map(catalog.labs.map((item) => [item.id, item])),
  };
  const cache = new Map();
  function resource(key, value) {
    let found = cache.get(key);
    if (!found) {
      const body = Buffer.from(JSON.stringify(value));
      found = {
        body,
        gzip: gzipSync(body),
        etag: key === "full" ? `W/"${version}"` : `W/"${version}-${key}"`,
      };
      cache.set(key, found);
    }
    return found;
  }
  const full = resource("full", catalog);
  const indexResource = resource("index", index);
  const searchable = [
    ...catalog.lessons.map((item) => ({
      id: item.id,
      title: item.title,
      kind: "知识讲解",
      path: "/learn/" + item.id,
      haystack: [
        item.title,
        item.summary,
        ...item.keywords,
        ...item.sections.map((s) => s.content),
        item.playground?.code || "",
        ...(item.exercises || []).map((exercise) => exercise.prompt),
      ]
        .join(" ")
        .toLowerCase(),
    })),
    ...catalog.questions.map((item) => ({
      id: item.id,
      title: item.prompt,
      kind: labels[item.type],
      path:
        item.type === "coding" ? "/labs/" + item.labId : "/practice/" + item.id,
      haystack: [item.prompt, item.answer, ...item.keywords]
        .join(" ")
        .toLowerCase(),
    })),
  ];
  function send(req, res, data) {
    res.set({
      "Cache-Control": "private, no-cache",
      ETag: data.etag,
      "Content-Type": "application/json; charset=utf-8",
    });
    res.vary("Accept-Encoding");
    const gzip = !!req.acceptsEncodings("gzip");
    if (gzip) res.set("Content-Encoding", "gzip");
    const tags = String(req.get("If-None-Match") || "")
      .split(",")
      .map((tag) => tag.trim().replace(/^W\//, ""));
    if (tags.includes("*") || tags.includes(data.etag.replace(/^W\//, "")))
      return res.status(304).end();
    return res.send(gzip ? data.gzip : data.body);
  }
  function versionOk(req, res) {
    if (req.query.v !== undefined && req.query.v !== version) {
      res.status(409).json({
        code: "CATALOG_VERSION_CHANGED",
        error: "学习资料已更新，请重新加载后重试。",
      });
      return false;
    }
    return true;
  }
  return {
    version,
    full: (req, res) => send(req, res, full),
    index: (req, res) => send(req, res, indexResource),
    detail(req, res, type) {
      if (!versionOk(req, res)) return;
      const value = byType[type].get(req.params.id);
      if (!value) return res.status(404).json({ error: "资料不存在" });
      return send(req, res, resource(type + "-" + value.id, value));
    },
    batchQuestions(req, res) {
      if (!versionOk(req, res)) return;
      const raw = req.query.ids;
      if (typeof raw !== "string" || raw.length > 10000)
        return res.status(400).json({ error: "题目列表无效" });
      const ids = raw.split(",").filter(Boolean);
      if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length)
        return res
          .status(400)
          .json({ error: "每次需要 1 至 50 个不重复的题目" });
      const questions = ids.map((id) => byType.questions.get(id));
      if (questions.some((item) => !item))
        return res.status(404).json({ error: "部分题目不存在" });
      return res.json({ questions });
    },
    search(req, res) {
      if (!versionOk(req, res)) return;
      const input = req.query.q;
      if (typeof input !== "string" || input.length > 200)
        return res.status(400).json({ error: "搜索内容不能超过 200 字" });
      const text = input.trim().toLowerCase();
      const results = [];
      if (text)
        for (const item of searchable) {
          if (!item.haystack.includes(text)) continue;
          const { haystack, ...result } = item;
          results.push(result);
          if (results.length === 40) break;
        }
      return res.json({ results });
    },
  };
}
