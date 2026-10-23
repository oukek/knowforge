const history = [
  "old search",
  "old draft",
  "recent question",
  "recent clarification",
];
const state = {
  goal: "book ticket",
  pending: "payment confirmation",
  operationIds: ["query-1"],
};
const input = { state, history: history.slice(-2) };
console.log(input.history);
console.log(input.state.pending);
console.log(input.state.operationIds);
