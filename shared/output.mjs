export function sameJSON(a, b) {
  const pending = [[a, b]];
  while (pending.length) {
    const [left, right] = pending.pop();
    if (Object.is(left, right)) continue;
    if (
      left === null ||
      right === null ||
      typeof left !== "object" ||
      typeof right !== "object"
    )
      return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    if (Array.isArray(left) && left.length !== right.length) return false;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(right, key)) return false;
      pending.push([left[key], right[key]]);
    }
  }
  return true;
}
export function outputLineMatches(actual, expected) {
  if (actual === expected) return true;
  try {
    return sameJSON(parseOutputLiteral(actual), JSON.parse(expected));
  } catch {
    return false;
  }
}
export function compareOutput(answer, expectedLogs) {
  const text = String(answer).replace(/\r\n?/g, "\n").trim();
  const actual = text ? text.split("\n").map((line) => line.trim()) : [];
  const lines = Array.from(
    { length: Math.max(actual.length, expectedLogs.length) },
    (_, i) => ({
      actual: actual[i] ?? null,
      expected: expectedLogs[i] ?? null,
      passed:
        actual[i] !== undefined &&
        expectedLogs[i] !== undefined &&
        outputLineMatches(actual[i], String(expectedLogs[i]).trim()),
    }),
  );
  return {
    passed: lines.every((line) => line.passed),
    matched: lines.filter((line) => line.passed).length,
    total: lines.length,
    lines,
  };
}
import { parseOutputLiteral } from "./output-literal.mjs";
