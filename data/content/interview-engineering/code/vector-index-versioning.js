const doc={id:'policy',version:3,embedding:'e2'};
function publish(job) {
 if(job.version!==doc.version) return 'stale_document';
 if(job.embedding!==doc.embedding) return 'wrong_space';
 return 'published';
}
console.log(publish({version:2,embedding:'e2'}));
console.log(publish({version:3,embedding:'e1'}));
console.log(publish({version:3,embedding:'e2'}));
