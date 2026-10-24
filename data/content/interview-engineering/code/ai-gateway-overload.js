function admit(state, task) {
  if (state.active >= state.maxActive) return 'concurrency_full';
  if (state.reserved + task.tokens > state.tokenBudget) return 'token_budget';
  state.active++; state.reserved += task.tokens;
  return 'accepted';
}
const state = {active:0,maxActive:1,reserved:0,tokenBudget:100};
console.log(admit(state,{tokens:80}));
console.log(admit(state,{tokens:1}));
state.active--;
console.log(admit(state,{tokens:30}));
