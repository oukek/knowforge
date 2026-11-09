---
{"id":"fullstack-contracts","moduleId":"restapi","title":"全栈契约：版本演进、验证与契约测试","prerequisites":["rest-model","net-navigation"],"sources":["fastapi-doc","sql-transaction"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识全栈契约

同一个字段会经过表单、JavaScript、JSON、后端语言和数据库，每一层的类型与精度可能不同。全栈契约让这些边界保持同一业务含义，而不是只在前后端各写一个同名 interface。

例如金额要求正整数最小单位，字符串 "100"、布尔 true、数字 100 与 1.5 不能未经说明全部转换成同一种合法值。跨语言自动转换可能隐藏错误。

## 一致验证与兼容发布

先定义网络表示，再定义各端内部类型与转换。大 ID 使用字符串避免 JavaScript 精度损失，金额明确单位与范围，日期明确时区，缺失与 null 分开。前端可以更早提示错误，但后端仍执行同样的可信边界验证。

共享 Schema 或生成类型减少重复定义，却不自动覆盖业务规则。Node 与 Python 对布尔、整数和空值的处理可能不同，需要一组相同测试样本在两端核对。错误结构也属于契约，字段路径与稳定错误码应保持可理解一致。

发布顺序先支持扩展，再迁移消费者，最后清理旧格式。契约测试应保存旧客户端的关键请求响应，避免重构后无意改变默认值或错误语义。数据库结构属于内部实现，但其约束与精度需要能够承载公开契约。

## 从同一字段的四种表示开始

网页输入框给出字符串，传输 JSON 有数字和 null，Python/TypeScript 的类型声明描述程序期望，数据库约束维护持久事实。TypeScript 编译通过不能证明网络响应符合类型；Python 类型注解也不会自动检查 JSON。运行时验证应放在外部数据进入可信领域的边界，后续内部代码使用已经校验和规范化的结构。

金额、日期和 ID 尤其容易出错：金额使用整数最小货币单位并声明币种，不能让每层随意 float 相加；64 位 ID 经过 JavaScript number 可能损失精度，应在 API 中定义为字符串；日期区分纯日历日期与带时区时间点，不能把生日先按 UTC 转换再截断。

## 一个可评审的错误契约

```json
{"error":{"code":"INVALID_AMOUNT","message":"金额必须为正整数分","fields":{"amount_cents":"positive integer required"},"request_id":"r-123"}}
```
前端按稳定 code 决定交互，不解析中文文案。认证失败、资源不存在、并发版本冲突、限流与内部错误应区分；不要把所有业务失败包在 HTTP 200，也不要把数据库堆栈直接返回用户。服务内部日志可通过 request_id 关联详细原因。

## Node 与 Python 端的对等验证

```typescript
import { z } from 'zod';
const CreateOrder = z.object({
  account_id: z.string().min(1),
  amount_cents: z.number().int().positive(),
  currency: z.enum(['CNY','USD'])
}).strict();
```
```python
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
class CreateOrder(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    account_id: str = Field(min_length=1)
    amount_cents: int = Field(gt=0)
    currency: Literal['CNY','USD']
```
这两段供本地安装依赖后运行。严格模式避免把字符串金额或 Python 的 bool 当作合法整数金额；验证通过还不等于当前账户有权限操作 account_id，认证主体与资源归属仍需在服务端检查。

## 兼容发布的顺序

服务端先接受新旧字段，前端再逐步迁移并监测旧字段使用量，最后停止旧路径。添加可选字段通常比删除字段安全，但封闭枚举、客户端 exhaustive switch、严格拒绝额外字段都可能使“添加”不兼容。数据库变更采用 expand/migrate/contract，先兼容两种读写，再迁移存量，最后收紧约束。

## 如何测试举一反三

把合法样例与边界样例存为共享 fixture，在 Node 和 Python 验证器上运行，特别测试 true、1.2、'100'、null、超大整数和多余字段。契约测试验证服务边界，端到端测试验证组合流程，二者不能互相代替。一次 mock 返回合法值并不能证明真实服务没有改字段；在发布流水线验证真实 schema 和消费者假设。

## 把机制放到一条完整路径中

```flow
全栈数据契约
定义语义｜明确单位精度空值与权限
网络表示｜选择跨语言可保真的格式
对等校验｜各端运行相同边界样例
兼容演进｜按消费者顺序发布并检查漂移
```

## 配套代码：全栈契约：版本演进、验证与契约测试

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

浏览器内的确定性实验，用于验证关键不变量。真实服务/SDK 完整示例见正文；不会连接模型或外部服务。

```javascript
const samples = [100, "100", true, 1.5, null];
function validAmount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
console.log(samples.map(validAmount));
console.log(Number("9007199254740993") === Number("9007199254740992"));
```

第一行显示输入字符串与数字不是同一契约，布尔值不能靠隐式转换成为金额。第二行揭示超出安全整数范围的两个 ID 经过 Number 后发生碰撞，因此 ID 不应仅因看起来是数字就定义成 number。

## 从示例走向实际使用

为关键字段建立合法与非法样例表，让前端、后端与数据库适配层共同验证。边界转换集中处理，避免每个页面各自 Number、parseInt 或宽松 bool 转换。

课内示例展示大整数转 Number 后可能失去区分能力。这个结果说明类型声明正确仍不够，序列化与运行时表示也必须符合业务要求。
