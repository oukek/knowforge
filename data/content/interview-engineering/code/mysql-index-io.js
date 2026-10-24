const secondary = [{ key: 'a', id: 81 }, { key: 'a', id: 2 }, { key: 'a', id: 41 }];
const pageOf = id => Math.floor(id / 10);
const cache = new Set([0, 8]);
const pages = secondary.map(row => pageOf(row.id));
console.log(pages);
console.log([...secondary].sort((a,b) => a.id-b.id).map(row => pageOf(row.id)));
console.log(pages.filter(page => !cache.has(page)).length);
console.log(secondary.map(({id}) => id));
