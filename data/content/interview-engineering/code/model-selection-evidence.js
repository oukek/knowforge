const models=[{id:'cheap',region:'cn',schema:false,cost:1,success:0.7},{id:'fit',region:'cn',schema:true,cost:2,success:0.9},{id:'remote',region:'other',schema:true,cost:1,success:0.95}];
const eligible=models.filter(m=>m.region==='cn'&&m.schema);
eligible.sort((a,b)=>a.cost/a.success-b.cost/b.success);
console.log(eligible.map(m=>m.id));
console.log((eligible[0].cost/eligible[0].success).toFixed(2));
