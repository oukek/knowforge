const balances = new Map([['A',100],['B',0]]);
const committed = [];
function transfer(from,to,amount,commit) {
  const changes = [[from,balances.get(from)-amount],[to,balances.get(to)+amount]];
  if (!commit) return;
  committed.push(changes);
  for (const [id,value] of changes) balances.set(id,value);
}
transfer('A','B',30,false);
console.log([...balances.values()]);
transfer('A','B',30,true);
const recovered = new Map([['A',100],['B',0]]);
for (const tx of committed) for (const [id,value] of tx) recovered.set(id,value);
console.log([...recovered.values()]);
