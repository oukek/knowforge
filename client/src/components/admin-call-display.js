export const number = (value, missing = "—") => {
  if (value === null || value === undefined) return missing;
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(String(value));
  if (match) {
    const fraction = (match[3] || "").replace(/0+$/, "");
    return (
      match[1] +
      BigInt(match[2]).toLocaleString("zh-CN") +
      (fraction ? "." + fraction : "")
    );
  }
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 6 });
};
export function sumCredits(rows, key) {
  const total = rows.reduce((sum, row) => {
    const value = row[key] || 0;
    const text = typeof value === "number" ? value.toFixed(6) : String(value);
    const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(text);
    if (!match) return sum;
    const units =
      BigInt(match[2]) * 1000000n + BigInt((match[3] || "").padEnd(6, "0"));
    return sum + (match[1] ? -units : units);
  }, 0n);
  const absolute = total < 0n ? -total : total;
  const fraction = String(absolute % 1000000n)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return (
    (total < 0n ? "-" : "") +
    String(absolute / 1000000n) +
    (fraction ? "." + fraction : "")
  );
}
export const shortId = (value) =>
  value ? `${value.slice(0, 8)}…${value.slice(-4)}` : "未关联用户";
export const runState = (run) =>
  ({
    running: ["处理中", "progress"],
    succeeded: ["已完成", "success"],
    released: ["未交付结果", "muted"],
    failed: ["调用失败", "danger"],
    pending: ["任务待核对", "warning"],
  })[run.status] || [run.status || "未知状态", "muted"];
export const billingState = (run) =>
  run.billingStatus === "pending"
    ? ["额度待核对", "warning"]
    : run.billingStatus === "reversed" || Number(run.refundedPoints) > 0
      ? ["已冲正", "muted"]
      : run.billingMode === "platform"
        ? ["平台调试", "muted"]
        : run.billingMode === "exempt"
          ? ["免费资格", "success"]
          : {
              settled: ["已结算", "success"],
              released: ["预占已释放", "muted"],
              reserved: ["额度预占中", "progress"],
            }[run.billingStatus] ||
            (run.status === "running"
              ? ["额度预占中", "progress"]
              : ["未结算", "muted"]);
export const awaitingCharge = (run) =>
  run.status === "running" ||
  run.billingStatus === "pending" ||
  run.chargedPoints == null;
