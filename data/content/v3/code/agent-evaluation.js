const runs = [
  { ok: true, cost: 2, unauthorized: 0 },
  { ok: false, cost: 3, unauthorized: 0 },
  { ok: true, cost: 1, unauthorized: 1 },
];
const success = runs.filter((r) => r.ok).length;
console.log({
  successRate: success / runs.length,
  costPerSuccess: runs.reduce((s, r) => s + r.cost, 0) / success,
});
console.log(runs.every((r) => r.unauthorized === 0) ? "release" : "block");
