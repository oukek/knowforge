function causalMask(n) {
  return Array.from({ length: n }, (_, query) =>
    Array.from({ length: n }, (_, key) => (key <= query ? 0 : "-inf")),
  );
}
const mask = causalMask(4);
console.log(mask[1]);
console.log(mask[3]);
console.log({ pastVisible: mask[2][1] === 0, futureVisible: mask[1][2] === 0 });
