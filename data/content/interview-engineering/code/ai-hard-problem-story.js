function reviewClaim(claim) {
 const required=['baseline','sampleSize','window','evidence'];
 return required.filter(key=>!claim[key]);
}
console.log(reviewClaim({baseline:'v1',sampleSize:100,window:'one-week',evidence:'frozen-eval'}));
console.log(reviewClaim({baseline:'v1'}));
