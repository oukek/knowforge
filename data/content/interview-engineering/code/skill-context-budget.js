const skills = [{id:'sql',tokens:40,score:0.9},{id:'web',tokens:80,score:0.8},{id:'log',tokens:30,score:0.7}];
let remaining=75;
const selected=[];
for(const skill of skills.sort((a,b)=>b.score-a.score)) {
  if(skill.tokens<=remaining) { selected.push(skill.id); remaining-=skill.tokens; }
}
console.log(selected);
console.log(remaining);
