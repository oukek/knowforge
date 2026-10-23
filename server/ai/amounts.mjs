import { AiError, inputBudget } from "./policy.mjs";
export const SCALE = 1000000n;
export const MAX = 1000000000n * SCALE;
export function micro(value, { signed = false, max = MAX } = {}) {
  const text = String(value ?? "");
  if (!(signed ? /^-?\d+(?:\.\d{1,6})?$/ : /^\d+(?:\.\d{1,6})?$/).test(text))
    throw new AiError(400, "额度必须是最多六位小数的有效数值");
  const negative = text.startsWith("-");
  const [whole, decimal = ""] = text.replace(/^-/, "").split(".");
  const result = BigInt(whole) * SCALE + BigInt(decimal.padEnd(6, "0"));
  if (result > max) throw new AiError(400, "额度超出允许范围");
  return negative ? -result : result;
}
export function points(value) {
  const n = BigInt(value ?? 0),
    negative = n < 0n,
    abs = negative ? -n : n;
  const fraction = String(abs % SCALE)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return (
    (negative ? "-" : "") +
    String(abs / SCALE) +
    (fraction ? "." + fraction : "")
  );
}
export const ceilDiv = (n, d) => (n + d - 1n) / d;
export function usageCharge(usage, rates) {
  return ceilDiv(
    BigInt(usage.input - usage.cached) * micro(rates.inputRate) +
      BigInt(usage.cached) * micro(rates.cachedRate) +
      BigInt(usage.output) * micro(rates.outputRate),
    1000n,
  );
}
export function quote(messages, rates, feature) {
  const input = inputBudget(messages);
  if (input > 40000)
    throw new AiError(
      400,
      "本次上下文超过输入预算，请缩短回答",
      "AI_INPUT_LIMIT",
    );
  const rate =
    micro(rates.inputRate) > micro(rates.cachedRate)
      ? rates.inputRate
      : rates.cachedRate;
  return usageCharge(
    { input, cached: 0, output: feature === "test" ? 512 : rates.outputLimit },
    { ...rates, inputRate: rate },
  );
}
export function procurementCost(usage, rate) {
  if (!usage || !rate) return null;
  return points(
    ceilDiv(
      BigInt(usage.input - usage.cached) * micro(rate.input) +
        BigInt(usage.cached) * micro(rate.cached) +
        BigInt(usage.output) * micro(rate.output),
      1000000n,
    ),
  );
}
