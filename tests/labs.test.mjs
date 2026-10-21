import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { labs } = JSON.parse(readFileSync("data/catalog.json", "utf8"));
for (const lab of labs)
  test(`参考实现：${lab.title}`, async (t) => {
    const name = lab.signature.match(/function\s+(\w+)/)[1];
    const fn = new Function(
      '"use strict";' + lab.solution + ";return " + name,
    )();
    for (const c of lab.tests)
      await t.test(c.name, async () => {
        await new Function(
          "fn",
          "assert",
          "equal",
          "delay",
          "return (async()=>{" + c.code + "})()",
        )(
          fn,
          (v, m) => assert.ok(v, m),
          (a, b) => assert.deepEqual(a, b),
          (ms) => new Promise((r) => setTimeout(r, ms)),
        );
      });
  });
