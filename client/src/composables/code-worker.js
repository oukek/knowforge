import { API_ORIGIN } from "../api-config.js";

export function createCodeWorker(python, origin = API_ORIGIN) {
  if (!origin || origin === location.origin)
    return new Worker(python ? "/python-runner.js" : "/runner.js");
  const id = crypto.randomUUID();
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "代码隔离运行器";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.src = origin + "/runner-frame";
  let pending,
    ready = false,
    stopped = false;
  const channel = {
    onmessage: null,
    onerror: null,
    postMessage(payload) {
      pending = payload;
      send();
    },
    terminate() {
      stopped = true;
      window.removeEventListener("message", receive);
      frame.remove();
    },
  };
  function send() {
    if (!stopped && ready && pending) {
      frame.contentWindow.postMessage(
        { type: "knowforge:run", id, payload: pending },
        origin,
      );
      pending = null;
    }
  }
  function receive(event) {
    if (
      stopped ||
      event.origin !== origin ||
      event.source !== frame.contentWindow ||
      event.data?.type !== "knowforge:result" ||
      event.data.id !== id
    )
      return;
    channel.onmessage?.({ data: event.data.data });
  }
  frame.onload = () => {
    ready = true;
    send();
  };
  frame.onerror = () =>
    channel.onerror?.({ message: "无法连接代码运行服务", preventDefault() {} });
  window.addEventListener("message", receive);
  document.body.append(frame);
  return channel;
}
