import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadPyodide } from "pyodide";
import { compareOutput } from "../shared/output.mjs";
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const initialized = loadPyodide();
for (const lesson of catalog.lessons.filter((l) => l.language === "python")) {
  test("Python 实例与输出：" + lesson.id, async () => {
    const py = await initialized,
      logs = [];
    py.setStdout({ batched: (text) => logs.push(text) });
    const scope = py.toPy({ __name__: "__main__" });
    try {
      await py.runPythonAsync(lesson.playground.code, { globals: scope });
    } finally {
      scope.destroy();
    }
    assert(
      compareOutput(logs.join("\n"), lesson.playground.expectedLogs).passed,
      JSON.stringify({ logs, expected: lesson.playground.expectedLogs }),
    );
  });
  for (const exercise of lesson.exercises.filter((e) => e.type === "fill")) {
    test("Python 补全参考解与反例：" + exercise.id, async () => {
      const py = await initialized;
      async function count(code) {
        const scope = py.toPy({ __name__: "__main__" });
        let passed = 0;
        try {
          await py.runPythonAsync(code, { globals: scope });
          for (const t of exercise.tests) {
            try {
              await py.runPythonAsync(t.code, { globals: scope });
              passed++;
            } catch {}
          }
        } finally {
          scope.destroy();
        }
        return passed;
      }
      assert.equal(await count(exercise.solution), exercise.tests.length);
      assert(
        (await count(exercise.starter)) < exercise.tests.length,
        "空实现不应通过所有用例",
      );
    });
  }
}
