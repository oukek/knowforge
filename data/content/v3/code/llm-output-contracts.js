function verify(result, maxRefund) {
  if (result.kind !== "completed") return result.kind;
  const d = result.data;
  if (
    !d ||
    Object.keys(d).sort().join(",") !== "amountCents,schemaVersion" ||
    d.schemaVersion !== 1 ||
    !Number.isSafeInteger(d.amountCents) ||
    d.amountCents < 0 ||
    d.amountCents > maxRefund
  )
    return "invalid";
  return "verified";
}
const cases = [
  { kind: "refused" },
  { kind: "incomplete" },
  { kind: "completed", data: { schemaVersion: 1, amountCents: "500" } },
  { kind: "completed", data: { schemaVersion: 1, amountCents: 501 } },
  { kind: "completed", data: { schemaVersion: 1, amountCents: 500 } },
];
console.log(cases.map((x) => verify(x, 500)));
