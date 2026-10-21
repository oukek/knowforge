import { unit as u } from "./common.mjs";
u("restapi", {
  id: "rest-model",
  title: "REST 约束、资源与 HTTP API 的边界",
  summary:
    "REST 是架构风格，不等于使用 JSON 或把数据库表映射成 CRUD。资源通过表示交互，客户端与服务器、无状态、缓存、统一接口和分层等约束共同决定系统性质。",
  mechanism:
    "资源是业务概念，表示是某次传输的数据形式。无状态指每个请求携带处理所需的会话上下文，不表示服务器不能存储业务数据。多数工程 API 采用部分 REST 思路，应说明取舍，不必把所有 HTTP+JSON 接口宣称完整 REST。",
  steps: [
    "先识别业务资源、状态和允许迁移，再定义 URI、方法和表示。",
    "把认证凭据、条件和追踪信息放入明确请求契约，避免依赖某台进程的隐式会话状态。",
    "设计缓存与分层边界，说明客户端如何发现后续动作及演进策略。",
  ],
  pitfalls: [
    "统一返回 200 加业务 code 会削弱 HTTP 通用语义与基础设施观测。",
    "无状态不等于每次都重新查询所有数据，也不意味着禁止数据库与缓存。",
  ],
  question: "REST 无状态是什么，为什么 HTTP+JSON 不自动等于 REST？",
  scenario: "服务扩容后用户请求被另一台机器处理就丢登录状态，如何调整？",
  answer:
    "先区分认证机制与业务数据，检查是否把会话只存进单进程内存。采用受控共享会话存储或经过验证的令牌，使每次请求能建立身份与权限，再处理令牌撤销和过期。避免把粘性会话当唯一扩容方案，并验证跨实例请求。",
  refs: ["http-semantics", "openapi"],
  model: true,
  code: String.raw`resources={'/articles/42':{'id':'42','title':'A'}}
representation=json.dumps(resources['/articles/42'],ensure_ascii=False)
show(json.loads(representation))
show('42' in resources['/articles/42'].values())`,
  logs: [{ id: "42", title: "A" }, true],
  explain:
    "资源由 URI 标识，本次 JSON 是其中一种表示；这个字典不是完整 HTTP 或 REST 实现。理解业务实体与传输表示的区别，能避免把数据库列直接暴露给客户端，或让模型返回内部字段成为公共契约。",
  choice: [
    "REST 无状态指？",
    [
      "服务器不能有数据库",
      "请求包含处理所需会话上下文",
      "不允许缓存",
      "只能用 JSON",
    ],
    1,
    "服务器可保存资源状态，无状态约束针对请求的会话上下文。",
  ],
});
u("restapi", {
  id: "rest-resources",
  title: "资源建模、URI 与状态迁移",
  summary:
    "URI 应围绕稳定业务资源设计，避免泄露数据库实现。集合、单体、关系和任务资源要分别建模；动作可表现为创建子资源或状态迁移，而不是强行把所有业务塞进字段更新。",
  mechanism:
    "GET /articles 查询集合，GET /articles/{id} 获取单体。POST /exports 创建导出任务，订单取消可建模为取消请求或受约束的状态迁移。嵌套资源应体现稳定归属，过深路径会增加耦合和权限判断复杂度。",
  steps: [
    "从业务用例找资源与状态机，给 ID、归属关系和可变字段明确规则。",
    "将过滤、排序和分页放在有文档的查询参数，集合与单体保持一致表示。",
    "为高影响迁移定义前置状态、权限、幂等和并发条件。",
  ],
  pitfalls: [
    "直接 PATCH status=paid 不应绕过支付凭证与业务校验。",
    "URI 不必逐层映射每个数据库关系，也不能因 ID 难猜就省略授权。",
  ],
  question: "如何将生成报告、取消订单等动作建模成 HTTP 资源？",
  scenario: "一个万能 /do 接口通过 action 参数处理几十种业务，怎样拆分？",
  answer:
    "先按业务资源和权限边界拆契约，保留有明确语义的集合、单体和任务资源。为每个迁移定义输入、前置状态和错误响应，逐步兼容旧接口并监测调用。不要只把动词改成名词而保持内部越权和状态混乱。",
  refs: ["http-semantics", "openapi"],
  model: true,
  code: String.raw`allowed={'draft':{'published','deleted'},'published':{'archived'},'archived':set()}
def can_move(old,new): return new in allowed.get(old,set())
show(can_move('draft','published'))
show(can_move('archived','published'))`,
  logs: [true, false],
  explain:
    "状态机验证迁移是否合法，但真实 API 还需验证身份、资源归属和版本。把允许迁移写出来，能让接口、测试和文档共享同一个业务边界，避免把任何字符串都接受为新状态。",
  choice: [
    "设计业务接口时应首先围绕？",
    [
      "数据库表名原样暴露",
      "业务资源与状态迁移",
      "所有操作都叫 /do",
      "随机路由字符串",
    ],
    1,
    "业务资源和迁移决定契约，存储结构可以独立演化。",
  ],
});
u("restapi", {
  id: "rest-methods",
  title: "HTTP 方法、安全性与幂等性",
  summary:
    "安全方法意图不改变资源状态，幂等方法指重复同一请求的预期效果与一次一致。幂等不要求每次响应体或状态码相同；POST 也可以通过业务设计获得幂等保障。",
  mechanism:
    "GET、HEAD 等具有安全语义；PUT 和 DELETE 具有幂等语义，PATCH 是否幂等取决于补丁操作。安全与幂等讨论的是请求意图，不代表服务器完全没有日志等附带行为。网络失败后的重试要结合方法与具体契约。",
  steps: [
    "按操作意图选择方法，读取不能借 GET 触发扣款或删除。",
    "PUT 明确完整替换或创建语义，PATCH 明确补丁格式与缺字段含义。",
    "为重试评估业务副作用和幂等键，不把 HTTP 方法名当作数据库自动保证。",
  ],
  pitfalls: [
    "DELETE 第一次 204 第二次 404 仍可符合幂等效果，因为最终资源不存在。",
    "PATCH 增量 +1 与设置值为 1 的重复效果不同，不能笼统说 PATCH 总是幂等。",
  ],
  question: "安全与幂等有什么区别，重复 DELETE 返回不同状态是否破坏幂等？",
  scenario: "客户端超时后重试订单创建产生两张订单，如何处理？",
  answer:
    "确认超时前远端可能已提交，不能仅靠重试按钮防重。给创建请求设计稳定幂等键，并在服务器原子绑定请求摘要和结果；同键不同参数返回冲突。客户端复用原键，查询任务状态，并记录未知最终状态的恢复路径。",
  refs: ["http-semantics"],
  model: true,
  code: String.raw`resource={'count':0}
for _ in range(2): resource['count']=1
show(resource['count'])
for _ in range(2): resource['count']+=1
show(resource['count'])`,
  logs: [1, 3],
  explain:
    "重复设置固定值与重复增量产生不同效果，说明 PATCH 的语义取决于操作。这个内存模型不执行 HTTP 请求，真实服务还要处理并发、原子提交与重复请求缓存，不能仅用最后的数值推断网络协议实现正确。",
  choice: [
    "幂等要求？",
    [
      "每次响应完全相同",
      "重复请求的预期效果与一次一致",
      "绝不记录日志",
      "所有 POST 都可任意重试",
    ],
    1,
    "幂等描述效果，不要求每次状态码和响应体都一致。",
  ],
});
u("restapi", {
  id: "rest-status",
  title: "状态码、Location 与异步接受",
  summary:
    "HTTP 状态码描述请求处理结果，应与响应体和操作语义一致。201 表示创建资源，202 表示接受但尚未完成，204 不携带内容；错误不应一律包成 200。",
  mechanism:
    "客户端根据状态类别进行缓存、重试和提示。401 通常对应认证要求，403 表示服务端拒绝权限，404 的使用也需考虑资源枚举策略。409 表示当前状态冲突，412 表示请求前置条件未满足；具体选择需形成统一契约。",
  steps: [
    "为每个操作列出成功、输入错误、认证、授权、冲突和依赖失败结果。",
    "创建返回资源标识与适当的 Location，异步接受返回可查询的任务资源。",
    "204 分支不发送 JSON body，重试与告警按状态和错误类别共同判断。",
  ],
  pitfalls: [
    "202 不代表后台任务一定成功，需要后续状态查询或通知。",
    "不要只根据是否抛异常决定 500，已知输入和业务冲突需要明确错误映射。",
  ],
  question: "201、202、204 有什么不同？",
  scenario: "导出接口立即返回 200 但用户下载空文件，应该怎样改契约？",
  answer:
    "若导出是异步任务，接受时返回 202 和任务查询地址，任务状态区分 queued、running、succeeded 和 failed。完成后再提供结果链接，并明确过期和失败原因。前端不能把接受请求当成任务完成，也需处理轮询退避和取消。",
  refs: ["http-semantics", "problem-details"],
  model: true,
  code: String.raw`def status(created=False,accepted=False,has_body=True):
    if accepted: return 202
    if created: return 201
    return 200 if has_body else 204
show([status(created=True),status(accepted=True),status(has_body=False)])`,
  logs: [[201, 202, 204]],
  explain:
    "函数演示状态语义的几个分支，不是所有 API 的统一状态机。真实实现还应匹配 Location、Content-Type、body 和缓存头；例如 204 不能再发送一个表示“成功”的 JSON 实体。",
  choice: [
    "202 的含义最准确的是？",
    [
      "业务一定完成",
      "请求被接受，处理可能尚未完成",
      "资源已永久删除",
      "客户端必须立刻无限重试",
    ],
    1,
    "需要独立任务状态或结果查询才能知道最终完成情况。",
  ],
});
u("restapi", {
  id: "rest-representations",
  title: "表示、Content-Type、Accept 与序列化契约",
  summary:
    "接口契约不仅是字段名，还包括媒体类型、编码、日期、精度与空值语义。Content-Type 描述当前请求或响应体，Accept 表达客户端可接受的响应类型。",
  mechanism:
    "同一资源可有 JSON、文件等不同表示。缺失字段、null 和空字符串可能表达不同含义；大整数跨 JavaScript 边界可能失精度。字段投影应避免把内部密码哈希、令牌和未授权属性直接序列化给客户端。",
  steps: [
    "规定日期带时区、金额单位、ID 类型与分页包装，建立跨语言样本。",
    "输入验证 Content-Type，输出按支持的表示返回正确媒体类型。",
    "使用显式响应模型投影字段，版本演进时检查客户端对未知字段的处理。",
  ],
  pitfalls: [
    "HTTP 头声明 JSON 不代表 body 一定合法，仍需语法与 schema 校验。",
    "自动序列化 ORM 实体可能触发额外查询或泄露内部字段。",
  ],
  question: "Accept 与 Content-Type 各表达什么，为什么 ID 常用字符串？",
  scenario: "后端返回超大整数 ID，浏览器显示末尾数字错误，怎么设计？",
  answer:
    "检查是否超过 JavaScript 安全整数范围，在公共契约中统一用字符串 ID，更新 OpenAPI 与客户端类型。测试序列化、存储和排序是否保留精确值。不要仅在 UI 加格式化掩盖底层已经发生的精度丢失。",
  refs: ["http-semantics", "json-schema"],
  code: String.raw`raw={'id':'9007199254740993','name':'A','password_hash':'private'}
public={key:raw[key] for key in ['id','name']}
show(public)
show(type(public['id']).__name__)`,
  logs: [{ id: "9007199254740993", name: "A" }, "str"],
  explain:
    "响应投影保留字符串 ID 并排除内部字段。字符串 ID 不自动保证授权，也不应参与数值运算；排序和查询必须按业务契约处理。真正的响应模型应由服务层控制，而不是让任意字典或模型输出直接成为公共 API。",
  choice: [
    "Content-Type 主要描述？",
    [
      "客户端可接受的所有响应",
      "当前消息体的媒体类型",
      "服务器 CPU 类型",
      "HTTP 方法",
    ],
    1,
    "Accept 表达偏好，Content-Type 描述实际消息体。",
  ],
});
u("restapi", {
  id: "rest-validation",
  title: "输入校验、字段白名单与边界转换",
  summary:
    "API 输入应在信任边界完成结构、类型、范围与业务规则校验。路径、查询、头和 body 都是不可信输入；模型或客户端的类型声明不能替代服务器验证。",
  mechanism:
    "语法解析、schema 校验、身份授权和业务不变量分开处理。未知字段策略影响兼容和 mass assignment 风险；PATCH 需要区别字段缺省与显式 null。验证错误要可定位但避免泄露内部结构和敏感值。",
  steps: [
    "限制请求体大小、字段长度、数组数量和数值范围，拒绝不符合契约的隐式转换。",
    "只允许可写字段进入领域更新，系统控制字段由服务器生成。",
    "在数据库层补唯一性与约束，避免把有竞态的业务条件只放在入口校验。",
  ],
  pitfalls: [
    "把整个请求字典直接 setattr 到 ORM 对象可能修改 role、owner_id 等敏感字段。",
    "仅做 schema 校验不能保证资源属于当前用户，也不能保证并发下余额不为负。",
  ],
  question: "为什么 schema 校验、授权和业务校验不能互相替代？",
  scenario: "用户提交 role=admin 后权限被提升，如何修复更新接口？",
  answer:
    "使用明确的可写字段白名单与单独权限管理操作，拒绝或忽略未知字段需形成一致契约。授权从服务器身份上下文取得，不接受 body 里的 owner 或 role 作为事实。补越权字段、不同身份和批量更新回归测试，并审计历史异常变更。",
  refs: ["json-schema", "fastapi"],
  code: String.raw`writable={'title','summary'}
payload={'title':'new','role':'admin','owner_id':'other'}
show({k:v for k,v in payload.items() if k in writable})`,
  logs: [{ title: "new" }],
  explain:
    "字段白名单阻止敏感字段进入更新集合，但不验证 title 类型或当前用户对资源的权限。生产接口应组合类型、范围、归属和并发检查；如果策略是拒绝未知字段，还应返回明确错误而不是静默忽略。",
  choice: [
    "防止 mass assignment 的核心措施是？",
    [
      "字段名越长越好",
      "服务器明确可写字段与授权边界",
      "只用 HTTPS",
      "给按钮隐藏 CSS",
    ],
    1,
    "HTTPS 保护传输，不能替代服务器字段与权限控制。",
  ],
  fill: {
    prompt: "只保留 allowed 中的字段，返回新字典且不修改 payload。",
    signature: "def project_fields(payload, allowed):",
    solution:
      "def project_fields(payload, allowed):\n    return {k:v for k,v in payload.items() if k in allowed}",
    tests: [
      [
        "敏感字段排除",
        "assert project_fields({'title':'A','role':'admin'},{'title'})=={'title':'A'}",
      ],
      [
        "不修改输入",
        "x={'x':1}; assert project_fields(x,set())=={} and x=={'x':1}",
      ],
    ],
    hint: "字典推导式构造新对象，按键白名单筛选。",
  },
});
u("restapi", {
  id: "rest-errors",
  title: "Problem Details 与稳定错误模型",
  summary:
    "错误响应应同时服务程序和用户。稳定的错误类型、HTTP 状态、简短说明与关联标识有助于自动处理；堆栈、SQL 和凭据不应暴露给调用方。",
  mechanism:
    "RFC 9457 定义 application/problem+json 及 type、title、status、detail、instance 等成员。扩展字段可提供输入位置或业务代码，但客户端应依赖稳定标识而不是解析自然语言文案；响应体 status 不能与实际 HTTP 状态矛盾。",
  steps: [
    "维护错误类型目录，把输入、权限、冲突、限流与内部依赖失败映射到稳定响应。",
    "用户说明避免内部敏感细节，日志用 request_id 关联完整诊断上下文。",
    "验证所有失败路径返回同类契约，网关与应用的错误也要兼容处理。",
  ],
  pitfalls: [
    "把异常 str 直接返回可能泄露数据库、路径、令牌与个人数据。",
    "每次改变 title 文案不应导致客户端判断失效，应使用稳定 type 或 code。",
  ],
  question: "Problem Details 解决什么问题，哪些字段可以供客户端稳定判断？",
  scenario:
    "客户端通过“错误信息包含余额不足”分支判断，文案修改后失效，怎样改？",
  answer:
    "定义稳定错误类型或业务 code，让文案仅用于展示；同时使用符合 HTTP 语义的状态码。加入契约测试保证错误标识、媒体类型和字段一致，用户拿 request_id 报障，服务器日志保留细节。逐步兼容旧客户端，避免突然改所有错误形状。",
  refs: ["problem-details"],
  model: true,
  code: String.raw`problem={'type':'https://example.test/problems/invalid-input','title':'Invalid input','status':400,'detail':'limit must be positive','instance':'urn:request:demo'}
show(problem['status'])
show(problem['type'].rsplit('/',1)[-1])`,
  logs: [400, "invalid-input"],
  explain:
    "示例给出错误表示的稳定类型和状态，但没有发送 HTTP 响应。真实服务要设置 application/problem+json，并确保实际状态为 400；instance 或 request_id 应避免暴露敏感内部路径，客户端不应解析 detail 的文字决定业务分支。",
  choice: [
    "客户端判断错误分支应优先依赖？",
    ["detail 的中文子串", "稳定 type/code 与状态", "堆栈第一行", "随机时间戳"],
    1,
    "展示文案可能变化，稳定错误标识应写入契约。",
  ],
});
u("restapi", {
  id: "rest-pagination",
  title: "分页、过滤、排序与稳定游标",
  summary:
    "集合接口需要约束结果大小并定义稳定排序。offset 分页易用但在数据变动时可能重复或跳过，cursor 分页更适合连续遍历，但需要绑定过滤条件和排序版本。",
  mechanism:
    "游标通常编码最后一个排序键及唯一 ID，可被签名防篡改，但 Base64 本身不是加密或授权。排序字段必须来自白名单，避免 SQL 注入；总数可能昂贵，也可能与分页查询不在同一个快照。",
  steps: [
    "限制 page_size，定义默认排序和唯一 tie-breaker，明确空页与 next_cursor。",
    "游标绑定租户、过滤条件和版本，对非法、过期或不匹配游标返回清晰错误。",
    "用并发新增删除场景测试分页一致性，按业务决定快照或最终一致。",
  ],
  pitfalls: [
    "只按 created_at 排序且大量时间相同，会使边界不稳定。",
    "可解码游标不等于可信任，解码后仍需校验权限与范围。",
  ],
  question: "什么时候选择 offset，什么时候选择 cursor？",
  scenario: "列表不断新增记录，翻到第二页出现第一页的条目，怎样改？",
  answer:
    "分析是否使用 offset 且没有快照，新增记录改变了偏移。改成带唯一 ID 的稳定排序和 cursor 边界，或提供快照会话。绑定过滤与身份范围，分页限制大小，客户端仍可按 ID 去重但不能把它当作服务器一致性的替代。",
  refs: ["http-semantics", "openapi"],
  model: true,
  code: String.raw`rows=[(10,1),(10,2),(11,1)]
after=(10,1)
page=[row for row in rows if row>after][:2]
show([list(x) for x in page])`,
  logs: [
    [
      [10, 2],
      [11, 1],
    ],
  ],
  explain:
    "用排序键与唯一 ID 组成稳定边界，避免相同时间戳被跳过。这里不涉及真实数据库快照或签名游标；实际查询必须与相同排序规则配套索引，且权限过滤在返回结果前执行。",
  choice: [
    "稳定分页排序通常还需要？",
    [
      "随机打乱",
      "唯一 ID 作为同值排序的 tie-breaker",
      "无限 page_size",
      "仅客户端去重",
    ],
    1,
    "唯一 tie-breaker 能稳定相同排序值的边界。",
  ],
});
u("restapi", {
  id: "rest-conditional",
  title: "缓存验证、ETag 与乐观并发控制",
  summary:
    "ETag 既可协助缓存验证，也可配合 If-Match 防止覆盖别人修改。缓存命中与写入前置条件是不同场景；读取 304 和写入 412 应有明确分支。",
  mechanism:
    "If-None-Match 常用于条件 GET，匹配时返回 304。If-Match 用于声明写入基于某个版本，条件失败可返回 412；检查版本与写入必须原子完成，否则仍可能 lost update。缓存键需考虑 Vary 和身份。",
  steps: [
    "服务端为表示或资源版本生成验证器，客户端保留并在更新时提交条件。",
    "在数据库 UPDATE ... WHERE version=? 中原子比较并递增版本。",
    "明确冲突后客户端刷新、合并或提示用户的行为，不无条件自动覆盖。",
  ],
  pitfalls: [
    "在客户端比较版本后再普通写入不能阻止服务器并发竞争。",
    "弱 ETag 与强比较的适用规则不同，不能任意用弱验证器充当写入版本锁。",
  ],
  question: "If-None-Match 与 If-Match 的用途有什么区别？",
  scenario: "两个人同时编辑文章，后提交的人覆盖了先提交修改，如何避免？",
  answer:
    "读取时返回版本或强验证器，更新时要求 If-Match，并在同一原子数据库更新中校验版本。条件不符返回 412，客户端刷新并让用户合并冲突。保留变更历史和审计，不能把后提交必然覆盖当成默认协作策略。",
  refs: ["http-semantics", "http-cache-rfc"],
  model: true,
  code: String.raw`current=3
def update(expected):
    return 204 if expected==current else 412
show(update(2))
show(update(3))`,
  logs: [412, 204],
  explain:
    "模型展示版本不符与相符分支，真正的写入必须与比较原子完成。示例全局变量没有实现线程或数据库并发，不能当成锁；本课要验证的是前置条件语义和客户端冲突处理。",
  choice: [
    "防止 lost update 的重要步骤是？",
    [
      "先 GET 后无条件 PUT",
      "版本比较与写入原子完成",
      "所有请求返回 200",
      "仅延迟保存",
    ],
    1,
    "比较和写入分离仍然存在竞态。",
  ],
  fill: {
    prompt:
      "只有 expected_version 与 current_version 相等才返回 current_version+1，否则抛 ValueError；这是纯版本检查模型。",
    signature: "def next_version(current_version, expected_version):",
    solution:
      'def next_version(current_version, expected_version):\n    if current_version!=expected_version:\n        raise ValueError("conflict")\n    return current_version+1',
    tests: [
      ["匹配更新", "assert next_version(3,3)==4"],
      [
        "冲突",
        "try:\n    next_version(3,2)\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('conflict')",
      ],
    ],
    hint: "先比较，只有匹配分支递增。",
  },
});
u("restapi", {
  id: "rest-idempotency",
  title: "幂等键、请求摘要与结果重放",
  summary:
    "非幂等创建接口可通过幂等键把重复请求关联到同一业务结果。键必须绑定身份、接口和请求摘要，处理并发首次到达、处理中和结果过期等状态。",
  mechanism:
    "服务端原子认领 key，保存请求摘要、状态与响应；相同 key 相同摘要重放结果，不同摘要返回冲突。数据库事务或可靠状态机保证业务写入与幂等记录一致，单纯进程内 dict 或先查后写不够。",
  steps: [
    "定义键的命名空间、保留期和重试约定，客户端在不确定结果时复用原键。",
    "原子保存 key 与参数摘要，处理中重复请求等待、查询或返回明确状态。",
    "将业务副作用、结果和幂等状态做一致提交，故障恢复确认最终状态。",
  ],
  pitfalls: [
    "每次重试生成新键会失去去重作用。",
    "相同键直接返回旧结果而不比对请求参数，可能把不同订单错误合并。",
  ],
  question: "一个完整的 Idempotency-Key 方案需要保存哪些信息？",
  scenario: "两个请求同时使用同一幂等键且内容不同，服务端应怎么做？",
  answer:
    "以身份和接口作为命名空间，原子认领键并保存规范化请求摘要。后到请求若摘要不同返回冲突，不执行新副作用；摘要相同则根据处理中或已完成状态处理。用并发、提交后超时和服务重启场景验证，而非只做顺序双击测试。",
  refs: ["http-semantics", "py-context"],
  model: true,
  code: String.raw`cache={}
def create(key,payload):
    if key in cache:
        if cache[key]['payload']!=payload: return 'conflict'
        return cache[key]['result']
    cache[key]={'payload':payload,'result':'order-1'}
    return 'order-1'
show([create('k',{'n':1}),create('k',{'n':1}),create('k',{'n':2})])`,
  logs: [["order-1", "order-1", "conflict"]],
  explain:
    "字典模型验证同键参数一致性，没有提供多进程原子性、持久化和过期管理。生产实现必须依赖数据库约束与事务等机制，并且避免缓存响应里的敏感数据超出保留期；客户端超时不代表服务端没有成功。",
  choice: [
    "重试同一次创建时客户端应该？",
    [
      "每次生成新键",
      "复用同一幂等键与相同参数",
      "删除认证头",
      "不断改变参数直到成功",
    ],
    1,
    "同一次业务尝试的重复传输需要保持键与请求内容一致。",
  ],
});
u("restapi", {
  id: "rest-auth",
  title: "认证、授权、OAuth、JWT 与资源归属",
  summary:
    "认证回答你是谁，授权回答你能对哪个资源做什么。JWT 只是令牌格式，OAuth 是授权框架；签名有效也不表示资源操作已获许可，必须继续检查受众、期限和业务权限。",
  mechanism:
    "服务端验证令牌来源、算法、签名、issuer、audience 和时间约束，再建立可信身份。对象级授权按租户、所有者和动作检查，不能信任请求体里的 user_id。浏览器公有客户端通常使用授权码配合 PKCE，密钥与令牌保管按客户端能力设计。",
  steps: [
    "从服务器验证后的身份上下文取用户和租户，所有资源读取与写入加范围过滤。",
    "令牌采用最小权限和有效期，明确刷新、撤销和失效处理。",
    "测试跨用户 ID、批量接口和嵌套资源越权，不靠隐藏按钮或难猜 ID 防护。",
  ],
  pitfalls: [
    "Base64 解码 JWT 不是验证签名；不应接受任意算法或错误受众。",
    "CORS 不是 API 鉴权，非浏览器客户端不受浏览器同源策略约束。",
  ],
  question: "JWT 校验通过后为什么仍要做对象级授权？",
  scenario: "用户 A 改 URL 中 ID 后能看到 B 的文章，怎样修复？",
  answer:
    "在查询层按可信用户或租户范围过滤资源，再检查操作权限；不要仅在列表页过滤或依赖 ID 难猜。对单体、批量、导出和子资源统一检查，建立 A/B 用户越权测试。审计历史访问并避免错误响应泄露不必要的资源信息。",
  refs: ["oauth-bcp", "fastapi"],
  model: true,
  code: String.raw`def can_read(actor,article):
    return actor['tenant']==article['tenant'] and article['owner']==actor['id']
show(can_read({'id':'a','tenant':'t1'},{'owner':'a','tenant':'t1'}))
show(can_read({'id':'a','tenant':'t1'},{'owner':'b','tenant':'t1'}))`,
  logs: [true, false],
  explain:
    "纯函数演示归属与租户条件，不负责解析令牌，也不是完整角色权限系统。真实查询要在返回数据前加范围过滤，并处理共享、管理员等明确规则；客户端传入 owner 字段不能作为可信事实。",
  choice: [
    "CORS 能替代接口鉴权吗？",
    [
      "能",
      "不能，它主要约束浏览器跨源读取",
      "只要允许列表短就能",
      "只对 POST 能",
    ],
    1,
    "API 必须独立验证身份与权限，不能依赖浏览器同源策略。",
  ],
});
u("restapi", {
  id: "rest-security",
  title: "API 安全：越权、注入、SSRF 与上传",
  summary:
    "API 安全依赖输入、身份、资源和执行环境的分层约束。HTTPS 保护传输，不自动解决对象越权、SQL 注入、服务端代请求和恶意文件等应用风险。",
  mechanism:
    "参数化 SQL 分离数据与结构，字段白名单限制可写属性。代请求服务需要协议、地址、重定向和解析范围控制，不能只检查 URL 文本。上传要限制实际大小、内容类型、存储位置与执行权限，并对路径规范化和访问授权分开处理。",
  steps: [
    "对每个入口画清数据流和高权限边界，最小化可调用能力与数据范围。",
    "限制请求、上传和响应体积，对外部调用设超时、重定向与网络出口策略。",
    "输出错误脱敏，日志保留关联标识，回归测试覆盖跨身份、非法字段和超限输入。",
  ],
  pitfalls: [
    "文件扩展名或 Content-Type 可被伪造，不能作为唯一判断。",
    "URL 允许某域名不等于所有解析地址和重定向都安全，生产防护需网络层共同约束。",
  ],
  question: "一个能抓取任意 URL 的接口为什么需要 SSRF 防护？",
  scenario: "AI 工具接受 URL 后访问到内网服务，怎样限制能力？",
  answer:
    "把可访问源缩小为明确允许集合，解析并校验协议、端口和地址，重定向后重新检查；网络出口拒绝未授权的内网和元数据地址。工具参数由服务端校验并绑定身份、预算和审计。仅在 prompt 里告诉模型不要访问内网不构成防护。",
  refs: ["owasp", "owasp-llm", "py-url"],
  model: true,
  code: String.raw`allowed_fields={'title','summary'}
request={'title':'A','is_admin':True}
unknown=set(request)-allowed_fields
show(sorted(unknown))
show(not unknown)`,
  logs: [["is_admin"], false],
  explain:
    "示例只验证未知字段检测，没有实现 SSRF、上传扫描或身份授权。安全边界应对应实际能力，并在服务器和网络出口执行；单个纯函数示例用于理解一项约束，不应被当作完整安全方案。",
  choice: [
    "防止任意 URL 代请求风险应依靠？",
    [
      "只写 prompt 规则",
      "服务端校验与网络出口约束",
      "把 URL 改 Base64",
      "仅检查字符串长度",
    ],
    1,
    "模型和客户端都是不可信输入来源，需要实际执行边界。",
  ],
});
u("restapi", {
  id: "rest-versioning",
  title: "版本演进、兼容性与弃用策略",
  summary:
    "接口演进要考虑已有客户端的真实使用方式。新增可选字段通常比删改字段更容易兼容，但枚举扩展、默认值变化和错误模型变化也可能破坏客户端。",
  mechanism:
    "URI、头部或媒体类型都可承载版本选择，各有缓存、路由和工具链成本。版本号不是兼容性证明；兼容性应以契约测试、客户端能力和逐步迁移验证。弃用需要通知、观测使用量和明确退出时间。",
  steps: [
    "维护公开契约和变更日志，区分新增、行为变化与破坏性改动。",
    "使用双写、双读或适配层逐步迁移，按客户端版本观测错误与使用量。",
    "删除旧字段前验证真实调用清零，并准备可回滚路径和数据迁移。",
  ],
  pitfalls: [
    "新增枚举值会使穷举客户端失败，不能总算无风险新增。",
    "路径加 /v2 但旧数据语义不兼容，仍然需要迁移和文档。",
  ],
  question: "哪些看起来只是新增的改动也可能破坏客户端？",
  scenario: "后端新增订单状态后旧客户端崩溃，怎样改兼容策略？",
  answer:
    "让客户端为未知状态提供保守回退，并在契约中定义枚举扩展策略。服务端按能力或版本控制新值投放，监控客户端兼容情况。补契约和消费者测试，不能仅因没有删除字段就认定兼容。",
  refs: ["openapi", "json-schema"],
  model: true,
  code: String.raw`known={'queued':'等待','running':'处理中','done':'完成'}
show([known.get(status,'未知状态，请刷新') for status in ['queued','paused']])`,
  logs: [["等待", "未知状态，请刷新"]],
  explain:
    "未知枚举分支避免程序直接崩溃，但业务仍需决定能否安全继续操作。对支付、权限等高影响状态，应保守禁止不确定操作并提示刷新，而不是用任意默认成功值吞掉差异。",
  choice: [
    "新增枚举值一定向后兼容吗？",
    ["一定", "不一定，客户端可能穷举处理", "只要 JSON 就兼容", "与客户端无关"],
    1,
    "兼容性取决于消费者行为与契约约定。",
  ],
});
u("restapi", {
  id: "rest-openapi",
  title: "OpenAPI、JSON Schema 与契约测试",
  summary:
    "OpenAPI 描述接口路径、方法、输入、响应和安全要求，JSON Schema 描述数据形状。文档只有与实现和消费者验证相连，才能减少漂移，不是生成一个页面就结束。",
  mechanism:
    "请求与响应 schema 应分别建模，readOnly/writeOnly、nullable 或联合类型的表达需按固定规范版本与工具支持核对。代码生成提高一致性，但生成类型不等于运行时校验或业务授权。",
  steps: [
    "固定 OpenAPI 版本和工具链，维护成功与错误样本、分页和认证约定。",
    "在 CI 校验规范并做兼容性检查，真实响应与 schema 对比。",
    "为关键消费者补交互测试，变更时同时更新文档、实现和版本说明。",
  ],
  pitfalls: [
    "默认值是注释还是自动填充依具体工具，不能仅看 schema 就假设实现行为。",
    "只验证请求不验证响应，会让内部敏感字段和错误类型悄悄漂移。",
  ],
  question: "OpenAPI、JSON Schema 和客户端类型各自保证到哪一层？",
  scenario: "接口文档写 price 为整数，实际响应变成字符串，怎样防止再发生？",
  answer:
    "将真实响应样本与 schema 校验纳入 CI，并为金额建立跨语言契约测试。响应模型显式投影与序列化，禁止内部对象自动泄露；变更前做消费者兼容检查。生成文档只是产物，必须让实现测试验证它。",
  refs: ["openapi", "json-schema"],
  model: true,
  code: String.raw`schema={'type':'object','required':['id'],'properties':{'id':{'type':'string'}}}
show(schema['required'])
show(schema['properties']['id']['type'])`,
  logs: [["id"], "string"],
  explain:
    "展示 schema 的必填和属性类型，不包含完整 JSON Schema 验证器。真实运行应使用符合所选 draft 的库，处理 additionalProperties、组合、格式和业务范围，并对响应与请求分别验证。",
  choice: [
    "OpenAPI 自动生成客户端后，还需要什么？",
    [
      "什么都不需要",
      "运行时校验、授权与契约测试",
      "删除错误文档",
      "让前端决定所有权限",
    ],
    1,
    "静态类型与文档不自动保证运行时行为和权限。",
  ],
});
u("restapi", {
  id: "rest-fastapi",
  title: "FastAPI、依赖注入、生命周期与 async 边界",
  summary:
    "FastAPI 用类型与模型表达输入输出，依赖注入组织认证、数据库会话和服务对象。async 路由中执行同步阻塞调用仍会阻塞事件循环，资源范围需要与请求和应用生命周期匹配。",
  mechanism:
    "Depends 描述依赖图，带 yield 的依赖可以建立清理范围。同步与异步处理方式需理解框架调度策略，数据库驱动是否原生异步尤其重要。响应模型可投影字段，但仍应补对象级授权和业务事务。",
  steps: [
    "用请求/响应模型分离输入可写字段与输出公开字段，认证依赖建立可信身份。",
    "按生命周期管理客户端和数据库连接，启动创建、请求复用、停机清理。",
    "选择匹配的同步或异步依赖，测量线程池、连接池等待与 event loop 延迟。",
  ],
  pitfalls: [
    "async def 不是非阻塞保证，调用 requests 或同步数据库仍可能阻塞。",
    "把全局可变用户上下文放进共享服务会让请求串数据。",
  ],
  question: "FastAPI 的 Depends 为什么不只是减少函数参数？",
  scenario: "异步路由里调用同步爬虫库后所有接口变慢，应怎样调整？",
  answer:
    "确认阻塞调用与耗时，选原生异步客户端或在受控线程池运行同步库，设置超时和容量。长任务移到作业队列，接口返回任务资源。依赖管理身份和资源生命周期，不能让全局共享对象保存当前用户状态。",
  refs: ["fastapi", "py-asyncio"],
  model: true,
  code: String.raw`class Service:
    def __init__(self,repo): self.repo=repo
    def get(self,key): return self.repo.get(key)
service=Service({'a':{'title':'A'}})
show(service.get('a'))`,
  logs: [{ title: "A" }],
  explain:
    "构造器注入让业务服务依赖可替换仓库，测试不必访问真实数据库；这不是 FastAPI 本身的执行示例。真实项目可用 Depends 组装同样的依赖，并通过响应模型、认证和事务明确请求边界。",
  choice: [
    "async def 内调用同步 HTTP 库会自动非阻塞吗？",
    [
      "会",
      "不会，需要异步客户端或受控线程执行",
      "只要 return JSON 就会",
      "依赖变量名",
    ],
    1,
    "async 语法不会改造同步调用的阻塞性质。",
  ],
});
u("restapi", {
  id: "rest-transactions",
  title: "事务、业务不变量与 Outbox",
  summary:
    "事务让一组数据库修改按约束提交，但不会自动让数据库与外部消息系统形成原子整体。业务不变量需要数据库条件更新、唯一约束和合理隔离，跨系统通知常用 Outbox 等模式解耦。",
  mechanism:
    "数据库事务提交成功后，发送消息仍可能失败；先发消息再提交又可能通知不存在的数据。Outbox 在同一事务写业务数据与待发事件，后台投递并允许重复，下游按事件 ID 幂等处理。",
  steps: [
    "明确余额、库存、唯一订单等不变量，在数据库原子操作中验证。",
    "业务提交与 Outbox 记录一起事务保存，消息投递独立重试并保留事件 ID。",
    "消费者按幂等键去重，监控事件积压、投递延迟和失败恢复。",
  ],
  pitfalls: [
    "Outbox 通常带来至少一次投递，不应承诺端到端无重复。",
    "把外部慢请求放在长数据库事务中会延长锁持有并扩大故障影响。",
  ],
  question: "数据库提交与消息发送如何避免双写不一致？",
  scenario: "订单创建成功但通知丢失，重试接口又多建一张订单，怎样拆解？",
  answer:
    "接口用幂等键避免重复建单，事务内同时写订单和待发事件。后台按事件 ID 投递，失败重试，消费者去重。补提交后进程崩溃与消息重复的故障演练，并展示积压和投递延迟，不能只测正常路径。",
  refs: ["py-context", "http-semantics"],
  model: true,
  code: String.raw`transaction={'orders':[],'outbox':[]}
transaction['orders'].append({'id':'o1'})
transaction['outbox'].append({'event_id':'e1','order_id':'o1'})
show(transaction)`,
  logs: [
    { orders: [{ id: "o1" }], outbox: [{ event_id: "e1", order_id: "o1" }] },
  ],
  explain:
    "字典仅展示业务记录与事件记录应共享提交边界，不提供真实事务或故障原子性。实现应在数据库中一起提交，再由可靠投递器处理外部发送；消费者仍需面对重复和乱序。",
  choice: [
    "Outbox 的常见用途是？",
    [
      "消除一切重复",
      "让业务提交与待发事件在同一数据库事务中保存",
      "把消息直接写日志后遗忘",
      "绕过消费者幂等",
    ],
    1,
    "它解决双写的一致提交问题，投递与消费仍需可靠和幂等设计。",
  ],
});
u("restapi", {
  id: "rest-rate-limit",
  title: "限流、配额、重试预算与过载保护",
  summary:
    "接口需要按身份、租户、资源成本和全局容量控制访问。每秒请求数只是一个维度，大文件、长查询和 AI token 消耗可能远比普通请求昂贵。",
  mechanism:
    "令牌桶允许有限突发，滑动窗口描述更连续的请求量。配额限定长期预算，并发闸门保护在途资源；429 提示调用方降速，503 可表达服务暂时不可用。过载保护应在昂贵工作开始前拒绝或排队。",
  steps: [
    "按实际成本定义请求、并发、字节或 token 预算，身份来自可信上下文。",
    "设置有界等待队列和超时，返回可理解的退避指示。",
    "把重试放大和多实例共享配额纳入设计，监控拒绝率与恢复过程。",
  ],
  pitfalls: [
    "每个实例各限 100/s，扩成十台后总额度可能变成十倍。",
    "无限队列只是把拒绝变成高延迟和内存耗尽，不等于稳定。",
  ],
  question: "限流、配额与并发限制有什么区别？",
  scenario: "AI 接口请求数不多却账单异常高，如何补限额？",
  answer:
    "把单请求输入输出 token、工具次数、上下文大小和并发都纳入预算，在调用前预估、流中累计并在结算时核对。按租户设置月/日额度与单次上限，重试共享总预算。日志脱敏但保留 usage 和 request_id，以便定位异常消费。",
  refs: ["http-semantics", "llm-tools"],
  model: true,
  code: String.raw`budget=1000; spent=750; estimated=300
show(spent+estimated<=budget)
show(max(0,budget-spent))`,
  logs: [false, 250],
  explain:
    "预算模型把预估消耗与剩余额度比较，实际系统需要并发预留与结算，避免多个请求同时通过检查后超额。这里的数值是教学预算单位，不代表模型价格或任何平台真实计费方式。",
  choice: [
    "防止并发请求同时超额，检查预算之后还需要？",
    ["只靠前端按钮", "原子预留和结算", "每次都假设免费", "不记录重试"],
    1,
    "只读余额再发请求存在并发竞争，需要预留与结算机制。",
  ],
});
u("restapi", {
  id: "rest-webhooks",
  title: "Webhook、签名、重放防护与幂等消费",
  summary:
    "Webhook 是异步事件投递接口，需要验证发送方、消息完整性和时间窗口，并处理重复、乱序与失败重试。收到事件后应尽快可靠接收，再异步执行昂贵业务。",
  mechanism:
    "签名通常覆盖原始请求字节与时间戳，不能先解析再重新序列化后验证。时间窗口限制重放范围，事件 ID 去重防重复执行；常量时间比较降低签名比较侧信道，但不替代密钥管理。",
  steps: [
    "固定签名算法和规范化约定，校验时间、原始体大小与来源配置。",
    "将事件可靠入库后快速响应，再由工作者按事件 ID 幂等处理。",
    "设计乱序版本检查、重试退避和死信恢复，支持密钥轮换。",
  ],
  pitfalls: [
    "时间戳在窗口内仍可能重复，需要事件级去重。",
    "直接信任 body 中的 user_id 或事件类型，会把外部数据当授权依据。",
  ],
  question: "Webhook 为什么既需要签名又需要事件去重？",
  scenario: "同一支付事件投递三次，用户获得三次权益，如何修复？",
  answer:
    "先验证原始请求签名与时间戳，再以事件 ID 建立唯一接收记录。权益更新与消费标记事务提交，失败可重试且不会多发；乱序事件按版本或业务状态处理。补重复、乱序、签名错误与提交后崩溃测试。",
  refs: ["http-semantics", "py-context"],
  model: true,
  code: String.raw`seen=set(); applied=[]
for event in ['e1','e1','e2']:
    if event not in seen:
        seen.add(event); applied.append(event)
show(applied)`,
  logs: [["e1", "e2"]],
  explain:
    "集合展示事件去重逻辑，不验证真实签名也不持久化。生产必须把接收和业务消费状态放到可靠存储，并与业务修改一致提交；进程重启后内存集合丢失，所以不能直接照搬此模型上线。",
  choice: [
    "Webhook 签名校验应优先使用？",
    [
      "解析后任意排序的 JSON",
      "约定的原始请求字节与时间戳",
      "页面显示的文案",
      "数据库当前记录标题",
    ],
    1,
    "重序列化可能改变字节，导致签名语义不一致。",
  ],
});
u("restapi", {
  id: "rest-jobs",
  title: "长任务、轮询、SSE 与取消状态机",
  summary:
    "长时间导出、采集和 AI 工作流应作为可查询任务资源管理。请求接受、任务开始、部分输出和最终成功是不同状态，客户端断开连接也不自动等于业务取消。",
  mechanism:
    "创建任务后返回 202 与任务地址；状态机明确 queued、running、succeeded、failed 和 cancel_requested 等状态。SSE 可推送进展，但恢复需要事件 ID 与可重放策略；轮询要退避，取消是协作请求。",
  steps: [
    "任务记录保存拥有者、输入摘要、状态、进度与结果过期时间。",
    "限制任务并发和队列，进度单调且不伪造百分比，结果可重复查询。",
    "取消时停止新步骤并清理资源，对已完成副作用给出真实最终状态。",
  ],
  pitfalls: [
    "关闭浏览器连接不表示后台任务没有执行，也不代表已回滚。",
    "SSE 只是一种传输方式，不提供任务持久化、幂等和自动重放保证。",
  ],
  question: "长任务为什么要独立任务资源，而不一直占着同步 HTTP 请求？",
  scenario: "用户刷新页面后不知道导出是否完成，怎样恢复？",
  answer:
    "创建任务时保存稳定任务 ID 与归属，刷新后查询任务资源恢复状态。任务由后台可靠执行并持久化进度，结果成功后再提供下载链接；SSE 或轮询只是观察方式。取消、过期和失败都要可查询，避免重新点击就无条件重复创建。",
  refs: ["http-semantics", "sse"],
  model: true,
  code: String.raw`allowed={'queued':{'running','cancelled'},'running':{'succeeded','failed','cancel_requested'},'succeeded':set()}
show('running' in allowed['queued'])
show('running' in allowed['succeeded'])`,
  logs: [true, false],
  explain:
    "状态迁移模型防止已完成任务随意回到运行中。真实任务重试可建立新 attempt 或显式迁移规则，并保留历史；模型未实现后台队列、持久化或 SSE 重放，这些应在工程集成中分别验证。",
  choice: [
    "客户端断开连接后后台任务一定？",
    [
      "自动回滚",
      "无法仅凭断开判断，需查询任务状态",
      "自动免费重跑",
      "永远成功",
    ],
    1,
    "传输连接生命周期与业务任务生命周期需要分开管理。",
  ],
});
u("restapi", {
  id: "rest-testing",
  title: "API 契约、集成、越权与故障测试",
  summary:
    "API 测试要覆盖输入输出、身份范围、状态迁移和失败恢复。只检查返回 200 很难发现字段漂移、越权、重复副作用或事务边界错误。",
  mechanism:
    "单元测试验证纯业务规则，契约测试比对规范，集成测试覆盖真实数据库和路由，端到端测试验证用户流程。测试夹具隔离数据库与身份，时间和外部依赖可控，关键并发竞态需要专门构造。",
  steps: [
    "为正常、空集、非法类型、超限、未登录、跨用户和并发冲突列出矩阵。",
    "关键写操作检查数据库最终状态，重复请求验证幂等，而不只断言响应。",
    "模拟依赖超时和提交后断连，验证错误映射、回滚或查询恢复。",
  ],
  pitfalls: [
    "把生产学习数据库当测试夹具会污染或破坏真实记录。",
    "用实现同样的错误逻辑计算期望值，会让测试失去独立判断能力。",
  ],
  question: "怎样设计一套能发现越权与幂等问题的 API 测试？",
  scenario: "所有路由测试通过，但用户仍报告跨账号数据泄露，怎样补测试？",
  answer:
    "引入两个独立身份和租户，让 A 访问 B 的单体、列表过滤、导出与批量资源。测试真实服务端授权与数据库查询范围，而不是 mock 掉授权层。加入字段投影和缓存隔离检查，修复后保留稳定回归用例。",
  refs: ["py-test", "openapi"],
  model: true,
  code: String.raw`cases=[('owner',200),('other_user',404),('anonymous',401)]
show([{'actor':actor,'expected_status':status} for actor,status in cases])`,
  logs: [
    [
      { actor: "owner", expected_status: 200 },
      { actor: "other_user", expected_status: 404 },
      { actor: "anonymous", expected_status: 401 },
    ],
  ],
  explain:
    "矩阵中的 404 是本示例选择的资源隐藏策略，不是所有 API 必须如此；也可按契约使用 403。测试应先明确策略，再验证实际返回、公开字段与数据库变化，避免把任意状态码硬编码成普遍标准。",
  choice: [
    "写接口幂等测试不能只检查什么？",
    [
      "数据库最终状态",
      "重复请求的副作用数量",
      "HTTP 返回码而不看最终业务状态",
      "请求摘要一致性",
    ],
    2,
    "成功响应并不证明没有重复创建或部分提交。",
  ],
});
