function route(candidates,highRisk=false) {
 const [first,second] = [...candidates].sort((a,b)=>b.score-a.score);
 if(first.score<0.8 || first.score-(second?.score||0)<0.15) return 'clarify';
 return highRisk ? 'confirm:'+first.intent : first.intent;
}
console.log(route([{intent:'search',score:0.9},{intent:'refund',score:0.85}]));
console.log(route([{intent:'refund',score:0.95},{intent:'search',score:0.3}],true));
