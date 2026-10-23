const docs = [
  { id: "refund", version: 2, terms: ["退货", "订单"] },
  { id: "shipping", version: 1, terms: ["物流", "配送"] },
];
function retrieve(terms) {
  return docs
    .map((d) => ({
      ...d,
      score: d.terms.filter((t) => terms.includes(t)).length,
    }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((d) => ({ id: d.id, version: d.version }));
}
console.log(retrieve(["订单", "退货"]));
console.log(retrieve(["天气"]));
