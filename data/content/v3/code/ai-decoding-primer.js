function topP(probs, p) {
  if (!(p > 0 && p <= 1)) throw Error("invalid p");
  const ranked = probs
    .map((prob, id) => ({ prob, id }))
    .sort((a, b) => b.prob - a.prob || a.id - b.id);
  let total = 0;
  const ids = [];
  for (const item of ranked) {
    ids.push(item.id);
    total += item.prob;
    if (total >= p) break;
  }
  return ids;
}
console.log(topP([0.6, 0.25, 0.1, 0.05], 0.8));
console.log(topP([0.6, 0.25, 0.1, 0.05], 0.5));
console.log(topP([0.25, 0.25, 0.25, 0.25], 0.8));
