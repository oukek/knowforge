import test from "node:test";
import assert from "node:assert/strict";
import {
  selectedTracks,
  plannedModules,
  plannedLessons,
} from "../shared/study-plan.mjs";
const tracks = [
  { id: "web", moduleIds: ["js", "network"] },
  { id: "api", moduleIds: ["network", "node"] },
];
test("多主线并集去重，保持选择优先次序和模块内顺序", () => {
  const lessons = [
    { id: "n2", moduleId: "node", order: 2 },
    { id: "js", moduleId: "js", order: 1 },
    { id: "net", moduleId: "network", order: 1 },
    { id: "n1", moduleId: "node", order: 1 },
    { id: "py", moduleId: "python", order: 1 },
  ];
  assert.deepEqual(plannedModules(["api", "web"], tracks), [
    "network",
    "node",
    "js",
  ]);
  assert.deepEqual(
    plannedLessons(lessons, ["api", "web"], tracks).map((l) => l.id),
    ["net", "n1", "n2", "js"],
  );
  assert.deepEqual(plannedLessons(lessons, [], tracks), []);
});
test("兼容旧单主线与 all，新数组优先，未知主线不扩大为全部专题", () => {
  assert.deepEqual(selectedTracks({ trackId: "web" }, tracks), ["web"]);
  assert.deepEqual(selectedTracks({ trackId: "all" }, tracks), ["web", "api"]);
  assert.deepEqual(
    selectedTracks(
      { trackId: "all", trackIds: ["api", "api", "unknown"] },
      tracks,
    ),
    ["api"],
  );
  assert.deepEqual(selectedTracks({}, tracks), []);
  assert.deepEqual(selectedTracks({ trackId: "deleted" }, tracks), []);
});
