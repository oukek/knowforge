const states = ["read", "classify", "approval", "write"];
function next(state, approved) {
  if (state === "approval" && !approved) return "rejected";
  return states[states.indexOf(state) + 1] ?? "done";
}
console.log([
  next("read", false),
  next("approval", false),
  next("approval", true),
]);
console.log({ sessionKey: ["tenant-a", "ticket-7"].join(":") });
