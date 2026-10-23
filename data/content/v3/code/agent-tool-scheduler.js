async function executePlan(jobs, limit) {
  if (!Number.isInteger(limit) || limit < 1) throw Error("invalid limit");
  const ids = new Set(jobs.map((j) => j.id));
  if (
    ids.size !== jobs.length ||
    jobs.some((j) => j.deps.some((d) => !ids.has(d)))
  )
    throw Error("invalid dependency");
  const done = new Set(),
    waves = [];
  while (done.size < jobs.length) {
    const ready = jobs
      .filter((j) => !done.has(j.id) && j.deps.every((d) => done.has(d)))
      .slice(0, limit);
    if (!ready.length) throw Error("cyclic plan");
    waves.push(ready.map((j) => j.id));
    await Promise.all(ready.map((j) => j.run()));
    ready.forEach((j) => done.add(j.id));
  }
  return waves;
}
const run = async () => 1;
const jobs = [
  { id: "a", deps: [], run },
  { id: "b", deps: [], run },
  { id: "c", deps: ["a", "b"], run },
];
console.log(await executePlan(jobs, 2));
console.log(await executePlan(jobs, 1));
try {
  await executePlan([{ id: "a", deps: ["a"], run }], 2);
} catch (e) {
  console.log(e.message);
}
