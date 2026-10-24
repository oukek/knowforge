import { readFileSync } from "node:fs";
import { labs } from "../labs.mjs";
import "./lessons.mjs";
import {
  ACM_JUDGE_VERSION,
  ACM_RANDOM_CASES,
} from "../../../shared/acm-cases.mjs";
const functionProblems = JSON.parse(
  readFileSync(new URL("./function-problems.json", import.meta.url), "utf8"),
);
for (const lab of labs)
  if (functionProblems[lab.id]) Object.assign(lab, functionProblems[lab.id]);
const entries = ["problems.json", "foundations.json"].flatMap((name) =>
  JSON.parse(readFileSync(new URL("./" + name, import.meta.url), "utf8")),
);
const categories = {
  "range-sum": "基础与数据结构",
  "lower-bound": "查找",
  "grid-bfs": "图与搜索",
  knapsack: "动态规划",
  lcs: "动态规划",
  "window-max": "基础与数据结构",
  histogram: "基础与数据结构",
  connectivity: "图与搜索",
  dijkstra: "图与搜索",
  mst: "图与搜索",
  fenwick: "基础与数据结构",
  kmp: "字符串",
  "meeting-rooms": "贪心",
  capacity: "查找",
  "dag-paths": "图与搜索",
  "tree-diameter": "图与搜索",
  tsp: "动态规划",
  "fast-fibonacci": "数学",
};
for (const entry of entries) {
  labs.push({
    ...entry,
    category:
      { greedy: "贪心", dp: "动态规划", sorting: "排序" }[entry.category] ||
      categories[entry.id.replace(/^acm-/, "")],
    judge: {
      version: ACM_JUDGE_VERSION,
      randomCases: ACM_RANDOM_CASES,
      stressCases: 1,
      caseCount: entry.tests.length + ACM_RANDOM_CASES + 1,
    },
    lessonId: ["acm-inversions", "acm-quickselect"].includes(entry.id)
      ? "algo-sorting-divide"
      : [
            "acm-partition",
            "acm-palindrome-subsequence",
            "acm-coin-combinations",
          ].includes(entry.id)
        ? "algo-dp-knapsack"
        : entry.lessonId,
    mode: "stdin",
    pool: "transfer",
    provenance: "editorial",
    signature: "function solve(input)",
    starter:
      'function solve(input) {\n  // input 是完整标准输入；返回要写入标准输出的字符串。\n  // 请先解析输入，再实现算法。\n  throw new Error("尚未实现");\n}\n\nconst input = require("node:fs").readFileSync(0, "utf8");\nprocess.stdout.write(String(solve(input)));',
    solution:
      entry.solution.trim() +
      '\n\nconst input = require("node:fs").readFileSync(0, "utf8");\nprocess.stdout.write(String(solve(input)));',
    timeLimitMs: 15000,
    caseTimeLimitMs: 3000,
  });
}
