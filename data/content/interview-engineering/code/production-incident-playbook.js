const traces=[{queue:700,app:20,upstream:80},{queue:5,app:15,upstream:780}];
for(const trace of traces) {
 const entries=Object.entries(trace);
 const largest=entries.reduce((a,b)=>a[1]>b[1]?a:b);
 console.log({total:entries.reduce((s,[,v])=>s+v,0),bottleneck:largest[0]});
}
