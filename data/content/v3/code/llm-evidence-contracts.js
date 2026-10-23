function eligible(claim, evidence, tenant, now, currentVersions) {
  return (
    claim.evidenceIds.length > 0 &&
    claim.evidenceIds.every((id) => {
      const e = evidence[id];
      return (
        e &&
        e.tenant === tenant &&
        now < e.validUntil &&
        e.version === currentVersions[e.sourceId]
      );
    })
  );
}
const docs = {
  good: { tenant: "a", sourceId: "p", version: 7, validUntil: 100 },
  other: { tenant: "b", sourceId: "p", version: 7, validUntil: 100 },
  old: { tenant: "a", sourceId: "p", version: 6, validUntil: 100 },
};
const check = (ids) =>
  Boolean(eligible({ evidenceIds: ids }, docs, "a", 50, { p: 7 }));
console.log(["good", "other", "old", "missing"].map((id) => check([id])));
console.log(check([]));
console.log("引用资格不等于语义支持");
