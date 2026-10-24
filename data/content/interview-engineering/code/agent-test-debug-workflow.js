function buggyUnique(xs) { return xs.filter((x,i)=>xs.indexOf(x)!==i); }
const cases=[[],[1],[1,1],[1,2,1]];
for(const input of cases) {
 const actual=buggyUnique(input),expected=[...new Set(input)];
 if(JSON.stringify(actual)!==JSON.stringify(expected)) {
  console.log({input,actual,expected}); break;
 }
}
