import { AiError } from "./policy.mjs";

// Notifications only wake readers after a commit. The database remains the source
// of truth, including when the worker and SSE connection are on different PM2 workers.
export class AiRunEvents {
  constructor({
    pollMs = 2000,
    heartbeatMs = 15000,
    perUser = 6,
    max = 500,
  } = {}) {
    Object.assign(this, { pollMs, heartbeatMs, perUser, max });
    this.listeners = new Map();
    this.connections = new Set();
    this.users = new Map();
  }
  notify(id) {
    for (const listener of this.listeners.get(id) || []) listener();
  }
  async stream({ req, res, id, userId, load, authenticate }) {
    // Check ownership before sending headers or adding a subscription.
    await load();
    if (
      this.connections.size >= this.max ||
      (this.users.get(userId) || 0) >= this.perUser
    )
      throw new AiError(
        429,
        "实时连接过多，请关闭多余页面后重试",
        "AI_STREAM_LIMIT",
      );
    if (res.destroyed) return;
    let closed = false,
      reading = false,
      dirty = false,
      previous = "";
    let poll, heartbeat;
    const listeners = this.listeners.get(id) || new Set();
    this.listeners.set(id, listeners);
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(poll);
      clearInterval(heartbeat);
      listeners.delete(wake);
      if (!listeners.size) this.listeners.delete(id);
      this.connections.delete(close);
      const count = (this.users.get(userId) || 1) - 1;
      if (count) this.users.set(userId, count);
      else this.users.delete(userId);
      res.off("close", close);
      res.off("error", close);
      if (!res.destroyed && !res.writableEnded) res.end();
    };
    const write = (text) => {
      if (closed || res.destroyed) return false;
      res.write(text);
      if (res.writableLength > 1024 * 1024) {
        // A stalled client must not accumulate an unbounded result buffer.
        res.destroy();
        close();
        return false;
      }
      return true;
    };
    const fail = (error) => {
      write(
        `event: task-error\ndata: ${JSON.stringify({
          status: error instanceof AiError ? error.status : 503,
          code: error instanceof AiError ? error.code : "AI_STREAM_UNAVAILABLE",
          error:
            error instanceof AiError
              ? error.message
              : "状态连接暂不可用，正在恢复",
        })}\n\n`,
      );
      close();
    };
    const flush = async () => {
      dirty = true;
      if (reading || closed) return;
      reading = true;
      try {
        do {
          dirty = false;
          const run = await load();
          if (closed) return;
          const data = JSON.stringify(run);
          if (data !== previous) {
            if (!write(`event: run\ndata: ${data}\n\n`)) return;
            previous = data;
          }
          if (run.status !== "running") close();
        } while (dirty && !closed);
      } catch (error) {
        fail(error);
      } finally {
        reading = false;
      }
    };
    const wake = () => void flush();
    listeners.add(wake);
    this.connections.add(close);
    this.users.set(userId, (this.users.get(userId) || 0) + 1);
    res.on("close", close);
    res.on("error", close);
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    poll = setInterval(wake, this.pollMs);
    poll.unref?.();
    let checking = false;
    heartbeat = setInterval(async () => {
      if (closed || checking) return;
      checking = true;
      try {
        if (!(await authenticate()))
          throw new AiError(401, "登录已失效，请重新登录", "AI_STREAM_AUTH");
        write(": heartbeat\n\n");
      } catch (error) {
        fail(error);
      } finally {
        checking = false;
      }
    }, this.heartbeatMs);
    heartbeat.unref?.();
    // Subscribe before the second read, so a fast completion cannot be missed.
    await flush();
  }
  close() {
    for (const close of this.connections) close();
  }
}
