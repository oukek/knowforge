import { labs } from "../labs.mjs";
export const examples = new Map();
export const fills = new Map();
export function ex(
  id,
  title,
  description,
  code,
  expectedLogs,
  explanation,
  runtime = "javascript",
) {
  if (examples.has(id)) throw new Error("重复示例 " + id);
  examples.set(id, {
    id: "example-" + id,
    title,
    description,
    runtime,
    code: code.trim(),
    expectedLogs: expectedLogs.map(String),
    explanation,
  });
}
export function fromLab(
  id,
  labId,
  description,
  usage,
  expectedLogs,
  explanation,
) {
  const lab = labs.find((x) => x.id === labId);
  if (!lab) throw new Error("缺少参考实验 " + labId);
  ex(
    id,
    "把机制变成可运行函数",
    description,
    lab.solution + "\n\n" + usage,
    expectedLogs,
    explanation,
  );
}
export function fill(
  id,
  prompt,
  starter,
  solution,
  signature,
  tests,
  explanation,
  hint,
) {
  if (fills.has(id)) throw new Error("重复补全题 " + id);
  fills.set(id, {
    id: "fill-" + id,
    type: "fill",
    title: "补全代码",
    prompt,
    starter: starter.trim(),
    solution: solution.trim(),
    signature,
    tests: tests.map(([name, code]) => ({ name, code })),
    explanation,
    hint,
  });
}
