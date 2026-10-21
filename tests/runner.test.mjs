import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const source = readFileSync("client/public/runner.js", "utf8");
for (const id of ["pool", "sse", "clone", "promise-lite"])
  test("实际 Worker 脚本协议：" + id, async () => {
    let result;
    const self = { postMessage: (x) => (result = x) };
    const context = vm.createContext({
      self,
      performance,
      setTimeout,
      clearTimeout,
      queueMicrotask,
    });
    vm.runInContext(source, context);
    const lab = catalog.labs.find((l) => l.id === id);
    await self.onmessage({
      data: { code: lab.solution, signature: lab.signature, tests: lab.tests },
    });
    assert.equal(result.error, undefined);
    assert(result.results.every((x) => x.passed));
    assert.equal(result.results.length, lab.tests.length);
  });
test("Worker 编译错误返回明确错误，不伪装通过", async () => {
  let result;
  const self = { postMessage: (x) => (result = x) };
  vm.runInNewContext(source, {
    self,
    performance,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  });
  await self.onmessage({
    data: { code: "function nope( {", signature: "function nope()", tests: [] },
  });
  assert.equal(typeof result.error, "string");
  assert.equal(result.results, undefined);
});
