import test from "node:test";
import assert from "node:assert/strict";
import { compareOutput, outputLineMatches } from "../shared/output.mjs";
import { parseOutputLiteral } from "../shared/output-literal.mjs";

test("数组接受单/双引号、混合引号、格式空格和末尾逗号", () => {
  for (const answer of ["['慢', '快']", '["慢", "快"]', "[ '慢', \"快\", ]"])
    assert(compareOutput(answer, ['["慢","快"]']).passed, answer);
});
test("对象接受单引号与未加引号的键，嵌套结构按内容比较", () => {
  const expected = JSON.stringify({
    用户: "慢",
    result: { ok: true, items: ["快", null] },
  });
  assert(
    outputLineMatches(
      "{result: {items: ['快', None,], ok: True}, 用户: '慢',}",
      expected,
    ),
  );
  assert(
    outputLineMatches(
      "{'a': 1, 'b': {'c': ['x', 2]}}",
      '{"b":{"c":["x",2]},"a":1}',
    ),
  );
});
test("Python True/False/None 与 JSON 对应值等价，字符串内部不替换", () => {
  assert(compareOutput("True\nFalse\nNone", ["true", "false", "null"]).passed);
  assert(outputLineMatches("['True', False, 'None']", '["True",false,"None"]'));
  assert(!outputLineMatches("['True']", "[true]"));
});
test("正确解析字符串内的引号、反斜杠、转义和 Unicode", () => {
  const expected = JSON.stringify([
    "O'Reilly",
    '说"快"',
    "C:\\temp",
    "\n",
    "慢",
    "😀",
  ]);
  assert(
    outputLineMatches(
      String.raw`['O\'Reilly', '说"快"', 'C:\\temp', '\n', '\u6162', '\U0001f600']`,
      expected,
    ),
  );
  assert(outputLineMatches('"it\'s"', JSON.stringify("it's")));
});
test("保留数组顺序、长度、数值/字符串及布尔值/字符串类型区别", () => {
  for (const [actual, expected] of [
    ["['快', '慢']", '["慢","快"]'],
    ["['慢']", '["慢","快"]'],
    ["['1']", "[1]"],
    ["['true']", "[true]"],
    ["'true'", "true"],
    ["['慢 快']", '["慢快"]'],
    ["{a: None}", '{"a":"None"}'],
  ])
    assert(!outputLineMatches(actual, expected), actual);
});
test("保留输出行数和顺序的约束", () => {
  assert(compareOutput("['慢','快']\r\nTrue", ['["慢","快"]', "true"]).passed);
  assert(!compareOutput("['慢','快']", ['["慢","快"]', "true"]).passed);
  assert(!compareOutput("True\n['慢','快']", ['["慢","快"]', "true"]).passed);
});
test("只解析数据，不执行表达式、函数、属性访问或解包", () => {
  const invalid = [
    "(()=>['慢','快'])()",
    "['慢','快'].reverse()",
    "[...['慢','快']]",
    "{['x']: 1}",
    "[1+1]",
    "[process.exit()]",
    "[undefined]",
    "[NaN]",
    "[1,,2]",
    "{'x':1,'x':2}",
    "['unterminated]",
    String.raw`['\q']`,
  ];
  for (const value of invalid)
    assert.throws(() => parseOutputLiteral(value), SyntaxError, value);
});
test("限制嵌套深度和输入长度，对象键不污染原型", () => {
  assert.throws(
    () => parseOutputLiteral("[".repeat(70) + "0" + "]".repeat(70)),
    SyntaxError,
  );
  assert.throws(() => parseOutputLiteral(" ".repeat(30001)), SyntaxError);
  const parsed = parseOutputLiteral(
    "{'__proto__': {'polluted': True}, constructor: 'data'}",
  );
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(parsed.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
});
