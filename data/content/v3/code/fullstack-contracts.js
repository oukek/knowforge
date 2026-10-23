const samples = [100, "100", true, 1.5, null];
function validAmount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
console.log(samples.map(validAmount));
console.log(Number("9007199254740993") === Number("9007199254740992"));
