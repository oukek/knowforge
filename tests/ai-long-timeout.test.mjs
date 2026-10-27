import test from "node:test";
import assert from "node:assert/strict";
import { setLongTimeout } from "../server/ai/long-timeout.mjs";

test("超大超时分段执行，取消后不触发回调", () => {
  let now = 0,
    fired = 0;
  const timers = [];
  const clock = {
    now: () => now,
    setTimeout: (fn, delay) => {
      const timer = { fn, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      timer.cancelled = true;
    },
  };
  setLongTimeout(() => fired++, 2_147_483_747, clock);
  assert.equal(timers[0].delay, 2_147_483_647);
  now += timers[0].delay;
  timers[0].fn();
  assert.equal(fired, 0);
  assert.equal(timers[1].delay, 100);
  now += 100;
  timers[1].fn();
  assert.equal(fired, 1);
  const cancel = setLongTimeout(() => fired++, 3_000_000_000, clock);
  cancel();
  assert.equal(timers[2].cancelled, true);
  timers[2].fn();
  assert.equal(fired, 1);
});
