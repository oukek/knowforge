const versions = [{commit:1,value:100},{commit:3,value:80}];
function read(view) { return versions.filter(v=>v.commit<=view).at(-1).value; }
const rrView = 1;
console.log(read(rrView));
console.log(read(rrView));
console.log(read(3));
console.log(versions.at(-1).value);
