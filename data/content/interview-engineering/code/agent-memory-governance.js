const memory=new Map();
function remember(key,value,source) {
 const old=memory.get(key);
 if(old?.source==='confirmed' && source!=='confirmed') return 'conflict_review';
 memory.set(key,{value,source}); return 'saved';
}
console.log(remember('u1:language','zh','confirmed'));
console.log(remember('u1:language','en','inferred'));
console.log(memory.get('u1:language').value);
