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
