const sessions = new Map();
function append(tenant, user, text) {
  const key = tenant + ":" + user;
  const old = sessions.get(key) || [];
  sessions.set(key, [...old, text]);
}
append("a", "u1", "订单问题");
append("b", "u1", "工资问题");
console.log([...sessions.values()]);
console.log({
  handoff: "expert owns next step",
  tool: "manager resumes after result",
});
