const before={implement:5,review:2,verify:2,rework:1};
const after={implement:2,review:3,verify:2,rework:3};
const total=x=>Object.values(x).reduce((sum,value)=>sum+value,0);
console.log(total(before));
console.log(total(after));
console.log(after.implement<before.implement && total(after)===total(before));
