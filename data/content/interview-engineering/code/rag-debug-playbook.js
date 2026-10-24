function metrics(rows) {
  let recall=0,hits=0;
  for (const {gold,found} of rows) {
    const relevant = new Set(gold), top = new Set(found.slice(0,2));
    const count = [...top].filter(id=>relevant.has(id)).length;
    recall += count/relevant.size; hits += count>0;
  }
  return {recall:recall/rows.length,hit:hits/rows.length};
}
console.log(metrics([{gold:['a','b'],found:['a','x']},{gold:['c'],found:['c','d']}]));
console.log(metrics([{gold:['a','b'],found:['a','b']},{gold:['c'],found:['c','d']}]));
