const tasks = [
  { minutesBefore: 5, minutesAfter: 2, accepted: true },
  { minutesBefore: 8, minutesAfter: 7, accepted: false },
  { minutesBefore: 4, minutesAfter: 2, accepted: true },
];
const saved = tasks
  .filter((t) => t.accepted)
  .reduce((sum, t) => sum + t.minutesBefore - t.minutesAfter, 0);
console.log({
  accepted: tasks.filter((t) => t.accepted).length,
  total: tasks.length,
  savedMinutes: saved,
});
console.log("draft generated is not business accepted");
