function plan(stock) {
  return stock > 0
    ? ["check_stock", "create_draft", "review"]
    : ["check_stock", "report_unavailable"];
}
const initial = plan(3);
const observedStock = 0;
const revised = plan(observedStock);
console.log(initial);
console.log(revised);
console.log(revised.includes("create_draft"));
