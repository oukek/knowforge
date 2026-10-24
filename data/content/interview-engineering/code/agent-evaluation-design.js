const runs = [
 {correct:true,authorized:true,cost:2},
 {correct:true,authorized:false,cost:3},
 {correct:false,authorized:true,cost:1}
];
const success = runs.filter(r=>r.correct && r.authorized).length / runs.length;
console.log(success.toFixed(3));
console.log(runs.reduce((sum,r)=>sum+r.cost,0)/runs.length);
