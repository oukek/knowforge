function lowerBound(a, t) {
  let l = 0,
    r = a.length;
  while (l < r) {
    const m = l + Math.floor((r - l) / 2);
    if (a[m] < t) l = m + 1;
    else r = m;
  }
  return l;
}
console.log([
  lowerBound([], 3),
  lowerBound([1, 2, 2, 4], 2),
  lowerBound([1, 2, 2, 4], 5),
]);
const coins = [1, 3, 4],
  dp = Array(7).fill(Infinity);
dp[0] = 0;
for (let i = 1; i <= 6; i++)
  for (const c of coins) if (i >= c) dp[i] = Math.min(dp[i], dp[i - c] + 1);
console.log(dp[6]);
