const calls = new Map();
function accept(event) {
  if (event.type === 'args') calls.set(event.id,(calls.get(event.id)||'')+event.delta);
  if (event.type === 'end') return JSON.parse(calls.get(event.id));
}
accept({type:'args',id:'t1',delta:'{"city":'});
accept({type:'args',id:'t1',delta:'"广州"}'});
console.log(accept({type:'end',id:'t1'}));
console.log({complete:'stop',limit:'length',tool:'tool_required'}.tool);
