const requests = new Map(),
  orders = [],
  outbox = [];
function create(tenant, key, body) {
  const scope = tenant + ":" + key,
    hash = JSON.stringify(body);
  if (requests.has(scope)) {
    const prior = requests.get(scope);
    if (prior.hash !== hash) throw Error("conflict");
    return prior.id;
  }
  const id = orders.length + 1;
  orders.push({ id, ...body });
  outbox.push({ id: "event-" + id, orderId: id });
  requests.set(scope, { hash, id });
  return id;
}
console.log([
  create("a", "k", { amount: 10 }),
  create("a", "k", { amount: 10 }),
]);
console.log({ orders: orders.length, events: outbox.length });
try {
  create("a", "k", { amount: 20 });
} catch (e) {
  console.log(e.message);
}
