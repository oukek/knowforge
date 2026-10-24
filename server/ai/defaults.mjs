// Product defaults from the user's 2026-10-24 specification. Existing versions are never overwritten.
export const BILLING_DEFAULTS_VERSION = "knowforge-billing-defaults-1";
export const BILLING_DEFAULTS = Object.freeze({
  maxTaskPoints: "90",
  dailyBudget: "1000",
  pendingHours: 24,
});
// Internal reference value only: never display it as a purchase exchange rate or procurement cost.
export const INTERNAL_CNY_PER_CREDIT = "0.01";
export const DEFAULT_PRODUCTS = [
  ["lite", "轻量资源包", "9.90", "500", "轻量体验"],
  ["basic", "基础资源包", "21.90", "1200", "基础学习"],
  ["standard", "标准资源包", "34.90", "2000", "稳定练习"],
  ["advanced", "进阶资源包", "49.90", "3000", "进阶训练"],
  ["pro", "专业资源包", "79.90", "5000", "深度学习"],
  ["heavy", "重度资源包", "219.00", "15000", "持续训练"],
  ["enterprise", "企业资源包", "429.00", "30000", "大额额度"],
  ["flagship", "旗舰资源包", "699.00", "50000", "旗舰额度"],
].map(([code, name, price, credits, tag], sort) =>
  Object.freeze({
    code,
    name,
    price,
    credits,
    bonus: "0",
    validDays: 180,
    tag,
    sort,
    description:
      code === "enterprise"
        ? "大额个人学习额度，有效期 180 天，不含组织共享权益。"
        : "用于主观题 AI 评阅、举一反三与模拟面试，有效期 180 天。",
    note: "按用户提供的资源包规范初始化 v1；基础包已修正为 21.90 元。",
  }),
);
