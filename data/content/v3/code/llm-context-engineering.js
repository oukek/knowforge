function pack(items, inputLimit, reserved) {
  const budget = inputLimit - reserved;
  const must = items.filter((x) => x.required);
  let used = must.reduce((sum, x) => sum + x.tokens, 0);
  if (used > budget) throw Error("required context exceeds budget");
  const chosen = [...must];
  for (const item of items
    .filter((x) => !x.required)
    .sort((a, b) => b.priority - a.priority)) {
    if (used + item.tokens <= budget) {
      chosen.push(item);
      used += item.tokens;
    }
  }
  return { ids: chosen.map((x) => x.id), used };
}
const items = [
  { id: "goal", tokens: 20, required: true },
  { id: "receipt", tokens: 15, required: true },
  { id: "evidence", tokens: 30, priority: 9 },
  { id: "debug", tokens: 50, priority: 1 },
];
console.log(pack(items, 100, 25));
try {
  pack(items, 40, 10);
} catch (e) {
  console.log(e.message);
}
