import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { compareOutput } from "../shared/output.mjs";
const data = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const workerSource = readFileSync("client/public/runner.js", "utf8");
export async function execute(payload) {
  let result;
  const messages = [];
  const self = {
    postMessage: (value) => {
      messages.push(value);
      if (value.type === "done" || !value.type) result = value;
    },
  };
  const context = vm.createContext({
    self,
    performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    TextEncoder,
    TextDecoder,
    AbortController,
    crypto: webcrypto,
    URL,
  });
  vm.runInContext(workerSource, context);
  await self.onmessage({ data: payload });
  return { result, messages };
}
for (const lesson of data.lessons.filter((l) => l.language !== "python")) {
  test("知识点运行示例：" + lesson.id, async () => {
    assert(lesson.playground, "缺少示例");
    const { result } = await execute({
      mode: "snippet",
      code: lesson.playground.code,
    });
    assert.equal(result.error, undefined);
    const actual = Array.from(result.logs, (row) => row.text);
    assert.deepEqual(actual, lesson.playground.expectedLogs);
    assert(
      compareOutput(actual.join("\n"), lesson.playground.expectedLogs).passed,
    );
  });
  for (const exercise of lesson.exercises ?? []) {
    if (exercise.type === "fill")
      test("随堂补全参考解：" + exercise.id, async () => {
        const { result } = await execute({
          code: exercise.solution,
          signature: exercise.signature,
          tests: exercise.tests,
        });
        assert.equal(result.error, undefined);
        assert(
          result.results.every((row) => row.passed),
          JSON.stringify(result),
        );
      });
  }
}
test("输出判题容许 JSON 空格与键顺序，但不容许类型、顺序和缺行错误", () => {
  assert(
    compareOutput('{"b":2, "a":1}\r\ntrue\r\n', ['{"a":1,"b":2}', "true"])
      .passed,
  );
  assert(!compareOutput("false\n1", ["1", "false"]).passed);
  assert(!compareOutput("1", ["1", "2"]).passed);
  assert(!compareOutput('"1"', ["1"]).passed);
});
test("全部预测题的答案与运行示例一致，文本 true 不会被误判为字符串类型错误", () => {
  for (const lesson of data.lessons) {
    const exercise = lesson.exercises.find((item) => item.type === "output");
    assert.deepEqual(
      exercise.expectedLogs,
      lesson.playground.expectedLogs,
      lesson.id,
    );
    assert.equal(exercise.code, lesson.playground.code, lesson.id);
    assert(
      compareOutput(exercise.expectedLogs.join("\n"), exercise.expectedLogs)
        .passed,
      lesson.id,
    );
  }
  assert(compareOutput("true", ["true"]).passed);
  assert(compareOutput(" true\r\n", ["true"]).passed);
  assert(!compareOutput('"true"', ["true"]).passed);
  assert(!compareOutput("ture", ["true"]).passed);
  const missing = compareOutput("true", ["true", "null"]);
  assert.equal(missing.passed, false);
  assert.equal(missing.lines[0].passed, true);
  assert.equal(missing.lines[1].actual, null);
});
test("snippet 定时器、异步回调、实时日志与错误", async () => {
  const { result, messages } = await execute({
    mode: "snippet",
    code: "console.log('sync');setTimeout(async()=>{await Promise.resolve();console.log('later')},5);",
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(
    Array.from(result.logs, (x) => x.text),
    ["sync", "later"],
  );
  assert(messages.some((x) => x.type === "console"));
  const broken = await execute({
    mode: "snippet",
    code: "setTimeout(()=>{throw new Error('timer error')},1);",
  });
  assert.match(broken.result.error, /timer error/);
});
test("snippet 语法错误保留错误，不输出成功", async () => {
  const { result } = await execute({ mode: "snippet", code: "const =" });
  assert.match(result.error, /SyntaxError/);
});
