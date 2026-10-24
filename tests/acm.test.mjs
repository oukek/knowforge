import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const labs = catalog.labs.filter((l) => l.mode === "stdin");
const source = readFileSync("client/public/runner.js", "utf8");
async function execute(code, tests, extra = {}) {
  let result;
  const self = {
    postMessage: (r) => {
      if (r.type === "done") result = r;
    },
  };
  vm.runInNewContext(source, {
    self,
    performance,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  });
  await self.onmessage({ data: { mode: "stdin", code, tests, ...extra } });
  return result;
}
async function judge(id, cases) {
  const lab = labs.find((l) => l.id === "acm-" + id);
  const result = await execute(
    lab.solution,
    cases.map(([input, output], i) => ({
      name: "oracle " + i,
      input,
      output: String(output),
    })),
  );
  assert.equal(result.error, undefined);
  for (const row of result.results)
    assert(row.passed, JSON.stringify({ id, ...row }));
}
test("42 道 ACM 题具有格式、约束、解释，参考程序也可直接用真实 Node 标准输入运行", () => {
  assert.equal(labs.length, 42);
  for (const lab of labs) {
    assert(
      lab.inputFormat && lab.outputFormat && lab.constraints && lab.analysis,
    );
    assert(
      lab.samples.every(
        (s) => s.input && s.output !== undefined && s.explanation.length > 15,
      ),
    );
    assert(lab.tests.length >= 4);
    const sample = lab.samples[0];
    const result = spawnSync(process.execPath, ["-e", lab.solution], {
      input: sample.input,
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trimEnd(), sample.output.trimEnd(), lab.id);
  }
});
test("标准输出比较保留内容与行顺序，容许行尾空白；额外日志、错误和输出溢出不会通过", async () => {
  let r = await execute('process.stdout.write("1 2  \\r\\n3\\n\\n")', [
    { name: "whitespace", input: "", output: "1 2\n3" },
  ]);
  assert(r.results[0].passed);
  for (const code of [
    'console.log("2 1\\n3")',
    'console.log("debug");console.log("1 2\\n3")',
    'process.stdout.write(" 1 2\\n3")',
  ]) {
    r = await execute(code, [{ name: "wrong", input: "", output: "1 2\n3" }]);
    assert(!r.results[0].passed);
  }
  r = await execute('require("node:fs").readFileSync("/etc/passwd","utf8")', [
    { name: "file", input: "", output: "" },
  ]);
  assert(!r.results[0].passed);
  assert.match(r.results[0].error, /只支持读取标准输入/);
  r = await execute('process.stdout.write("x".repeat(4194305))', [
    { name: "overflow", input: "", output: "" },
  ]);
  assert(!r.results[0].passed);
  assert.match(r.results[0].error, /4 MiB/);
  r = await execute(
    'console.log(require("fs").readFileSync(0,"utf8"))',
    [{ name: "custom", input: "hello" }],
    { customInput: true },
  );
  assert.equal(r.returned, "hello\n");
});
let seed = 20261024;
function rand(n) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}
test("单调队列、柱状图、背包、容量二分和 KMP 对照独立小规模 oracle", async () => {
  const cases = {
    "window-max": [],
    histogram: [],
    knapsack: [],
    capacity: [],
    kmp: [],
  };
  for (let c = 0; c < 50; c++) {
    const n = 1 + rand(10),
      a = Array.from({ length: n }, () => rand(15)),
      k = 1 + rand(n);
    cases["window-max"].push([
      `${n} ${k}\n${a.join(" ")}`,
      Array.from({ length: n - k + 1 }, (_, i) =>
        Math.max(...a.slice(i, i + k)),
      ).join(" "),
    ]);
    let best = 0;
    for (let i = 0; i < n; i++)
      for (let j = i; j < n; j++)
        best = Math.max(best, Math.min(...a.slice(i, j + 1)) * (j - i + 1));
    cases.histogram.push([`${n}\n${a.join(" ")}`, best]);
    const count = 1 + rand(8),
      cap = 1 + rand(15),
      items = Array.from({ length: count }, () => [1 + rand(cap), rand(20)]);
    best = 0;
    for (let mask = 0; mask < 1 << count; mask++) {
      let w = 0,
        v = 0;
      for (let i = 0; i < count; i++)
        if (mask & (1 << i)) {
          w += items[i][0];
          v += items[i][1];
        }
      if (w <= cap) best = Math.max(best, v);
    }
    cases.knapsack.push([
      `${count} ${cap}\n${items.map((r) => r.join(" ")).join("\n")}`,
      best,
    ]);
    const weights = a.map((x) => x + 1),
      D = 1 + rand(n),
      sum = weights.reduce((s, v) => s + v, 0);
    let answer = sum;
    // Exhaust all contiguous cut partitions rather than copying the greedy feasibility proof.
    for (let mask = 0; mask < 1 << (n - 1); mask++) {
      let days = 1,
        load = weights[0],
        max = 0;
      for (let i = 1; i < n; i++) {
        if (mask & (1 << (i - 1))) {
          max = Math.max(max, load);
          load = 0;
          days++;
        }
        load += weights[i];
      }
      max = Math.max(max, load);
      if (days <= D) answer = Math.min(answer, max);
    }
    cases.capacity.push([`${n} ${D}\n${weights.join(" ")}`, answer]);
    const text = Array.from({ length: 1 + rand(25) }, () =>
        String.fromCharCode(97 + rand(3)),
      ).join(""),
      pattern = Array.from({ length: 1 + rand(6) }, () =>
        String.fromCharCode(97 + rand(3)),
      ).join(""),
      found = [];
    for (let i = 0; i + pattern.length <= text.length; i++)
      if (text.slice(i, i + pattern.length) === pattern) found.push(i + 1);
    cases.kmp.push([
      text + "\n" + pattern,
      found.length ? found.join(" ") : "-1",
    ]);
  }
  for (const [id, rows] of Object.entries(cases)) await judge(id, rows);
});
test("Dijkstra 对照 Floyd；状态压缩巡回对照全排列；快速倍增对照逐项递推", async () => {
  const shortest = [],
    tsp = [],
    fibs = [];
  for (let c = 0; c < 25; c++) {
    const n = 2 + rand(5),
      g = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
      ),
      edges = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (i !== j && rand(3) === 0) {
          const w = rand(10);
          g[i][j] = w;
          edges.push([i + 1, j + 1, w]);
        }
    for (let k = 0; k < n; k++)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          g[i][j] = Math.min(g[i][j], g[i][k] + g[k][j]);
    shortest.push([
      `${n} ${edges.length} 1\n${edges.map((r) => r.join(" ")).join("\n")}`,
      g[0].map((v) => (Number.isFinite(v) ? v : -1)).join(" "),
    ]);
    const matrix = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 0 : rand(20))),
    );
    let best = Infinity;
    function visit(path, cost) {
      if (path.length === n) {
        best = Math.min(best, cost + matrix[path.at(-1)][0]);
        return;
      }
      for (let v = 1; v < n; v++)
        if (!path.includes(v))
          visit([...path, v], cost + matrix[path.at(-1)][v]);
    }
    visit([0], 0);
    tsp.push([n + "\n" + matrix.map((r) => r.join(" ")).join("\n"), best]);
    const index = rand(200);
    let a = 0n,
      b = 1n;
    for (let i = 0; i < index; i++) [a, b] = [b, (a + b) % 1000000007n];
    fibs.push([String(index), String(a)]);
  }
  await judge("dijkstra", shortest);
  await judge("tsp", tsp);
  await judge("fast-fibonacci", fibs);
});
test("长链避免递归爆栈，大整数边界、重复匹配与线性窗口", async () => {
  const n = 20000;
  await judge("tree-diameter", [
    [
      n +
        "\n" +
        Array.from({ length: n - 1 }, (_, i) => `${i + 1} ${i + 2}`).join("\n"),
      n - 1,
    ],
  ]);
  await judge("window-max", [
    [`${n} ${n}\n${Array(n).fill(-5).join(" ")}`, -5],
  ]);
  await judge("histogram", [
    [`${n}\n${Array(n).fill(1000000000).join(" ")}`, n * 1000000000],
  ]);
  await judge("fast-fibonacci", [["1000000000000000000", "209783453"]]);
});

// These are the exact generated cases used by the browser submit flow.
import { generatedAcmCases, acmJudgeCount } from "../shared/acm-cases.mjs";
for (const lab of labs)
  test(`${lab.id} · 实际提交的随机对照和约束上限`, async () => {
    const generated = generatedAcmCases(lab.id);
    assert.equal(generated.length, 25);
    assert.equal(acmJudgeCount(lab), 29);
    assert.equal(lab.judge.caseCount, 29);
    const result = await execute(lab.solution, [...lab.tests, ...generated]);
    assert.equal(result.error, undefined);
    assert.equal(result.results.length, 29);
    for (const row of result.results)
      assert(row.passed, JSON.stringify({ lab: lab.id, ...row }));
  });

test("固定种子可复现；仅记住原四组答案的实现无法通过真实提交", async () => {
  const lab = labs.find((l) => l.id === "acm-activity");
  const a = generatedAcmCases(lab.id),
    b = generatedAcmCases(lab.id);
  assert.deepEqual(a, b);
  const answers = Object.fromEntries(
    lab.tests.map((c) => [c.input.trim(), c.output]),
  );
  const code = `const x=require('fs').readFileSync(0,'utf8').trim();process.stdout.write(String((${JSON.stringify(answers)})[x] ?? 'WRONG'));`;
  const result = await execute(code, [...lab.tests, ...a]);
  assert(result.results.slice(0, 4).every((r) => r.passed));
  assert(result.results.slice(4).some((r) => !r.passed));
  assert(result.results.find((r) => !r.passed).input !== undefined);
  assert(result.results.every((r) => (r.expected?.length || 0) <= 10000));
  assert(
    result.results.filter((r) => r.passed).every((r) => r.actual === undefined),
  );
});
