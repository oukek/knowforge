import test from "node:test";
import { execFileSync } from "node:child_process";
test("公开面经采集器遵守 robots、限制公开元数据并识别空壳页", () => {
  execFileSync(
    "python3",
    [
      "-m",
      "unittest",
      "discover",
      "-s",
      "tests/python",
      "-p",
      "test_interview_collector.py",
    ],
    { stdio: "pipe" },
  );
});
