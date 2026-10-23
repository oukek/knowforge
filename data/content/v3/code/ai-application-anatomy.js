const transitions = {
  draft: { start: "running" },
  running: { review: "needs_review", fail: "failed", cancel: "cancelled" },
  needs_review: { commit: "completed", cancel: "cancelled" },
};
function next(state, event) {
  const target = transitions[state]?.[event];
  if (!target) throw Error("invalid transition");
  return target;
}
let state = "draft";
for (const event of ["start", "review", "commit"]) state = next(state, event);
console.log(state);
try {
  next("running", "socket_closed");
} catch (e) {
  console.log(e.message);
}
