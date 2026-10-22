import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDate,
  dateValue,
  monthDays,
  shiftMonth,
} from "../client/src/calendar.js";
test("日期解析拒绝溢出日期并正确处理闰年", () => {
  for (const invalid of [
    "",
    "2025-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "26-01-01",
  ])
    assert.equal(parseDate(invalid), null);
  assert.equal(dateValue(parseDate("2024-02-29")), "2024-02-29");
});
test("日历以周一开头，包含连续 42 天，正确跨年", () => {
  const days = monthDays(parseDate("2026-01-15"));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.equal(dateValue(days[0]), "2025-12-29");
  assert.equal(dateValue(days.at(-1)), "2026-02-08");
});
test("月份翻页保留日期，月末取目标月份最后一天", () => {
  assert.equal(dateValue(shiftMonth(parseDate("2024-01-31"), 1)), "2024-02-29");
  assert.equal(dateValue(shiftMonth(parseDate("2025-01-31"), 1)), "2025-02-28");
  assert.equal(
    dateValue(shiftMonth(parseDate("2026-01-31"), -1)),
    "2025-12-31",
  );
});
