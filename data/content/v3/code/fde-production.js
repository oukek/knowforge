const transitions = {
  queued: ["running", "cancelled"],
  running: ["waiting_approval", "succeeded", "failed", "cancelled"],
  waiting_approval: ["running", "cancelled"],
};
function canMove(from, to) {
  return (transitions[from] ?? []).includes(to);
}
console.log([
  canMove("queued", "succeeded"),
  canMove("running", "waiting_approval"),
  canMove("waiting_approval", "running"),
]);
console.log({
  capacity: 10 * 3 * 2,
  meaning: "10 tasks x 3 tools x 2 attempts",
});
