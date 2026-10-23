function execute(tenant, call) {
  if (call.name !== "get_stock") throw Error("unknown tool");
  if (
    Object.keys(call.args).join(",") !== "sku" ||
    typeof call.args.sku !== "string"
  )
    throw Error("invalid args");
  const records = { "a:sku1": 3 };
  return {
    callId: call.id,
    value: records[tenant + ":" + call.args.sku] ?? null,
  };
}
console.log(
  execute("a", { id: "c1", name: "get_stock", args: { sku: "sku1" } }),
);
console.log(
  execute("b", { id: "c2", name: "get_stock", args: { sku: "sku1" } }),
);
try {
  execute("a", {
    id: "c3",
    name: "get_stock",
    args: { sku: "sku1", tenant: "b" },
  });
} catch (e) {
  console.log(e.message);
}
