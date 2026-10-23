const candidates = [
  { id: "cheap", schema: false, private: true, cost: 1 },
  { id: "fit", schema: true, private: true, cost: 3 },
  { id: "outside", schema: true, private: false, cost: 2 },
];
function select(rows) {
  return rows
    .filter((x) => x.schema && x.private)
    .sort((a, b) => a.cost - b.cost)
    .map((x) => x.id);
}
console.log(select(candidates));
console.log(candidates.length);
