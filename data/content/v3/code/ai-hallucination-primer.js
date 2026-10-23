function decision(verdicts) {
  if (verdicts.includes("contradicted")) return "conflict";
  if (!verdicts.length || verdicts.some((v) => v !== "supported"))
    return "insufficient";
  return "answer";
}
console.log([
  decision(["supported"]),
  decision(["supported", "unknown"]),
  decision(["supported", "contradicted"]),
  decision([]),
]);
