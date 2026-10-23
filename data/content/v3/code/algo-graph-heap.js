function topo(n, edges) {
  const next = Array.from({ length: n }, () => []),
    degree = Array(n).fill(0);
  for (const [a, b] of edges) {
    next[a].push(b);
    degree[b]++;
  }
  const q = [];
  for (let i = 0; i < n; i++) if (!degree[i]) q.push(i);
  for (let head = 0; head < q.length; head++) {
    for (const b of next[q[head]]) if (--degree[b] === 0) q.push(b);
  }
  return q.length === n ? q : null;
}
console.log(
  topo(4, [
    [0, 1],
    [0, 2],
    [2, 3],
  ]),
);
console.log(
  topo(2, [
    [0, 1],
    [1, 0],
  ]),
);
