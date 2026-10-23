function allow(ctx, action, resource) {
  return (
    ["2026-07-28", "2025-11-25"].includes(ctx.version) &&
    ctx.aud === "ticket-mcp" &&
    ctx.scopes.includes(action) &&
    ctx.tenant === resource.tenant
  );
}
const ctx = {
  version: "2026-07-28",
  aud: "ticket-mcp",
  scopes: ["ticket:read"],
  tenant: "a",
};
const ticket = { tenant: "a" };
console.log(allow(ctx, "ticket:read", ticket));
console.log(allow({ ...ctx, aud: "other-api" }, "ticket:read", ticket));
console.log(allow(ctx, "ticket:write", ticket));
console.log(allow(ctx, "ticket:read", { tenant: "b" }));
console.log(allow({ ...ctx, version: "unknown" }, "ticket:read", ticket));
