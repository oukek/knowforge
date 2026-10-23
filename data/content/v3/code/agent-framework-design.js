const actions = [
  { tool: "lookup", args: { id: 7 } },
  { tool: "finish", args: { text: "已核对" } },
];
let steps = 0;
const events = [];
for (const action of actions) {
  if (++steps > 3) throw Error("step limit");
  if (!["lookup", "finish"].includes(action.tool)) throw Error("unknown tool");
  events.push(action.tool);
  if (action.tool === "finish") break;
}
console.log(events);
console.log({ steps, stopped: events.at(-1) === "finish" });
