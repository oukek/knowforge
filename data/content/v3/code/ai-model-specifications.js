function weightGB(parameters, bytesPerParameter) {
  return (parameters * bytesPerParameter) / 1e9;
}
console.log({
  fp16WeightGB: weightGB(8e9, 2),
  idealInt8WeightGB: weightGB(8e9, 1),
});
const moe = { totalParametersB: 40, activeParametersB: 8 };
console.log(moe);
function canFit(input, outputReserve, window) {
  return input + outputReserve <= window;
}
console.log([canFit(7000, 1000, 8192), canFit(7800, 1000, 8192)]);
