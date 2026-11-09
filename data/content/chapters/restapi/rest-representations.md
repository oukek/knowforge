---
{"id":"rest-representations","moduleId":"restapi","title":"表示、Content-Type、Accept 与序列化契约","prerequisites":["rest-model","net-navigation"],"sources":["http-semantics","json-schema"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识表示、Content-Type、Accept 与序列化契约

表示是资源通过网络传输的具体形式，例如 JSON、图片或文本。Content-Type 说明当前正文是什么，Accept 表达客户端愿意接收什么；两者一个描述实际内容，一个表达协商偏好，不能互换。

序列化契约还包括字段类型、时间格式、金额单位和缺失值。服务端 Python 的大整数能正确保存，不代表浏览器 JavaScript 的 Number 也能无损接收。

## 边界类型与公开字段

对可能超过安全整数范围的 ID，常用字符串表达，客户端把它当标识而非参与算术。金额可以使用明确最小单位的整数或约定十进制字符串，日期带时区或明确 UTC 规则。null、字段缺失与空字符串应有不同且可解释的含义。

响应模型应使用公开字段白名单，不直接序列化数据库行或 ORM 对象。密码摘要、内部权限标记、上游密钥和运维字段不应因新增数据库列而自动泄露。嵌套对象同样需要裁剪，不能只检查最外层。

内容协商与压缩、语言等维度可能影响缓存，相关响应头应让缓存知道表示差异。错误类型或不支持的媒体类型应明确报告，不要猜测任意请求正文格式。序列化前后应验证数据仍符合契约，而不是只看 JSON 编码是否成功。

## 把机制放到一条完整路径中

```flow
资源序列化
定义表示｜确定媒体类型与字段语义
转换边界｜处理大整数金额时间与空值
裁剪字段｜只输出允许公开的数据
客户端验证｜确认解析后仍保持原意
```

## 配套代码：表示、Content-Type、Accept 与序列化契约：最小可验证示例

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

raw={'id':'9007199254740993','name':'A','password_hash':'private'}
public={key:raw[key] for key in ['id','name']}
show(public)
show(type(public['id']).__name__)
```

响应投影保留字符串 ID 并排除内部字段。字符串 ID 不自动保证授权，也不应参与数值运算；排序和查询必须按业务契约处理。真正的响应模型应由服务层控制，而不是让任意字典或模型输出直接成为公共 API。

## 从示例走向实际使用

准备跨语言往返样例：大 ID、金额、UTC 时间、null 与未知枚举。让前端实际解析后再比对，才能发现 Python 与 JavaScript 类型边界差异。

课内响应投影保留 id 与 name，展示内部对象和公开表示的区别。字段增加时仍应通过契约审查，而不是自动全量暴露。
