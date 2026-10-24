const orders=[{id:1,tenant:'A',amount:10},{id:1,tenant:'B',amount:99}];
function findOrder(session,id) {
 return orders.find(row=>row.id===id&&row.tenant===session.tenant) ?? null;
}
console.log(findOrder({tenant:'A'},1));
console.log(findOrder({tenant:'C'},1));
