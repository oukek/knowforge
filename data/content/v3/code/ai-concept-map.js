function chooseApproach(task) {
  if (task.deterministic) return "rules";
  if (task.needsAction && task.dynamicSteps) return "agent";
  if (task.generatesContent) return "generation";
  return "prediction";
}
const tasks = [
  { deterministic: true },
  { generatesContent: false },
  { generatesContent: true },
  { needsAction: true, dynamicSteps: true },
];
console.log(tasks.map(chooseApproach));
console.log(["authorization", "validation", "audit"]);
