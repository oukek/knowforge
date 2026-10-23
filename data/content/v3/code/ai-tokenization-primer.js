function mergePair(tokens, left, right) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === left && tokens[i + 1] === right) {
      out.push(left + right);
      i++;
    } else out.push(tokens[i]);
  }
  return out;
}
const first = mergePair([..."lowlow"], "l", "o");
console.log(first);
console.log(mergePair(first, "lo", "w"));
console.log({
  jsLength: "你好".length,
  utf8Bytes: new TextEncoder().encode("你好").length,
});
