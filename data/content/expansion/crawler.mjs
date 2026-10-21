import { unit as u } from "./common.mjs";
u("crawler", {
  id: "crawl-boundaries",
  title: "采集目标、授权边界与数据最小化",
  summary:
    "采集工程先定义目标数据、允许来源和更新频率，再选择技术。公开可见、robots 允许和拥有采集授权是不同条件；只收集完成业务所需的数据，并设计保留与删除周期。",
  mechanism:
    "可靠链路通常是发现 URL、请求、解析、标准化、质量验证、去重存储和观测。每一步保存可追溯标识，原始响应与清洗结果分层。对登录、验证码和访问限制，应使用允许的 API 或授权数据通道，而不是把突破限制当成默认采集步骤。",
  steps: [
    "列出字段、来源、用途、更新频率、保留期和可接受误差，优先使用有契约的数据接口。",
    "给任务固定域名范围、最大页数、请求频率与总时间预算。",
    "将来源、采集时间和解析版本一并记录，为修正、回放和删除提供依据。",
  ],
  pitfalls: [
    "robots 是自动访问规则，不是身份验证，也不等于对数据使用的完整授权。",
    "HTTP 200 不能证明数据完整，可能是空页、登录页或错误模板。",
  ],
  question: "从临时脚本到可靠采集管道，需要补哪些边界？",
  scenario: "需求只要文章标题，但脚本顺手保存全部用户资料，如何调整？",
  answer:
    "把字段与用途逐项对应，删除无关个人信息，优先使用公开接口或已获授权的数据源。限制访问域和频率，并为结果保留来源、时间和解析版本；对已有多余数据建立删除流程。验收应包含质量与访问边界，而不只是抓到多少条。",
  refs: ["robots-rfc", "scrapy"],
  code: String.raw`allowed={'title','url','fetched_at'}
raw={'title':'A','url':'/a','fetched_at':'2026-10-21','private_note':'remove'}
show({k:v for k,v in raw.items() if k in allowed})`,
  logs: [{ title: "A", url: "/a", fetched_at: "2026-10-21" }],
  explain:
    "字段白名单演示最小化输出，不等于已经完成授权或所有敏感信息识别。真实管道还需要源站访问范围、数据用途和保留策略；模型或页面中出现额外字段，也不应自动扩大采集范围。",
  choice: [
    "采集前应优先明确什么？",
    [
      "代理数量",
      "数据范围、允许来源和更新频率",
      "如何绕过验证码",
      "先保存一切以后再说",
    ],
    1,
    "先确定目标与边界，技术选型和质量验收才能有依据。",
  ],
});
u("crawler", {
  id: "crawl-http-client",
  title: "HTTP 客户端、Session 与连接池",
  summary:
    "连接复用减少重复建立连接的成本，Session/Client 还可能管理 Cookie、认证和默认配置。生命周期必须与任务和身份范围一致，不能为了复用而混用不同账号的状态。",
  mechanism:
    "requests.Session 面向同步调用，HTTPX 提供同步和异步客户端。连接池上限控制连接资源，不必然等于任务并发上限；客户端应复用并在退出时关闭。Cookie、重定向和证书校验是请求语义的一部分，不能只看 GET 是否返回文本。",
  steps: [
    "用上下文管理客户端，把超时、连接数、User-Agent 和重定向策略集中配置。",
    "按身份与租户隔离 Cookie 状态，避免在多个任务间共享未经设计的可变会话。",
    "观测连接池等待、建连耗时与响应大小，和应用并发闸门一起调节。",
  ],
  pitfalls: [
    "在热循环里每次创建 Client 会失去连接复用；全局永久共享身份状态也可能串号。",
    "关闭 TLS 验证不是处理证书问题的正常修复，应修复证书链或可信配置。",
  ],
  question: "为什么异步采集需要复用客户端，还需要单独限制并发？",
  scenario:
    "1000 个任务同时启动，连接数只有 20，程序却超时且内存很高，怎么办？",
  answer:
    "区分等待连接的任务和正在传输的连接，检查 pool timeout 与任务积压。用有界队列限制待处理任务，再设置应用并发和客户端连接池，复用客户端并及时消费响应。以吞吐、等待和内存共同调参，不能只扩大连接数。",
  refs: ["httpx"],
  model: true,
  code: String.raw`config={'max_connections':20,'max_keepalive_connections':10,'connect_timeout':3,'read_timeout':10}
show(config['max_keepalive_connections']<=config['max_connections'])
show(min(100,config['max_connections']))`,
  logs: [true, 20],
  explain:
    "这里验证客户端配置关系，没有在浏览器导入 HTTPX 或建立真实连接。实际项目可用 with httpx.Client 或 async with httpx.AsyncClient，并按部署的库版本确认参数；本模型的 min 计算不能替代连接池或队列实现。",
  choice: [
    "连接池 max_connections=20 意味着？",
    [
      "只能创建 20 个协程",
      "约束连接资源，不自动限制所有待处理任务",
      "自动按域名限速",
      "所有任务都不会超时",
    ],
    1,
    "连接数与应用任务数是不同资源维度，需要分别控制。",
  ],
});
u("crawler", {
  id: "crawl-retry",
  title: "超时、重试、退避与 Retry-After",
  summary:
    "请求失败先分类，再决定能否重试。连接超时、读取超时、429 与部分 5xx 可能暂态；认证失败和解析错误通常需要修正。重试必须受次数、总时间和幂等约束。",
  mechanism:
    "HTTPX 的超时区分 connect、read、write 和 pool，单个 read timeout 不必然是总请求时限。指数退避加抖动降低同步重试冲击；Retry-After 可能是秒数或 HTTP 日期，需要结合剩余预算处理。",
  steps: [
    "建立错误分类表，记录重试原因、次数和最终失败，不在解析层无限重试。",
    "限制单次与总 deadline，遇到服务端退避指示时按预算等待或延后排程。",
    "写操作只在有幂等保障时自动重试，取消要及时传播。",
  ],
  pitfalls: [
    "所有 4xx 都重试会浪费资源并加重限流；401 通常先修认证。",
    "重试等待占着并发槽会降低有效吞吐，长等待可转回延迟队列。",
  ],
  question: "重试策略为什么要同时控制次数、单次超时和总预算？",
  scenario: "源站开始 429，程序立刻重试导致更严重限流，如何改？",
  answer:
    "先暂停或降低该域的发放速率，解析 Retry-After，按任务剩余预算延后调度。为每次重试加退避与抖动，设置全局重试预算并避免重试嵌套放大。记录 429 比例和恢复时间，不能用更高并发掩盖限流。",
  refs: ["httpx", "http-semantics", "scrapy-throttle"],
  code: String.raw`def delay(attempt, retry_after=None, cap=30):
    if retry_after is not None: return min(cap,max(0,retry_after))
    return min(cap,2**attempt)
show([delay(n) for n in range(7)])
show(delay(1,12))`,
  logs: [[1, 2, 4, 8, 16, 30, 30], 12],
  explain:
    "代码只验证确定性的退避上限，故意没有加入随机抖动以便预测输出。生产实现应加入可注入随机源、HTTP 日期解析和总 deadline；达到上限后也要限制重试次数，不能无限每 30 秒重试。",
  choice: [
    "以下通常不应直接无限重试的是？",
    [
      "连接暂态失败",
      "429 并有退避指示",
      "401 身份无效",
      "可重放的幂等读取偶发 503",
    ],
    2,
    "认证错误要先修复身份，盲目重试通常无效。",
  ],
  fill: {
    prompt:
      "返回 min(cap, base * 2**attempt)，参数要求 base>0、cap>0、attempt 为非负整数。",
    signature: "def backoff(base, attempt, cap):",
    solution:
      'def backoff(base, attempt, cap):\n    if base<=0 or cap<=0 or type(attempt) is not int or attempt<0:\n        raise ValueError("parameters")\n    return min(cap,base*2**attempt)',
    tests: [
      ["指数与封顶", "assert backoff(1,3,20)==8 and backoff(2,10,30)==30"],
      ["首次", "assert backoff(2,0,30)==2"],
    ],
    hint: "先按契约校验，再计算指数和上限。",
  },
});
u("crawler", {
  id: "crawl-html",
  title: "HTML、CSS/XPath 选择器与相对提取",
  summary:
    "HTML 解析应基于结构，而不是用大段正则匹配整个页面。先确定重复记录的容器，再在容器内做相对提取，避免标题、价格和链接因缺字段而错位。",
  mechanism:
    "CSS 与 XPath 选取节点，文本节点可能嵌套在标签内；选择器匹配为空与字段真实为空需要区别。浏览器渲染后的 DOM 和初始 HTML 也可能不同，解析器不会自动执行 JavaScript。",
  steps: [
    "保存固定 HTML 样本，先检查重复容器数量，再逐条提取字段并保留缺失状态。",
    "选择稳定语义属性或结构，少依赖自动生成的类名和绝对层级。",
    "对缺字段、嵌套标签和页面变版写回放测试，检查关联字段是否来自同一记录。",
  ],
  pitfalls: [
    "全页分别取标题列表和价格列表再 zip，缺一项就会把不同商品错配。",
    "HTMLParser 是标准库事件解析器，本例只处理约定的链接样本，不代表浏览器 DOM 的全部修复规则。",
  ],
  question: "为什么推荐先选记录容器，再做字段相对提取？",
  scenario: "一件商品没有价格后，后续商品价格全部串位，怎么修？",
  answer:
    "停止把各字段独立全页收集后按位置拼接，改成逐容器生成记录。每条记录保留缺失字段和来源标识，对缺字段策略显式验证。用故障 HTML 样本回放，确保缺一个价格只影响对应商品，而不移动后续记录。",
  refs: ["scrapy-selectors"],
  code: String.raw`from html.parser import HTMLParser
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.urls=[]
    def handle_starttag(self,tag,attrs):
        data=dict(attrs)
        if tag=='a' and 'href' in data: self.urls.append(data['href'])
p=Links(); p.feed('<a href="/a">A</a><span>B</span><a href="/b">B</a>')
show(p.urls)`,
  logs: [["/a", "/b"]],
  explain:
    "标准库解析器识别 a 标签属性，不需要用正则猜引号位置。这里收集的是原始相对链接，下一步应通过 urljoin 解析并限制来源；从 href 存在不能推断链接一定可访问或应该进入抓取队列。",
  choice: [
    "避免缺字段导致记录错配的方法是？",
    [
      "全页各抓一个列表再 zip",
      "逐记录容器提取关联字段",
      "用更多 sleep",
      "丢掉全部空字段后拼接",
    ],
    1,
    "记录容器保持字段之间的所属关系。",
  ],
});
u("crawler", {
  id: "crawl-dynamic",
  title: "动态页面、浏览器自动化与显式等待",
  summary:
    "需要 JavaScript 执行或交互后才出现的数据，可考虑浏览器自动化，但应先判断是否存在允许使用的稳定数据接口。等待条件要对应数据就绪，而不是随意睡几秒。",
  mechanism:
    "Playwright 的 BrowserContext 隔离 Cookie 和存储，会话与页面生命周期分开。Locator 的自动等待主要针对可操作性，不等于所有业务数据已加载；应等待具体响应、可见节点或业务完成标记。",
  steps: [
    "对比原始响应与渲染后 DOM，确定数据生成阶段和允许使用的接口。",
    "为任务建立独立上下文，使用明确选择器和等待条件，及时关闭页面与上下文。",
    "控制页面并发、资源和总超时，失败时保存脱敏 DOM/截图以便回放。",
  ],
  pitfalls: [
    "networkidle 不一定适合持续轮询或流式网页，也不应作为万能数据完成信号。",
    "登录态、验证码和权限限制不应通过自动化默认绕过，应使用授权测试环境和接口。",
  ],
  question: "自动等待与业务数据就绪有什么区别？",
  scenario: "页面打开后偶尔抓到空表格，加 sleep 仍不稳定，怎样改？",
  answer:
    "定位表格加载对应的响应或完成标记，让等待条件与该业务状态一致。检查空表格是真实空数据还是尚未加载，分别处理超时和空结果。用独立 Context 保持会话隔离，并在失败时记录响应状态、DOM 和阶段耗时。",
  refs: ["playwright-python"],
  model: true,
  code: String.raw`states=[{'loaded':False,'rows':[]},{'loaded':True,'rows':[]},{'loaded':True,'rows':['A']}]
show(['loading' if not s['loaded'] else ('empty' if not s['rows'] else 'ready') for s in states])`,
  logs: [["loading", "empty", "ready"]],
  explain:
    "状态模型把加载中、成功空集和成功有值分开，没有启动真实浏览器。真实自动化应等待可验证的业务条件并为超时保留证据；不能从 rows 为空就直接断言页面没有数据。",
  choice: [
    "比固定 sleep 更稳健的等待依据是？",
    [
      "更长 sleep",
      "业务对应的响应或完成标记",
      "随机时间",
      "只等浏览器进程存在",
    ],
    1,
    "等待条件应反映数据真正就绪。",
  ],
});
u("crawler", {
  id: "crawl-url",
  title: "URL 解析、规范化与抓取范围",
  summary:
    "URL 不是可随意 split 的普通字符串。相对地址、片段、查询参数和不同主机表示会影响去重与范围校验；规范化必须保持业务语义，不能随意删除或排序所有参数。",
  mechanism:
    "urljoin 解析相对链接，但绝对链接可以覆盖基址的主机。urlsplit 分离组件，片段通常不进入 HTTP 请求；是否忽略 tracking 参数、默认端口和尾斜线应由站点契约决定。对外部 URL 的访问还需单独防范重定向与地址解析风险。",
  steps: [
    "先解析并仅允许 http/https，再按配置限制主机、端口和路径。",
    "规范化片段和明确无语义的参数，保留分页、签名及业务排序参数。",
    "重定向后再次校验目标，队列去重与来源追踪分别保存规范 URL 和原始 URL。",
  ],
  pitfalls: [
    "urljoin(base, untrusted_absolute_url) 可以跳到其他域名。",
    "排序查询参数可能改变签名或重复参数语义，不应作为所有站点通用规则。",
  ],
  question: "为什么 urljoin 后仍要检查主机？",
  scenario: "站点链接指向另一个域名，采集队列开始越抓越广，怎么控制？",
  answer:
    "在入队前解析最终 URL 并检查协议、主机、端口和路径白名单；拒绝非法 scheme，重定向时重复校验。保留拒绝原因和原始来源，修复队列里已混入的任务。去重策略与抓取范围分开实现，避免把规范化当权限检查。",
  refs: ["py-url"],
  code: String.raw`from urllib.parse import urljoin,urlsplit,urldefrag
base='https://example.test/list/'
url=urljoin(base,'../item/1#reviews')
show(urldefrag(url)[0])
show(urlsplit(urljoin(base,'https://other.test/x')).hostname)`,
  logs: ["https://example.test/item/1", "other.test"],
  explain:
    "相对链接在给定基址下解析，片段从请求 URL 中移除；绝对链接可以覆盖主机。示例没有发起网络访问，真实服务还应校验地址解析、重定向和目标范围，不能只根据输入字符串包含 example.test 来判断安全。",
  choice: [
    "urljoin 后一定保留基址域名吗？",
    ["是", "否，绝对链接可覆盖主机", "只有中文 URL 才覆盖", "只与片段有关"],
    1,
    "绝对 URL 可以替换基址，需要重新校验最终目标。",
  ],
  fill: {
    prompt:
      "返回相对链接的绝对 URL 并去掉片段，仅允许 https 且 hostname 与 base 相同；否则返回 None。此题只验证 URL 结构，不负责 DNS。",
    signature: "def same_host_url(base, href):",
    solution:
      "def same_host_url(base, href):\n    from urllib.parse import urljoin,urlsplit,urldefrag\n    value=urldefrag(urljoin(base,href))[0]\n    parsed=urlsplit(value)\n    return value if parsed.scheme=='https' and parsed.hostname==urlsplit(base).hostname else None",
    tests: [
      [
        "站内相对链接",
        "assert same_host_url('https://a.test/list/','../x#z')=='https://a.test/x'",
      ],
      [
        "拒绝域外和协议",
        "assert same_host_url('https://a.test/','https://b.test/x') is None and same_host_url('https://a.test/','javascript:x') is None",
      ],
    ],
    hint: "urljoin 后用 urlsplit 检查 scheme 和 hostname，最后使用 urldefrag。",
  },
});
u("crawler", {
  id: "crawl-pagination",
  title: "分页、游标、终止条件与去重",
  summary:
    "分页采集需要稳定的下一页标识和明确终止条件。页码、offset、cursor 与滚动加载有不同一致性问题；空页面、重复游标和总页数变化都必须处理。",
  mechanism:
    "offset 在数据插入删除时可能跳过或重复记录；游标通常绑定排序边界，可能过期或包含签名。采集任务需要同时限制页数、总记录数、重复游标和截止时间，避免坏接口形成无限循环。",
  steps: [
    "从响应中读取官方下一页标志，不从猜测的总数无限递增。",
    "维护已访问游标或页标识，检测重复并保存最后提交的位置。",
    "以业务键去重记录，测试空页、重复页、游标失效和中途新增数据。",
  ],
  pitfalls: [
    "页内返回数量小于 page_size 不一定是唯一正确的结束依据，应按接口契约。",
    "用前端展示总数作为强一致快照可能失败，需说明采集时间窗口。",
  ],
  question: "offset 分页在采集过程中数据变化会出现哪些问题？",
  scenario: "下一页接口不断返回同一 cursor，任务不结束，该如何防护？",
  answer:
    "把重复 cursor 判为异常而不是正常进度，记录来源响应并停止或进入人工检查。设置最大页数、总记录和总时间上限；检查点只在存储批次提交后更新。修复后从已提交边界重放，并依赖业务键去重。",
  refs: ["py-url", "scrapy"],
  code: String.raw`pages={'start':(['a','b'],'next'),'next':(['b','c'],None)}
cursor='start'; visited=set(); items=[]
while cursor is not None:
    if cursor in visited: raise ValueError('cursor loop')
    visited.add(cursor)
    batch,cursor=pages[cursor]; items.extend(batch)
show(list(dict.fromkeys(items)))`,
  logs: [["a", "b", "c"]],
  explain:
    "固定样本模拟两页数据，集合防止游标循环，字典保持首次记录顺序。它没有解决真实接口的快照一致性、游标过期或持久化；生产实现必须在事务提交后保存检查点，并针对实际排序契约设计恢复。",
  choice: [
    "游标采集应额外防护什么？",
    [
      "游标重复形成循环",
      "只看页面颜色",
      "自动忽略所有空响应",
      "永远信任总页数",
    ],
    0,
    "重复游标应被检测并结合最大页数与总时间预算处理。",
  ],
});
u("crawler", {
  id: "crawl-encoding",
  title: "编码、压缩、响应类型与原始样本",
  summary:
    "响应字节到业务字段之间存在多层解释：传输、压缩、内容类型、字符编码和结构解析。乱码或解析错误先定位哪一层出了问题，保留原始字节有助于重放。",
  mechanism:
    "HTTP 客户端可能自动解压 gzip，但 Content-Encoding 与字符编码不同。Content-Type、页面声明和探测结果可能冲突；JSON 解析器不能直接处理登录 HTML。超大压缩展开也可能造成资源压力。",
  steps: [
    "校验状态、Content-Type、响应大小和关键标记，再进入具体解析器。",
    "保留有限的原始样本、响应头和解析版本，记录编码选择依据。",
    "对解码替换、空字段和模板变化建立指标，禁止静默 ignore 一切错误。",
  ],
  pitfalls: [
    "请求返回 200 不保证 JSON，错误模板经常也是 HTML。",
    "Content-Length 可能缺失或是压缩体大小，仍需对实际读取和解压后的大小设上限。",
  ],
  question: "Content-Encoding 和字符编码有什么区别？",
  scenario: "某批页面显示乱码，但重试多少次都一样，应该继续重试吗？",
  answer:
    "先停止无意义重试，保存同一响应的字节和头部，在离线样本上比较编码与解码错误。确认压缩是否已被客户端处理，再核对站点声明与历史模板。修复解析版本后重放样本，区分数据本身损坏与处理链错误。",
  refs: ["httpx", "py-types"],
  code: String.raw`raw='标题'.encode('utf-8')
show(raw.decode('utf-8'))
content_type='text/html; charset=utf-8'
show(content_type.split(';',1)[0]=='application/json')`,
  logs: ["标题", false],
  explain:
    "解码成功来自已知 UTF-8 约定，Content-Type 检查说明不能把任意文本交给 JSON 解析器。真实站点存在错误声明和压缩等情况，需要保存样本定位，而不是盲目尝试所有编码并选一个看起来没有报错的结果。",
  choice: [
    "Content-Encoding: gzip 表示？",
    [
      "文本一定 UTF-8",
      "内容编码为 gzip，与字符编码不同",
      "JSON 字段类型",
      "HTTP 版本",
    ],
    1,
    "压缩与字符解码是不同层次。",
  ],
});
u("crawler", {
  id: "crawl-schema",
  title: "字段标准化、Schema 与质量隔离",
  summary:
    "采集结果要先按业务契约标准化，再进入正式存储。必填字段、价格单位、日期时区和缺失语义必须一致；解析失败不应简单丢弃或用零值伪装成功。",
  mechanism:
    "raw、normalized、validated 是不同阶段。字段提取可得到文本，标准化将其转换为单位明确的值，验证检查类型与范围。坏记录进入隔离队列，保留来源和原因以便修复解析器后重放。",
  steps: [
    "逐字段定义必填、空值、单位、长度和唯一键，并给样本版本。",
    "标准化函数尽量纯化，明确空字符串、None 与零值各自语义。",
    "把无效记录与成功空集分开统计，设置质量阈值防止整批错误写入。",
  ],
  pitfalls: [
    "价格解析失败写 0 会把异常误当免费商品，影响后续分析。",
    "自动将所有字符串转数字可能破坏编号前导零和超过精度的大整数。",
  ],
  question: "提取、标准化与验证应如何分层？",
  scenario: "改版后价格字段为空但任务仍完成，怎样让质量问题及时暴露？",
  answer:
    "给价格字段建立明确的缺失策略和解析错误计数，使用页面样本回放定位模板变化。达到阈值时隔离批次或停止写正式表，而不是用 0 补齐。保存来源、时间和解析版本，修复后只重放受影响样本。",
  refs: ["json-schema", "py-typing"],
  code: String.raw`def normalize_price(text):
    from decimal import Decimal
    return int(Decimal(text.replace('¥','').strip())*100)
show(normalize_price(' ¥12.30 '))
show({'amount_minor':1230,'currency':'CNY'})`,
  logs: [1230, { amount_minor: 1230, currency: "CNY" }],
  explain:
    "金额转换到最小单位便于稳定存储，示例只接受给定格式且假设两位以内小数。真实解析应处理非法、负值、额外小数位和币种差异，明确舍入或拒绝策略；不能把页面中的任意货币符号都删掉再猜币种。",
  choice: [
    "价格解析失败的合理处理是？",
    [
      "默认 0 且不记日志",
      "按契约隔离并记录原因",
      "随机补历史均值",
      "直接转成 False",
    ],
    1,
    "保留失败证据和来源，避免污染业务数据。",
  ],
  fill: {
    prompt:
      "仅接受恰好两位小数的非负 ASCII 金额字符串，返回分整数；其他输入抛 ValueError。",
    signature: "def parse_cents(text):",
    solution:
      "def parse_cents(text):\n    import re\n    if re.fullmatch(r'[0-9]+\\.[0-9]{2}',text) is None:\n        raise ValueError('amount')\n    whole,fraction=text.split('.')\n    return int(whole)*100+int(fraction)",
    tests: [
      [
        "普通金额",
        "assert parse_cents('12.30')==1230 and parse_cents('0.00')==0",
      ],
      [
        "小数精度",
        "try:\n    parse_cents('1.234')\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('precision')",
      ],
    ],
    hint: "先用完整格式校验，再把整数部分与小数部分组合，不经过 float。",
  },
});
u("crawler", {
  id: "crawl-robots",
  title: "robots.txt、缓存与访问策略",
  summary:
    "robots.txt 用于表达自动客户端访问规则，抓取前应解析匹配的 User-Agent 组并合理缓存。它不替代身份权限或数据使用授权，规则不可达时需要明确失败策略。",
  mechanism:
    "RFC 9309 规定路径匹配和错误处理。robots 的 crawl-delay 并非该 RFC 核心统一指令，客户端支持应核对。标准库 robotparser 可验证常见规则，但复杂模式与解析器差异需要用目标版本做契约测试。",
  steps: [
    "给采集器声明稳定 User-Agent，按站点获取和缓存 robots 及过期时间。",
    "区分不存在、禁止访问、服务器暂时不可达，遵循目标规范与项目访问策略。",
    "规则更新后重新检查待抓 URL，记录阻止原因，不把 403 当成需要突破的挑战。",
  ],
  pitfalls: [
    "允许抓取路径不等于允许任意保存、传播和复用所有数据。",
    "robots 只按路径和客户端规则表达意愿，不能用它保护真正私密内容。",
  ],
  question: "robots 规则与身份授权有什么不同？",
  scenario: "站点新增禁止目录，旧队列里仍有相关 URL，怎样处理？",
  answer:
    "更新缓存后在实际发请求前重新校验队列目标，将已禁止任务标记为策略跳过并记录规则版本。检查之前保存的数据是否仍符合业务用途与保留要求，调整范围。不要只在初次发现 URL 时检查一次就长期信任。",
  refs: ["robots-rfc", "py-robots"],
  code: String.raw`from urllib.robotparser import RobotFileParser
r=RobotFileParser()
r.parse(['User-agent: *','Disallow: /private/'])
show(r.can_fetch('StudyBot','https://example.test/articles/1'))
show(r.can_fetch('StudyBot','https://example.test/private/1'))`,
  logs: [true, false],
  explain:
    "样本在内存中解析两条规则，没有请求真实站点。结果只反映路径规则匹配，不表示其他访问条件、身份权限和数据使用许可已满足；生产任务还需要缓存、错误处理和每次发放前的范围校验。",
  choice: [
    "robots 允许路径意味着？",
    [
      "已经获得全部数据使用授权",
      "该规则下路径可抓，其他权限仍需单独确认",
      "可绕过登录",
      "必须无限频率请求",
    ],
    1,
    "robots 与身份、用途和频率约束分别处理。",
  ],
});
u("crawler", {
  id: "crawl-scheduler",
  title: "调度器、有界队列与背压",
  summary:
    "采集调度同时控制任务发现、等待、发放和完成。生产速度持续超过消费速度时，需要有界队列、暂停发现或持久化延迟任务，而不是任由内存队列增长。",
  mechanism:
    "并发限制控制正在执行的数量，队列容量控制等待任务，速率限制控制单位时间发放。优先级队列可按 next_run_at 安排重试；只有成功提交后才确认任务，失败恢复要避免丢失或重复副作用。",
  steps: [
    "为待抓、在途、已完成、延迟和失败任务建立明确状态与计数。",
    "队列达到容量时暂停上游或拒绝新增，按域公平发放，防止大站点独占。",
    "消费者异常时归还或重新调度任务，配合幂等存储和总预算。",
  ],
  pitfalls: [
    "Semaphore 不限制等待它的任务对象总数，创建百万任务仍可耗尽内存。",
    "队列为空不一定任务结束，还可能有在途请求或延迟重试。",
  ],
  question: "并发限制、队列容量与速率限制分别控制什么？",
  scenario: "URL 发现很快但数据库慢，内存持续上涨，怎样设计背压？",
  answer:
    "分别监控发现、请求、解析和写入队列，把最慢阶段作为容量依据。用有界通道让上游在下游积压时暂停，批量写入并控制事务长度。重试任务进入延迟队列，结束判定包含在途和延迟任务，而不只检查某一个队列为空。",
  refs: ["py-asyncio", "scrapy"],
  model: true,
  code: String.raw`capacity=3; queue=[]; rejected=[]
for url in ['a','b','c','d']:
    (queue if len(queue)<capacity else rejected).append(url)
show(queue)
show(rejected)`,
  logs: [["a", "b", "c"], ["d"]],
  explain:
    "小模型演示容量达到后必须选择拒绝或背压策略，未实现真实异步阻塞队列。实际可用 asyncio.Queue(maxsize=...) 配合固定消费者，注意 task_done、取消和异常清理；不能把拒绝后的任务悄悄丢弃而不记录。",
  choice: [
    "创建百万任务后只用 Semaphore(10)，能否保证内存有界？",
    ["能", "不能，等待任务本身仍占内存", "只要 await 就零内存", "由 DNS 决定"],
    1,
    "需要额外限制生产和待处理队列容量。",
  ],
});
u("crawler", {
  id: "crawl-rate",
  title: "按域限速、令牌桶与自适应退避",
  summary:
    "合理采集速度由站点延迟、错误率和允许的访问频率决定。全局并发与按域限速应共同存在，不能因为总并发不高就忽略对单个站点的瞬时压力。",
  mechanism:
    "令牌桶限制持续速率并允许有限突发；固定窗口可能在边界产生突发，滑动窗口更细。Scrapy AutoThrottle 根据延迟调节目标，但仍受配置和并发限制影响，不是无限自动优化。",
  steps: [
    "配置全局和域级并发、间隔及突发上限，分开记录目标站点状态。",
    "遇 429 或延迟恶化降低发放速度，用抖动避免多进程同时恢复。",
    "用可注入时钟测试算法，记录实际发放时间而不只看配置值。",
  ],
  pitfalls: [
    "并发 1 但每次响应很快仍可能每秒请求很多次。",
    "多个进程各自限速会把总速率相加，需要共享配额或按域分区。",
  ],
  question: "为什么并发限制不能代替速率限制？",
  scenario: "单线程爬虫仍被源站限流，如何解释？",
  answer:
    "查看单位时间请求数和响应耗时，单线程并不代表请求频率低。增加按域令牌桶或最小间隔，尊重 Retry-After 并设置最大突发。如果有多个实例，统一配额或把同域任务分配给同一调度分区，观察整体速率。",
  refs: ["scrapy-throttle"],
  model: true,
  code: String.raw`def refill(tokens,elapsed,rate,capacity):
    return min(capacity,tokens+elapsed*rate)
show(refill(0,2,3,5))
show(refill(1,0.5,2,5))`,
  logs: [5, 2],
  explain:
    "模型只计算补充令牌，真实发放还要原子扣减、时钟单调性和多消费者同步。浏览器示例固定时间输入便于验证，不使用 sleep 模拟实际调度；生产系统应按实际吞吐和对端反馈调节。",
  choice: [
    "令牌桶 capacity 主要控制？",
    ["URL 字符数", "允许的最大突发量", "数据库索引数", "永久存储时长"],
    1,
    "容量限制累积令牌，也就限制可瞬时发放的请求数。",
  ],
  fill: {
    prompt:
      "补充令牌：返回 min(capacity, tokens + elapsed * rate)，所有输入非负；不做扣减。",
    signature: "def refill_tokens(tokens, elapsed, rate, capacity):",
    solution:
      'def refill_tokens(tokens, elapsed, rate, capacity):\n    if min(tokens,elapsed,rate,capacity)<0:\n        raise ValueError("negative")\n    return min(capacity,tokens+elapsed*rate)',
    tests: [
      ["达到容量", "assert refill_tokens(0,10,2,5)==5"],
      ["部分补充", "assert refill_tokens(1,0.5,2,5)==2"],
      ["零流速", "assert refill_tokens(2,10,0,5)==2"],
    ],
    hint: "时间和流速相乘得到新增令牌，再取容量上限。",
  },
});
u("crawler", {
  id: "crawl-cache",
  title: "条件请求、ETag 与增量抓取",
  summary:
    "增量采集应尽量利用稳定标识、更新时间和 HTTP 验证器减少重复传输。ETag 是表示的验证器，不应假设一定是内容哈希；304 表示可复用已有表示，而不是新响应体。",
  mechanism:
    "If-None-Match 用于条件读取，匹配时可返回 304。Last-Modified 与 If-Modified-Since 也可验证，但精度与服务端实现不同。缓存键还要考虑 URL、Vary、身份和语言等表示维度。",
  steps: [
    "为来源保存验证器、原内容与解析版本，下一次请求附带条件头。",
    "收到 304 复用之前内容或结果，只有已有有效缓存时才可认为完整。",
    "内容未变但解析器升级时，仍可能需要重放原始响应更新结构化结果。",
  ],
  pitfalls: [
    "304 通常没有新的内容体，不能把空 body 写成空文章。",
    "共享缓存忽略认证与 Vary 可能串语言或串用户，爬虫缓存同样需要隔离。",
  ],
  question: "ETag 与内容指纹有何区别，304 应如何处理？",
  scenario: "增量抓取后大量文章正文被清空，发现响应是 304，如何修复？",
  answer:
    "恢复已有缓存或重新完整抓取，修正 304 分支为复用旧表示而非覆盖空 body。验证缓存存在、键正确且解析版本兼容，记录验证器和来源。如果缓存丢失，应发无条件请求，不能伪造成功内容。",
  refs: ["http-cache-rfc", "http-semantics"],
  model: true,
  code: String.raw`cached={'etag':'"v2"','body':'article'}
status=304
body=cached['body'] if status==304 else 'new'
show(body)
show({'If-None-Match':cached['etag']})`,
  logs: ["article", { "If-None-Match": '"v2"' }],
  explain:
    "模型展示 304 分支保留旧正文，没有进行真实缓存协商。生产实现还需检查缓存命中、Vary 与身份维度，并决定解析版本变化是否重放；ETag 的值应按源站返回保存，不自行假设其内部生成算法。",
  choice: [
    "收到 304 时一般应？",
    [
      "把空响应覆盖旧正文",
      "复用匹配的已有缓存表示",
      "当作新文章",
      "无条件永久失败",
    ],
    1,
    "304 是验证结果，通常依赖已有缓存体。",
  ],
});
u("crawler", {
  id: "crawl-storage",
  title: "去重、唯一约束、幂等写与检查点",
  summary:
    "可靠存储不能只依赖进程内 seen 集合。业务唯一键、内容版本、事务和检查点需要共同设计，使同一批次重放不会重复写，失败后也不会跳过未提交数据。",
  mechanism:
    "内存集合只能在当前进程存活期间去重，数据库唯一约束能在并发写入时提供最终约束。upsert 的键需要区分同一实体更新与不同实体；检查点必须在数据成功持久化后推进，最好与批次一起提交。",
  steps: [
    "确定自然键和版本键，URL 只是候选之一，不能总代表实体身份。",
    "用事务写入批次并更新进度，错误回滚，重启只重放未确认批次。",
    "保存来源与内容指纹，分别统计新增、更新、重复和失败。",
  ],
  pitfalls: [
    "先更新检查点再写数据可能造成永久漏采。",
    "把所有异常都按重复键处理，会隐藏连接故障、schema 错误和磁盘满。",
  ],
  question: "检查点与数据为什么需要相同的提交边界？",
  scenario: "任务崩溃后重复写了上千条，如何实现至少一次投递下的幂等落库？",
  answer:
    "接受任务可能重复投递，在数据库建立稳定唯一键并以事务执行 upsert。检查点只确认提交完成的批次，重放时根据键更新或忽略。通过写入中断故障测试确认不漏数据，区分重复记录和真正存储失败。",
  refs: ["scrapy", "py-context"],
  model: true,
  code: String.raw`store={}
for item in [{'id':'1','title':'A'},{'id':'1','title':'B'},{'id':'2','title':'C'}]:
    store[item['id']]=item
show(list(store.values()))`,
  logs: [
    [
      { id: "1", title: "B" },
      { id: "2", title: "C" },
    ],
  ],
  explain:
    "字典仅模拟按稳定键覆盖的逻辑，不提供数据库并发、持久化和事务保证。真实实现见本地配套采集项目的 SQLite 唯一主键和事务；测试需要重复运行与中断恢复，而不是只在一个进程内看到长度正确。",
  choice: [
    "避免确认后数据尚未提交的关键是？",
    ["先写检查点", "批次数据与检查点事务提交", "只用全局 set", "不记录错误"],
    1,
    "提交边界一致才能避免进度领先于数据。",
  ],
});
u("crawler", {
  id: "crawl-distributed",
  title: "分布式采集、租约与至少一次处理",
  summary:
    "分布式爬虫不只是把脚本开多份。共享队列需要任务认领、租约续期、失败回收和重复投递处理；跨进程的全局去重、域级配额与存储幂等必须协调。",
  mechanism:
    "任务被认领后在租约窗口内执行，超期可被回收重新分配，因此旧执行者可能仍在运行。fencing token 可让存储拒绝过期执行者，幂等键处理重复提交；仅使用分布式锁不自动获得 exactly-once 语义。",
  steps: [
    "用原子操作认领任务并记录 owner、lease_until、attempt 与版本号。",
    "心跳续约和失效回收要考虑进程暂停与网络分区，提交时校验租约版本。",
    "共享域级配额和幂等存储，监控积压、租约过期和重复执行比例。",
  ],
  pitfalls: [
    "锁超时后旧进程并不必然停止写数据，需要提交端拒绝过期令牌。",
    "Bloom filter 可能误判存在，不能在不能容忍漏采的任务中作为唯一去重依据。",
  ],
  question: "为什么分布式锁加超时仍不能保证任务只执行一次？",
  scenario:
    "机器卡顿导致租约过期，另一个 worker 接手后旧 worker 又写入，怎么控制？",
  answer:
    "给每次认领递增版本，并让存储层校验 fencing token，拒绝旧版本提交。接受重复投递，依靠稳定业务键和事务保持最终幂等。观测租约超时与处理时间分布，合理续约，但不能把延长锁时间当唯一保证。",
  refs: ["scrapy", "py-context"],
  model: true,
  code: String.raw`current_token=7
submissions=[('old',6),('new',7)]
show([name for name,token in submissions if token==current_token])`,
  logs: [["new"]],
  explain:
    "这里只模拟提交端检查当前令牌，未实现真正分布式原子操作。生产校验应在受保护资源的同一原子提交中完成，不能先在客户端比较后再无条件写入；模型用于理解旧执行者为何需要被拒绝。",
  choice: [
    "租约过期后旧 worker 还能运行，存储应如何防护？",
    ["只相信它自觉退出", "校验递增令牌并拒绝旧提交", "永远不超时", "忽略重复"],
    1,
    "提交端需要识别过期执行者，锁本身不能终止旧进程。",
  ],
});
u("crawler", {
  id: "crawl-incremental",
  title: "增量水位、迟到数据与删除同步",
  summary:
    "增量采集不只关注新增，还要处理更新、迟到和删除。更新时间水位必须配合稳定排序、重叠窗口和幂等写入，才能降低边界数据遗漏风险。",
  mechanism:
    "只用 updated_at > last_time 可能漏掉同一时间戳多条记录；组合游标 (updated_at,id) 可稳定推进。回看窗口吸收迟到更新，但会重复读取。删除需要 tombstone、删除接口或周期校准，不能从某一页缺失就推断被删除。",
  steps: [
    "明确数据源的更新时间语义、精度、时区与稳定排序字段。",
    "保存组合水位，设可解释的重叠窗口，用幂等存储消除重复。",
    "为删除和长时间不可见记录设计独立同步与对账流程。",
  ],
  pitfalls: [
    "采集机器当前时间不等于源数据水位，时钟偏差可能导致遗漏。",
    "分页缺失可能来自排序移动或权限变化，不能立刻删除本地实体。",
  ],
  question: "为什么时间水位常需要 ID 与重叠窗口？",
  scenario: "同一秒更新的最后几条记录总是漏掉，怎样改游标？",
  answer:
    "检查是否只保存秒级时间并使用严格大于查询。改为稳定的时间加 ID 组合边界，或回看一个重叠时间窗口再按业务键幂等写。核对源端排序与时区，给同时间戳多记录和迟到更新建立样本。",
  refs: ["py-types", "http-semantics"],
  code: String.raw`rows=[(10,'a'),(10,'b'),(11,'a')]
watermark=(10,'a')
show([list(row) for row in rows if row>watermark])`,
  logs: [
    [
      [10, "b"],
      [11, "a"],
    ],
  ],
  explain:
    "元组按字典序比较，使同一时间的 b 不会因只看时间而被跳过。真实接口必须提供一致的排序契约，ID 的比较方式也要与源端一致；若排序不稳定，应依靠回看、快照或对账补足，而不是仅在客户端比较元组。",
  choice: [
    "仅用秒级时间水位可能漏掉？",
    [
      "同秒但尚未采集的其他记录",
      "所有英文标题",
      "全部成功请求",
      "只会多采不会漏",
    ],
    0,
    "相同时间戳多记录需要额外稳定边界或重叠重放。",
  ],
});
u("crawler", {
  id: "crawl-quality",
  title: "数据质量、样本回放与变版检测",
  summary:
    "采集成功率应区分网络成功、解析成功和字段质量。页面模板变化常表现为 HTTP 仍成功但关键字段缺失；固定样本回放和批次质量门禁能更早发现污染。",
  mechanism:
    "指标至少包括状态分布、有效记录率、必填缺失率、重复率、字段分布和解析版本。异常阈值要基于样本基线与业务后果；保存受控脱敏响应便于离线重现，减少对源站的重复访问。",
  steps: [
    "给每个解析器维护正常、缺字段、空页和错误模板样本。",
    "发布前对历史样本回放，比较字段结构与记录数，而非只看函数无异常。",
    "批次异常时隔离数据，保留质量报告和来源，以便修复后重算。",
  ],
  pitfalls: [
    "有效记录率分母必须明确，不能把所有失败先丢掉再宣称 100%。",
    "仅靠总条数不能发现字段错位或单位错误，需要字段级与关联约束。",
  ],
  question: "怎样判断采集是真的成功而不是只收到了 HTTP 200？",
  scenario: "某次改版后标题正常但价格全空，如何设置告警与回滚？",
  answer:
    "监控必填缺失率和字段分布，让批次质量门禁阻止异常数据进入正式表。回放改版前后样本定位选择器，保留原始响应和解析版本。修复后重放受影响批次，质量报告应包含网络、解析和业务验证三个分母。",
  refs: ["py-test", "scrapy-selectors"],
  code: String.raw`records=[{'title':'A','price':10},{'title':'B','price':None},{'title':'C','price':None}]
valid=sum(r['price'] is not None for r in records)
show({'valid':valid,'total':len(records),'quarantine':valid/len(records)<0.8})`,
  logs: [{ valid: 1, total: 3, quarantine: true }],
  explain:
    "阈值 0.8 是教学设定，并非所有业务通用。统计保留了全部三条作为分母，避免先丢失败记录再计算。真实门禁应结合历史基线、关键字段和影响程度，并能从异常批次追溯到响应样本。",
  choice: [
    "哪个指标最能直接暴露价格字段解析失效？",
    ["HTTP 200 比例", "价格缺失率与字段分布", "进程启动次数", "日志总行数"],
    1,
    "网络成功不等于字段解析正确，需要字段级质量指标。",
  ],
});
u("crawler", {
  id: "crawl-observability",
  title: "采集可观测性、错误预算与回放",
  summary:
    "诊断采集故障需要贯穿任务、请求、解析和存储的关联标识。日志说明单次事件，指标描述趋势，样本回放提供复现；三者不能互相完全替代。",
  mechanism:
    "每个 run_id 下有多个任务和请求尝试，重试应保留同一业务任务标识而区分 attempt。延迟应按阶段统计，分位数比只有平均数更能暴露长尾；错误分类与质量分母应稳定。",
  steps: [
    "日志加入 run_id、URL 指纹、阶段、attempt、耗时和错误类别，敏感内容脱敏。",
    "监控积压、完成吞吐、域级 429、解析失败、存储等待和端到端新鲜度。",
    "为告警附带可回放样本与运行配置，不把大量原文和凭据写入常规日志。",
  ],
  pitfalls: [
    "平均耗时低不能证明没有大量超时长尾，且失败样本不能从延迟统计里消失。",
    "把完整 Cookie 和 Authorization 当诊断上下文会泄露会话。",
  ],
  question: "如何区分源站慢、解析慢和数据库慢？",
  scenario: "整体吞吐下降但总 CPU 不高，应先看哪些数据？",
  answer:
    "对比连接等待、网络响应、解析队列、存储队列和域级退避时间，确认哪个阶段积压。检查吞吐分母是否包含重试和失败，按域与响应大小分组。使用关联标识抽取少量慢任务的完整阶段轨迹，再决定扩容或调整限流。",
  refs: ["scrapy", "httpx"],
  code: String.raw`timings={'queue':30,'network':120,'parse':10,'store':240}
show(max(timings,key=timings.get))
show(sum(timings.values()))`,
  logs: ["store", 400],
  explain:
    "固定阶段时长说明总体等待可能由存储占据，即使 CPU 不高也能成为瓶颈。真实并发链路可能有重叠阶段，不能简单求和所有并行 span；应区分关键路径、累计工作量和端到端耗时。",
  choice: [
    "诊断不同阶段瓶颈最需要？",
    [
      "只看总 CPU",
      "关联标识与阶段耗时、队列指标",
      "无限提高并发",
      "只保留成功日志",
    ],
    1,
    "阶段观测能把整体问题定位到具体环节。",
  ],
});
u("crawler", {
  id: "crawl-scrapy",
  title: "Scrapy 架构、Middleware 与 Pipeline",
  summary:
    "Scrapy 将发现、调度、下载、解析和结果处理分开。Spider 描述抽取与跟进，Middleware 处理请求响应横切策略，Pipeline 承担记录验证与存储，不能把所有逻辑堆进 parse。",
  mechanism:
    "Engine 协调 Scheduler、Downloader 和 Spider，下载中间件处于请求响应路径，Spider 中间件处理 Spider 输入输出。Pipeline 接收 Item 逐步处理；调度和去重行为要与请求指纹、重试及持久化配置一起理解。",
  steps: [
    "Spider 保持解析和链接发现职责，鉴权、重试和请求头策略在合适中间件实现。",
    "Pipeline 分层做验证、标准化和存储，保留来源与错误分类。",
    "为 selectors 写离线样本测试，为整体任务配置限速、并发和持久化恢复。",
  ],
  pitfalls: [
    "在 parse 里同步调用阻塞数据库或 HTTP 库会拖慢事件循环。",
    "框架默认去重不自动解决业务实体更新和跨任务持久化幂等。",
  ],
  question: "Spider、Downloader Middleware 与 Item Pipeline 如何分工？",
  scenario:
    "parse 函数同时登录、重试、解析和写库，修改一个字段就影响全链路，怎样重构？",
  answer:
    "先以行为测试固定当前输入输出，再按职责拆成解析函数、请求策略与存储 Pipeline。登录状态按任务身份隔离，重试保留预算，存储以批次和唯一键幂等提交。逐步迁移并观测每阶段指标，不必一次推翻全部框架代码。",
  refs: ["scrapy", "scrapy-throttle", "scrapy-selectors"],
  model: true,
  code: String.raw`flow=['scheduler','downloader middleware','downloader','spider','item pipeline']
show(flow)
show(flow.index('spider')<flow.index('item pipeline'))`,
  logs: [
    [
      "scheduler",
      "downloader middleware",
      "downloader",
      "spider",
      "item pipeline",
    ],
    true,
  ],
  explain:
    "列表是简化的数据流示意，真实框架有双向中间件调用、引擎协调和异常路径。这里不在浏览器运行 Scrapy；本地项目安装框架后应按当前官方文档配置，并分别测试纯解析器和框架集成。",
  choice: [
    "记录验证与写入通常更适合放在？",
    ["所有逻辑放 parse", "Item Pipeline", "HTML 标题节点", "全局 except"],
    2,
    "Pipeline 适合记录处理与存储；Spider 聚焦解析与发现。",
  ],
});
u("crawler", {
  id: "crawl-project",
  title: "从采集到 API 与 RAG 的完整项目链路",
  summary:
    "完整数据应用将采集、验证、存储、接口和检索连接起来，同时保留每一步的来源与版本。可重放、可去重和可评估比一次演示抓到页面更能证明工程能力。",
  mechanism:
    "采集得到 raw response，经解析与字段校验落库，服务层提供分页与查询；文档再经分块和索引进入 RAG。实体 ID、解析版本、索引版本和引用信息要贯穿全链路，更新或删除才能传播到下游。",
  steps: [
    "先用本地固定站点实现两页采集、解析、SQLite 幂等写入和第二次运行验证。",
    "给结果定义 RESTful 查询契约，验证分页、错误表示和来源信息。",
    "再构造带引用的检索结果与回答评估，保留不命中时的拒答和数据删除传播。",
  ],
  pitfalls: [
    "把爬虫结果直接塞进 prompt 不会自动获得高质量 RAG，仍需检索与回答评估。",
    "页面数、记录数、块数和回答数是不同分母，不能混成一个成功率。",
  ],
  question: "如何设计一个可复现的采集 → API → AI 问答作品？",
  scenario: "面试官要求现场演示网站变版后的修复与重建，你会准备哪些材料？",
  answer:
    "准备固定旧版和新版 HTML、解析测试、数据库快照、索引版本与评估集。现场修改解析器后离线回放，先通过质量门禁再幂等入库并重建受影响索引。展示引用回链、缺失证据时的行为和阶段指标，避免只展示一个恰好成功的问题。",
  refs: ["scrapy", "py-test", "llm-evals"],
  model: true,
  code: String.raw`record={'id':'a1','source_url':'https://example.test/a1','parser_version':'2','text':'Python course'}
chunk={'id':record['id']+':0','document_id':record['id'],'source_url':record['source_url']}
show(chunk)
show(chunk['document_id']==record['id'])`,
  logs: [
    { id: "a1:0", document_id: "a1", source_url: "https://example.test/a1" },
    true,
  ],
  explain:
    "示例验证文档到块的来源关系，没有训练或调用大模型。随附本地项目提供真实标准库采集、SQLite、HTTP API 和确定性检索端点，用于先练通工程链路，再接入需要密钥与费用管理的真实模型适配器。",
  choice: [
    "贯穿采集与 RAG 最重要的一类元数据是？",
    [
      "只保留最终回答",
      "来源、实体 ID 与处理版本",
      "随机颜色",
      "只记录模型名字",
    ],
    1,
    "来源和版本使更新、删除、引用和故障重放可追踪。",
  ],
});
