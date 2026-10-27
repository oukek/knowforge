import { performance } from "node:perf_hooks";

// Node clamps longer delays to 1 ms, so schedule them in bounded chunks.
export function setLongTimeout(callback, delay, clock = {}) {
  const schedule = clock.setTimeout || setTimeout;
  const cancel = clock.clearTimeout || clearTimeout;
  const now = clock.now || (() => performance.now());
  const maxDelay = 2_147_483_647;
  let remaining = delay;
  let started = now();
  let timer;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const current = now();
    remaining -= Math.max(0, current - started);
    if (remaining <= 0) return callback();
    started = current;
    timer = schedule(tick, Math.min(remaining, maxDelay));
  };
  timer = schedule(tick, Math.min(Math.max(0, remaining), maxDelay));
  return () => {
    stopped = true;
    cancel(timer);
  };
}
