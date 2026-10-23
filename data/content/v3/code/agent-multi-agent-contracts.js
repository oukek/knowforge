function mergeFacts(groups) {
  const merged = new Map();
  for (const facts of groups)
    for (const f of facts) {
      const old = merged.get(f.id);
      if (old && (old.value !== f.value || old.version !== f.version))
        throw Error("fact conflict: " + f.id);
      merged.set(f.id, { ...f });
    }
  return [...merged.values()];
}
const a = [{ id: "price", value: 10, version: 1 }];
console.log(mergeFacts([a, a]).length);
try {
  mergeFacts([a, [{ id: "price", value: 12, version: 2 }]]);
} catch (e) {
  console.log(e.message);
}
console.log(a[0].value);
