function remaining(deadline, now) {
  return Math.max(0, deadline - now);
}
const deadline = 800;
console.log([
  remaining(deadline, 70),
  remaining(deadline, 200),
  remaining(deadline, 900),
]);
const budget = { requestId: "r-1", deadline };
const propagated = {
  requestId: budget.requestId,
  timeout: remaining(budget.deadline, 200),
};
console.log(propagated);
