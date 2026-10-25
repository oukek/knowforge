// Original prices and supplier discounts use six decimal places. Their product
// keeps all twelve decimal places; user credit charges are handled separately.
const SCALE = 1000000n;
const COST_SCALE = SCALE * SCALE;
export function costUnits(value) {
  const text = String(value ?? "");
  if (!/^\d+(?:\.\d{1,12})?$/.test(text))
    throw new Error("采购成本须为非负数，最多十二位小数");
  const [whole, tail = ""] = text.split(".");
  const units = BigInt(whole) * COST_SCALE + BigInt(tail.padEnd(12, "0"));
  if (units > 1000000000n * COST_SCALE) throw new Error("采购成本超出范围");
  return units;
}
function fromUnits(units) {
  const tail = String(units % COST_SCALE)
    .padStart(12, "0")
    .replace(/0+$/, "");
  return String(units / COST_SCALE) + (tail ? "." + tail : "");
}
export function normalizeCost(value) {
  return fromUnits(costUnits(value));
}
export function discountedPrice(original, discount) {
  const parse = (value) => {
    const text = String(value);
    if (!/^\d+(?:\.\d{1,6})?$/.test(text))
      throw new Error("原价和倍率最多六位小数");
    const [whole, tail = ""] = text.split(".");
    return BigInt(whole) * SCALE + BigInt(tail.padEnd(6, "0"));
  };
  const multiplier = parse(discount);
  if (multiplier > SCALE) throw new Error("上游优惠倍率须在 0～1 之间");
  return fromUnits(parse(original) * multiplier);
}
export function derivedProcurement(model) {
  if (model.costDiscount == null || !model.pricing) return {};
  return model.kind === "image"
    ? {
        procurement: null,
        imageProcurement: discountedPrice(
          model.pricing.perImage,
          model.costDiscount,
        ),
      }
    : {
        procurement: Object.fromEntries(
          ["input", "cached", "output"].map((key) => [
            key,
            discountedPrice(model.pricing[key], model.costDiscount),
          ]),
        ),
        imageProcurement: null,
      };
}
