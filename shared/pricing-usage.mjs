export const DEFAULT_USAGE_MIX = Object.freeze({
  inputRatio: "15",
  outputRatio: "1",
  cacheHitPercent: "0",
});
export const USAGE_MIX_SOURCE = "https://openrouter.ai/state-of-ai/";
export function normalizeUsageMix(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("综合用量比例格式错误");
  if (Object.keys(input).some((key) => !Object.hasOwn(DEFAULT_USAGE_MIX, key)))
    throw Error("综合用量比例包含未知字段");
  const value = { ...DEFAULT_USAGE_MIX, ...input };
  const units = {};
  for (const [key, label] of [
    ["inputRatio", "总输入比例"],
    ["outputRatio", "输出比例"],
    ["cacheHitPercent", "缓存命中率"],
  ]) {
    const text = String(value[key] ?? "").trim();
    if (
      !["number", "string"].includes(typeof value[key]) ||
      !/^\d{1,7}(?:\.\d{1,6})?$/.test(text)
    )
      throw Error(label + "须为非负数，最多六位小数");
    const [whole, tail = ""] = text.split(".");
    units[key] = BigInt(whole) * 1000000n + BigInt(tail.padEnd(6, "0"));
    if (units[key] > (key === "cacheHitPercent" ? 100n : 1000000n) * 1000000n)
      throw Error(label + "超出范围");
    value[key] =
      String(BigInt(whole)) +
      (tail.replace(/0+$/, "") ? "." + tail.replace(/0+$/, "") : "");
  }
  if (units.inputRatio + units.outputRatio === 0n)
    throw Error("总输入和输出比例不能同时为 0");
  return value;
}
