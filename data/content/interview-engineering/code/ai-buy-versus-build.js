const cost=(fixed,unit,volume)=>fixed+unit*volume;
for(const volume of [100,1000,10000]) {
 console.log({volume,buy:cost(100,2,volume),build:cost(3000,0.5,volume)});
}
