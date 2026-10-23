const task = { start: 0, end: 100 };
const spans = [
  { tool: "search", start: 10, end: 70, cost: 2 },
  { tool: "policy", start: 20, end: 70, cost: 3 },
];
console.log({
  wallMs: task.end - task.start,
  workMs: spans.reduce((n, s) => n + s.end - s.start, 0),
  cost: spans.reduce((n, s) => n + s.cost, 0),
});
function safeEvent(event) {
  return {
    tool: event.tool,
    status: event.status,
    durationMs: event.durationMs,
  };
}
console.log(
  safeEvent({
    tool: "search",
    status: "ok",
    durationMs: 60,
    authorization: "secret",
    args: { email: "private" },
  }),
);
