const layers = {
  API: "business interface",
  FunctionCalling: "model action protocol",
  MCP: "context/tool interoperability",
  Skill: "reusable instructions/resources",
  Framework: "orchestration runtime",
  A2A: "agent interoperability",
};
console.log(["API", "MCP", "Skill", "Framework"].map((x) => layers[x]));
console.log(layers.Unknown ?? "unknown");
