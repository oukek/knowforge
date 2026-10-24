const transitions={created:['retrieving'],retrieving:['approval'],approval:['done','cancelled'],done:[],cancelled:[]};
function transition(state,next) {
 if(!transitions[state]?.includes(next)) throw new Error('invalid transition');
 return next;
}
let state=transition('created','retrieving');
state=transition(state,'approval');
console.log(state);
console.log(transition(state,'done'));
try { transition('created','done'); } catch(e) { console.log(e.message); }
