function kvBytes({ layers, batch, tokens, heads, dim, bytes }) {
  return 2 * layers * batch * tokens * heads * dim * bytes;
}
const config = {
  layers: 32,
  batch: 1,
  tokens: 4096,
  heads: 8,
  dim: 128,
  bytes: 2,
};
console.log(kvBytes(config) / 1024 ** 2);
console.log(kvBytes({ ...config, batch: 8 }) / 1024 ** 3);
function softmax(xs) {
  const m = Math.max(...xs),
    weights = xs.map((x) => Math.exp(x - m));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((x) => x / total);
}
const weights = softmax([0, Math.log(3)]);
console.log(weights.map((x) => Number(x.toFixed(2))));
console.log(Number((weights[0] * 2 + weights[1] * 10).toFixed(6)));
