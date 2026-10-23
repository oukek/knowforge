function cacheKey(x) {
  return JSON.stringify([
    x.tenant,
    x.accessVersion,
    x.corpusVersion,
    x.promptVersion,
    x.question,
  ]);
}
const a = {
  tenant: "a",
  accessVersion: 1,
  corpusVersion: 7,
  promptVersion: 2,
  question: "可退吗",
};
console.log(cacheKey(a) === cacheKey({ ...a, tenant: "b" }));
console.log(cacheKey(a) === cacheKey({ ...a, accessVersion: 2 }));
console.log(cacheKey(a) === cacheKey({ ...a, corpusVersion: 8 }));
function readCached(entry, principal) {
  return entry.tenant === principal.tenant &&
    entry.accessVersion === principal.accessVersion
    ? entry.answer
    : null;
}
console.log(
  readCached({ ...a, answer: "旧答案" }, { tenant: "a", accessVersion: 2 }),
);
