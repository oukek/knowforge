function apply(state, e) {
  if (e.generation !== state.generation) return state;
  const fingerprint = JSON.stringify([e.kind, e.text ?? ""]);
  if (e.seq <= state.seq) {
    if (state.seen[e.seq] !== fingerprint) throw Error("event conflict");
    return state;
  }
  if (e.seq !== state.seq + 1) throw Error("event gap");
  if (state.status !== "running") throw Error("already terminal");
  if (!["delta", "done"].includes(e.kind)) throw Error("unknown event");
  return {
    ...state,
    seq: e.seq,
    text: state.text + (e.kind === "delta" ? e.text : ""),
    status: e.kind === "done" ? "done" : "running",
    seen: { ...state.seen, [e.seq]: fingerprint },
  };
}
let state = { generation: "g2", seq: 0, text: "", status: "running", seen: {} };
const event = (seq, kind, text, generation = "g2") => ({
  seq,
  kind,
  text,
  generation,
});
state = apply(state, event(1, "delta", "你"));
state = apply(state, event(1, "delta", "你"));
try {
  apply(state, event(3, "delta", "!"));
} catch (e) {
  console.log(e.message);
}
state = apply(state, event(2, "delta", "好"));
state = apply(state, event(3, "done"));
state = apply(state, event(4, "delta", "旧", "g1"));
console.log({ text: state.text, seq: state.seq, status: state.status });
