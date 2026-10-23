const tools = { lookup: () => ({ stock: 3 }) };
const state = { fact: null, steps: 0 };
function policy(s) {
  return s.fact
    ? { kind: "final", answer: "stock=" + s.fact.stock }
    : { kind: "tool", name: "lookup" };
}
let result;
for (let i = 0; i < 3; i++) {
  state.steps++;
  const action = policy(state);
  if (action.kind === "final") {
    result = action.answer;
    break;
  }
  if (!Object.hasOwn(tools, action.name)) throw Error("unknown tool");
  state.fact = tools[action.name]();
}
if (!result) throw Error("step budget exhausted");
console.log(result);
console.log(state.steps);
