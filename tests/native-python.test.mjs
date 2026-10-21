import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
test("本地 Python 全链路：两页采集、重复幂等、SQLite、分页 API 与来源检索", () => {
  const folder = mkdtempSync(join(tmpdir(), "knowforge-demo-"));
  try {
    const output = execFileSync(
      "python3",
      [
        "examples/python/workbench.py",
        "demo",
        "--db",
        join(folder, "demo.sqlite"),
      ],
      { encoding: "utf8", timeout: 15000 },
    );
    const result = JSON.parse(output);
    assert.equal(result.first_run.pages, 2);
    assert.equal(result.first_run.unique_articles, 3);
    assert.equal(result.repeat_run.unique_articles, 3);
    assert.equal(result.pagination_verified, true);
    assert.equal(result.retrieval_sources_verified, true);
    assert.equal(result.real_model_called, false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
