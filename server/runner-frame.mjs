import { randomBytes } from "node:crypto";

// Execute in the API origin so Workers keep their own restrictive CSP headers.
function bridge(origins) {
  let worker;
  addEventListener("message", (event) => {
    if (event.source !== parent || !origins.includes(event.origin) || worker)
      return;
    const { type, id, payload } = event.data || {};
    if (
      type !== "knowforge:run" ||
      typeof id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(id) ||
      !payload ||
      typeof payload !== "object"
    )
      return;
    const send = (data) =>
      parent.postMessage({ type: "knowforge:result", id, data }, event.origin);
    try {
      worker = new Worker(
        payload.language === "python" ? "/python-runner.js" : "/runner.js",
      );
      worker.onmessage = ({ data }) => send(data);
      worker.onerror = (error) => {
        error.preventDefault();
        send({ type: "done", error: "运行失败：" + error.message });
      };
      worker.postMessage(payload);
    } catch (error) {
      send({ type: "done", error: "无法启动执行：" + error.message });
    }
  });
  addEventListener("pagehide", () => worker?.terminate());
}

export function runnerFrame(origins) {
  const nonce = randomBytes(18).toString("base64");
  return {
    csp: `default-src 'none'; script-src 'nonce-${nonce}'; worker-src 'self'; frame-ancestors 'self' ${origins.join(" ")}; base-uri 'none'; form-action 'none'`,
    html: `<!doctype html><meta charset="utf-8"><title>KnowForge code runner</title><script nonce="${nonce}">(${bridge.toString()})(${JSON.stringify(origins).replaceAll("<", "\\u003c")});</script>`,
  };
}
