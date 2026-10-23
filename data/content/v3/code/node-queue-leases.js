let token = 0;
const job = { owner: null, token: 0, status: "queued" };
function claim(owner) {
  job.owner = owner;
  job.token = ++token;
  job.status = "running";
  return token;
}
function complete(owner, t) {
  if (job.owner !== owner || job.token !== t) return false;
  job.status = "done";
  return true;
}
const old = claim("a");
const current = claim("b");
console.log([complete("a", old), complete("b", current)]);
console.log(job.status);
