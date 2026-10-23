const order = { id: "o1", tenant: "a", paid: 500, refunded: 0, version: 1 };
const operations = new Map();
function submit(tenant, action, approval) {
  if (tenant !== order.tenant || action.orderId !== order.id)
    throw Error("not visible");
  const fingerprint = JSON.stringify([
    action.orderId,
    action.amountCents,
    action.expectedVersion,
  ]);
  const key = JSON.stringify([tenant, action.operationId]);
  const prior = operations.get(key);
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw Error("idempotency conflict");
    return { ...prior.receipt };
  }
  if (
    !approval.approved ||
    approval.tenant !== tenant ||
    approval.fingerprint !== fingerprint
  )
    throw Error("approval mismatch");
  if (action.expectedVersion !== order.version) throw Error("version conflict");
  if (
    !Number.isSafeInteger(action.amountCents) ||
    action.amountCents <= 0 ||
    action.amountCents > order.paid - order.refunded
  )
    throw Error("invalid amount");
  order.refunded += action.amountCents;
  order.version++;
  const receipt = {
    refundId: "r" + (operations.size + 1),
    amount: action.amountCents,
  };
  operations.set(key, { fingerprint, receipt });
  return { ...receipt };
}
const action = {
  operationId: "op1",
  orderId: "o1",
  amountCents: 200,
  expectedVersion: 1,
};
const approval = {
  approved: true,
  tenant: "a",
  fingerprint: JSON.stringify(["o1", 200, 1]),
};
console.log([
  submit("a", action, approval).amount,
  submit("a", action, approval).amount,
]);
console.log({ refunded: order.refunded, operations: operations.size });
try {
  submit("a", { ...action, operationId: "op2", amountCents: 100 }, approval);
} catch (e) {
  console.log(e.message);
}
