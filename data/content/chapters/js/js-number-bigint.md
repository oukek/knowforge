---
{"id":"js-number-bigint","moduleId":"js","title":"Number、BigInt 与位运算：整数编码的精度边界","prerequisites":["js-scope","js-closure"],"sources":["mdn-bigint"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Number、BigInt 与位运算

JavaScript的Number采用双精度浮点表示，不是任意长度十进制整数。它既表示整数也表示小数，但有有限精度；当整数超过安全整数范围，相邻整数可能映射到同一个表示。BigInt提供任意精度整数运算，却不能直接表示小数，也不能无条件与Number混算。

因此数据库长ID、金额和位掩码必须分别设计。ID常应作为字符串保持身份，金额可以用最小单位整数或十进制方案，位操作则要明确位宽。把所有输入先Number化，可能在校验前已经丢失信息。

## 安全整数、二进制小数和位运算

安全整数强调能精确区分相邻整数，不只是某个大数碰巧可表示。Number.isSafeInteger应在值仍有可靠来源时使用；若服务端把巨大ID作为JSON数字发送，浏览器解析时就可能舍入，之后再转字符串无法恢复原始ID。

二进制浮点对很多十进制分数只能近似表示，所以0.1加0.2的可观察结果不一定等于字面0.3。业务比较需要按领域定义容差或十进制规则，不能到处加一个固定epsilon掩盖问题。BigInt适合整数计数和精确整除，除法截断小数部分，转回Number前仍要检查范围。

常见Number位运算会把操作数转换到32位整数范围，移位数量也有相应规则；这会截断看似合法的大整数。BigInt位运算有不同类型要求，不应机械套用Number的无符号右移等行为。编码多字段时明确每段位数、符号与最大值，并验证编码解码往返。

## 三种限制必须分开

**Number 与 BigInt 都能表示数字，但适用范围和规则不同。** Number 使用浮点表示，能够精确区分的连续整数有上限；超过安全整数范围后，相邻整数可能得到相同的 Number。BigInt 使用任意精度整数，例如 9007199254740993n，可用于需要精确整数的场景。

Number 的常见位运算会先转换为 32 位整数，因此较大的安全整数也可能在移位时丢失高位。BigInt 和 Number 不可直接相加，必须按业务规则显式转换；JSON 默认也不能直接序列化 BigInt，接口需约定字符串等表示。

JavaScript Number 通常采用双精度浮点，安全整数范围可由 Number.MAX_SAFE_INTEGER 表示；Number 位运算通常按 32 位整数处理；BigInt 则支持任意精度整数运算，但不能和 Number 任意混算。三者不是同一限制。

某个 48 位整数仍可在安全范围内表示，但用 `<<` 操作 Number 可能截断。不要一看到“大于 32 位”就声称 Number 一定不精确，也不要因为 Number 能精确存储就认为所有位操作安全。

## 为编码定义契约

本课约定 IPv4 放高 32 位、端口放低 16 位，共使用 48 位。IPv4 必须四段十进制整数 0–255，端口是 0–65535 整数。是否接受前导零、空格和端口 0 由接口明确，本例拒绝 IPv4 段的非标准前导零形式。

| 层 | 约定 | 原因 |
|---|---|---|
| 输入 | 严格四段与端口范围 | 不让隐式转换掩盖非法值 |
| 内部 | BigInt 移位和掩码 | 对接 uint64 类型并便于扩展 |
| JSON | 十进制字符串 | 原生 JSON.stringify 不直接支持 BigInt |
| 解码 | 范围限制与往返 | 拒绝超出本布局的值 |

IPv6 不在此布局，不能简单截前 32 位；跨语言还要统一字节序和有符号约定。

## Number 与 BigInt 的取舍

如果完整契约只需 48 位，用经过验证的 Number 乘除也可以，不能声称必须 BigInt 才精确。选择 BigInt 是为了整数语义和 uint64 交换，仍要校验服务或数据库的范围。无界整数不等于接口接受任意大输入。

不要先转 Number 再转 BigInt 来处理超安全范围的十进制字符串，损失可能已发生；直接 BigInt 解析并验证。数据库大整数和日志输出也应保留字符串，不让前端自动转成不精确数。

## 验收与面试表达

测试最小值、最大值、边界相邻、非法输入，以及 decode(encode(x)) 与 encode(decode(n)) 的往返性质。可用独立参考计算核对字节顺序，不仅仅让一对互相带同样错误的函数验证对方。

面试先说明位布局和输入约定，再讨论精度与传输，最后给复杂度和测试。公开面经只出现题目主题时，不应补造原考试的编码布局；这里的细节是课程明确新增约定。

## 把机制放到一条完整路径中

```flow
选择数字表示
先确定业务含义｜ID、金额、计数或位字段
确认精度与范围｜浮点近似和安全整数边界
选择Number、BigInt或字符串｜转换必须显式且受校验
验证传输往返｜编码、JSON和数据库不得悄悄丢精度
```

## 配套代码：Number、BigInt 与位运算：整数编码的精度边界

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。



```javascript
function encode(ip, port) {
  const parts = ip.split(".");
  if (
    parts.length !== 4 ||
    parts.some(
      (s) =>
        !/^(0|[1-9]\d{0,2})$/.test(s) ||
        String(Number(s)) !== s ||
        Number(s) > 255,
    )
  )
    throw Error("invalid IPv4");
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw Error("invalid port");
  const address = parts.reduce((n, s) => (n << 8n) | BigInt(s), 0n);
  return (address << 16n) | BigInt(port);
}
function decode(value) {
  if (typeof value !== "bigint" || value < 0n || value >= 1n << 48n)
    throw Error("invalid packed value");
  const address = value >> 16n;
  const ip = [24n, 16n, 8n, 0n]
    .map((shift) => String((address >> shift) & 255n))
    .join(".");
  return { ip, port: Number(value & 65535n) };
}
console.log(decode(encode("127.0.0.1", 8080)));
console.log(encode("255.255.255.255", 65535).toString());
console.log({ numberShift: (2 ** 32) << 1, numberMultiply: 2 ** 32 * 2 });
```

此编码仅用 48 位，Number 存储仍可精确；问题示范的是 Number 的 32 位移位语义。BigInt 用字符串输出并不表示所有接口都支持任意整数。

## 从示例走向实际使用

接口契约写清长ID为字符串，金额单位为分或明确十进制字符串，分页游标作为不透明值传递。不要在日志和数据库驱动之间反复进行隐式数值转换。

测试安全边界两侧、负数、零、小数、极大输入和JSON往返。实际用例中的计数是否可能超过范围，应由数据规模推导，不以本地示例只有几十条记录为依据。
