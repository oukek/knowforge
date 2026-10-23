// Parse data only: never evaluate submitted JavaScript or Python expressions.
export function parseOutputLiteral(source) {
  if (typeof source !== "string" || source.length > 30000)
    throw new SyntaxError("输出字面量过长");
  let at = 0;
  const invalid = () => {
    throw new SyntaxError("不是支持的输出字面量");
  };
  const space = () => {
    while (at < source.length && /\s/u.test(source[at])) at++;
  };
  function string() {
    const quote = source[at++];
    let value = "";
    while (at < source.length) {
      const char = source[at++];
      if (char === quote) return value;
      if (char.charCodeAt(0) < 32) invalid();
      if (char !== "\\") {
        value += char;
        continue;
      }
      const escape = source[at++];
      const escapes = {
        "'": "'",
        '"': '"',
        "\\": "\\",
        "/": "/",
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        v: "\v",
      };
      if (Object.hasOwn(escapes, escape)) {
        value += escapes[escape];
        continue;
      }
      let digits;
      if (escape === "x") digits = 2;
      else if (escape === "u") digits = 4;
      else if (escape === "U") digits = 8;
      else invalid();
      const hex = source.slice(at, at + digits);
      if (hex.length !== digits || !/^[\da-f]+$/i.test(hex)) invalid();
      const code = Number.parseInt(hex, 16);
      if (code > 0x10ffff) invalid();
      value +=
        digits === 8 ? String.fromCodePoint(code) : String.fromCharCode(code);
      at += digits;
    }
    invalid();
  }
  function identifier() {
    const match = /^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*/u.exec(
      source.slice(at),
    );
    if (!match) invalid();
    at += match[0].length;
    return match[0];
  }
  function value(depth) {
    if (depth > 64) invalid();
    space();
    const char = source[at];
    if (char === "'" || char === '"') return string();
    if (char === "[") {
      at++;
      space();
      const items = [];
      if (source[at] === "]") {
        at++;
        return items;
      }
      while (at < source.length) {
        items.push(value(depth + 1));
        space();
        if (source[at] === "]") {
          at++;
          return items;
        }
        if (source[at++] !== ",") invalid();
        space();
        if (source[at] === "]") {
          at++;
          return items;
        }
      }
      invalid();
    }
    if (char === "{") {
      at++;
      space();
      const object = Object.create(null);
      if (source[at] === "}") {
        at++;
        return object;
      }
      while (at < source.length) {
        const key =
          source[at] === "'" || source[at] === '"' ? string() : identifier();
        space();
        if (source[at++] !== ":" || Object.hasOwn(object, key)) invalid();
        object[key] = value(depth + 1);
        space();
        if (source[at] === "}") {
          at++;
          return object;
        }
        if (source[at++] !== ",") invalid();
        space();
        if (source[at] === "}") {
          at++;
          return object;
        }
      }
      invalid();
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      source.slice(at),
    );
    if (number) {
      at += number[0].length;
      const parsed = Number(number[0]);
      if (!Number.isFinite(parsed)) invalid();
      return parsed;
    }
    const word = identifier();
    const literals = {
      true: true,
      false: false,
      null: null,
      True: true,
      False: false,
      None: null,
    };
    if (!Object.hasOwn(literals, word)) invalid();
    return literals[word];
  }
  const parsed = value(0);
  space();
  if (at !== source.length) invalid();
  return parsed;
}
