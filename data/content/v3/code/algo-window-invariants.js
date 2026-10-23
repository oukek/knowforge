function countSubarrays(nums, k) {
  const counts = new Map([[0, 1]]);
  let sum = 0,
    total = 0;
  for (const x of nums) {
    sum += x;
    total += counts.get(sum - k) ?? 0;
    counts.set(sum, (counts.get(sum) ?? 0) + 1);
  }
  return total;
}
console.log(countSubarrays([1, -1, 1], 1));
console.log(countSubarrays([0, 0, 0], 0));
