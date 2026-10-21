import { lessons, topic as t } from "./base.mjs";
const extra = {
  "net-cache":
    "缓存排查需同时看内存/磁盘缓存、Service Worker 与 CDN，DevTools 的禁用缓存会改变实验条件。",
  "css-flex-grid":
    "内容的 min-content 尺寸、图片固有尺寸与换行规则也会影响结果，布局测试应覆盖极长文本与空内容。",
  "mini-performance-api":
    "启动采样应包含失败和超时记录，否则只有成功样本会让整体结果显得过好。",
  "eng-build":
    "同一构建工具不同版本和插件组合也可能改变产物，应记录 lockfile 与实际命令。",
  "eng-quality":
    "外部数据要在边界验证后再进入可信领域模型，避免全链路到处重复猜测空值。",
  "eng-microfrontend":
    "远程入口超时、版本不可用和共享依赖不兼容时，应让壳与其他应用继续可用。",
  "node-api":
    "写入还需数据库唯一约束与事务保护，多实例同时请求时以数据库事实为准。",
  "perf-vitals":
    "样本只上报成功打开的页面会漏掉严重启动失败，需要补充业务成功率与超时指标。",
  "perf-firstscreen":
    "字体加载策略影响文本可见和布局稳定，优化时同时观察 CLS 与内容可读性。",
  "perf-offline":
    "缓存读取和持久化都可能因配额或隐私模式失败，应提供内存回退并提示保存状态。",
  "perf-longtask":
    "任务取消时应停止后续分片，避免用户离开后旧计算继续竞争资源。",
  "perf-release":
    "功能开关应定义默认值与失效策略，远程配置失败不能导致全部业务不可启动。",
  "algo-cycle":
    "找入口还需第二阶段指针推进，必须证明各指针的距离关系；合并链表要明确输入是否共享节点。",
  "algo-stack":
    "若输入规模巨大，还需要限制最大嵌套深度与缓冲大小，避免恶意数据耗尽内存。",
  "algo-lru":
    "TTL 与淘汰顺序独立，过期数据被读取时必须失效，容量也可按字节而不是只按条目计算。",
  "design-upload":
    "服务端还应防压缩炸弹、路径穿越和重复片段覆盖，分片会话要绑定上传用户。",
  "design-state":
    "跨应用票据应绑定用途、受众和时效，接收方仍按自己的资源规则校验权限。",
  "project-story":
    "分享证据时需要脱敏，不以暴露前公司的私有代码、用户数据或密钥来证明贡献。",
  "project-metrics":
    "记录失败样本和异常值处理规则，删除尾部数据可能让报告误导决策。",
  "project-refactor":
    "兼容层是迁移工具，不应永久吞掉所有差异而让新边界失去意义。",
  "project-depth":
    "对源码实现的推断应标为推断，使用最小实验和版本记录补足验证。",
  "ai-agent":
    "工具运行日志与用户看到的状态要关联同一 operationId，避免重连后重复执行。",
  "ai-dev":
    "测试用例也可能由同一错误假设生成，应引入独立契约、边界和反例验证。",
  "arch-crossplatform":
    "宿主 SDK 与插件版本需要维护兼容矩阵，升级不是只改一个依赖版本号。",
  "arch-scale":
    "恢复流量也会形成洪峰，应设计逐步探测与抖动，观察下游队列和超时。",
  "arch-platform":
    "共享库需要明确所有者和响应机制，代码统一却无人维护并不会降低总成本。",
  "arch-future":
    "评估要包含错误结果、拒绝处理、用户修正和故障恢复，不能只挑成功演示。",
  "study-plan":
    "计划表中的研读时间只是估计；手写、源码阅读和真实项目复盘需要额外安排与动态调整。",
};
for (const l of lessons) {
  if (extra[l.id]) {
    l.sections[2].content += "\n- " + extra[l.id];
    l.interview.answer += "\n\n补充边界：" + extra[l.id];
  }
}
t(
  "js",
  "js-invoke",
  "手写 call / apply：调用与对象约束",
  "call/apply 的差异主要是参数传入方式；教学实现通过临时属性调用模拟 this，但无法完整复制原生内部调用语义。",
  "普通非严格函数会对 null/undefined 和原始值 this 做规范化，严格函数则保留传入值；这一决定来自目标函数自身，简单把 context 强制装箱的实现会改变严格函数行为。用 Reflect.apply 才能可靠保留原生调用语义。",
  "教学临时属性法用 Symbol 避免键冲突，try/finally 清理属性。|冻结或不可扩展对象不能随意加属性；代理的 set/delete 也可能产生副作用。|apply 接收参数列表要验证契约；生产封装优先使用原生 Reflect.apply。",
  "临时 Symbol 属性法不支持所有对象，也不等同原生 call/apply。|不要直接改 Function.prototype 来做个人项目实验，避免污染依赖。",
  "手写 call/apply 时有哪些常见语义缺口？",
  "context 是 Object.freeze({})，临时加方法的 myCall 失败，怎么解释？",
  "该实现把“调用时指定 this”转换成“给对象增属性再调用”，额外引入了可扩展性要求。原生调用没有这个要求，使用 Reflect.apply；面试中明确教学方法的边界比声称完全等价更专业。",
  "call apply Reflect Symbol 冻结对象",
  `function invoke(fn, context, args = []) {
  if (typeof fn !== 'function') throw new TypeError('fn');
  return Reflect.apply(fn, context, args);
}
// 临时属性法仅作讨论，不作为原生语义的完整替代。`,
);
t(
  "js",
  "js-bind",
  "手写 bind：预置参数与构造调用",
  "bind 预置 this 和部分参数，返回绑定函数；new 调用绑定函数时构造目标实例，忽略绑定的 thisArg。",
  "绑定函数拥有特殊内部行为，原生 bound function 的 prototype、name、length 与构造能力并非普通包装函数天然具备。教学包装可以通过 new.target 区分调用方式，再用 Reflect.construct 保留构造器返回对象等规则。",
  "普通调用将预置参数和本次参数连接，Reflect.apply 到目标。|构造调用使用 Reflect.construct，说明 newTarget 对原型选择的影响。|覆盖返回对象、原型继承和箭头目标不可构造等情况，并声明 name/length 等差异。",
  "判断 this instanceof wrapper 不是区分 new 的完美方法。|普通函数包装箭头目标仍会暴露表面可构造性，必须处理真实目标的限制。",
  "bind 为什么还要考虑被 new 调用的情况？",
  "绑定构造器到 obj 后 new Bound()，实例会等于 obj 吗？",
  "不会，构造调用会创建自己的 this，绑定的 thisArg 被忽略，但预置参数仍参与。实例原型与目标构造器规则相关，教学实现应验证 instanceof 和显式返回对象的行为。",
  "bind new.target Reflect.construct 偏函数",
  `function bindLike(target, context, ...preset) {
  if (typeof target !== 'function') throw new TypeError('target');
  function bound(...args) {
    if (new.target) {
      return Reflect.construct(target, [...preset, ...args],
        new.target === bound ? target : new.target);
    }
    return Reflect.apply(target, context, [...preset, ...args]);
  }
  // 教学实现：name、length、prototype 等不完全等价原生 bind。
  return bound;
}`,
);
t(
  "js",
  "js-new",
  "手写 new：原型与返回值覆盖",
  "new 的关键步骤是选择原型、创建实例、执行构造器和采用对象返回值；Reflect.construct 能覆盖更多原生构造行为。",
  "普通构造器未返回对象时使用新实例，返回对象/函数时用返回值替代。prototype 非对象时原生有回退规则。class 构造器需要内部 Construct，不能当普通函数 Reflect.apply，因此简易 create+apply 不支持所有构造器。",
  "先声明题目输入是普通构造函数还是包含 class、内置构造器。|普通教学版选择 Ctor.prototype，Object.create 后调用，再判断返回值是否对象或函数。|生产委托 Reflect.construct；不可构造目标应抛 TypeError。",
  "typeof null 为 object，但不能把 null 当覆盖实例的对象返回值。|ES class、Date 等不能假设用 apply 就能完成原生构造。",
  "new 的四个步骤是什么？为何教学实现与原生仍有差异？",
  "构造函数 return {x:1} 时，instanceof 原构造器为什么可能为 false？",
  "返回对象替代了默认创建的实例，它的原型未必链接到构造器 prototype。因此 new 的语法并不保证最终返回值一定是该构造器的原型实例；返回原始值则不会替代。",
  "new constructor Reflect.construct 原型",
  `function construct(Ctor, args = []) {
  return Reflect.construct(Ctor, args);
}
// 普通函数教学步骤：创建对象 → 设原型 → 调用 → 处理对象返回值。`,
);
t(
  "js",
  "js-instanceof",
  "手写 instanceof：原型身份与自定义行为",
  "普通 instanceof 检查右侧 prototype 是否在左侧原型链中，但 Symbol.hasInstance 可以改写该行为。",
  "沿 Object.getPrototypeOf 逐级向上比较引用可模拟常规函数场景。原始值通常不满足普通对象原型检查，右值非可调用且无合法 hasInstance 会出错；绑定函数与跨 realm 行为还需要额外处理。",
  "教学实现先限定右值为普通函数且 prototype 是对象。|原型链逐级比较，不读取可伪造的 constructor.name。|跨环境数组用 Array.isArray；结构化对象校验用业务 schema。",
  "Symbol.hasInstance 可让原始值也满足自定义判断，不能把简单遍历称完整规范实现。|原型被修改后 instanceof 的结果也可能改变。",
  "instanceof 的原理与适用边界是什么？",
  "有人修改 obj.__proto__ 后类型检查结果改变，是否说明对象“本质类型”变了？",
  "instanceof 检查当前原型关系，不是不可更改的业务类型。业务可信度应该由输入契约和字段验证定义；对内置品牌用合适专用检测，不依赖可变原型作为权限依据。",
  "instanceof Symbol.hasInstance prototype",
);
t(
  "js",
  "js-promise-handwrite",
  "教学 Promise：最小状态机与规范差距",
  "从最小状态机理解链式组合，但必须把只支持普通值的简化版与完整 Promise Resolution Procedure 区分。",
  "最小实现要保存 pending/fulfilled/rejected、结果值与等待回调。then 创建新实例，回调在微任务运行，返回值再被解析；异常拒绝新实例。完整规范还要处理 thenable getter、只调用一次、嵌套采用、自解析和迭代边界等情况。",
  "先实现状态仅改变一次，then 注册前后均能触发回调。|缺回调时透传值/错误；回调抛错、返回新 Promise 和 thenable 分开测试。|如果没有完成 A+ 解析与测试，文档标为学习实现，生产继续用原生 Promise。",
  "只实现 resolve/reject/then 方法名不代表符合规范。|不能以 setTimeout 回调代替微任务却声称与原生顺序完全一致。",
  "手写 Promise 应按什么顺序实现和验证？",
  "自写 then 返回自己，程序无限递归，你漏了什么？",
  "解析过程需要检测 promise2===x 并拒绝 TypeError，避免自解析；还需一次性 resolve/reject 保护、then getter 异常与回调抛错处理。先明确承诺实现的规范范围，再做一致性测试。",
  "Promise A+ 状态机 thenable 自解析",
);
t(
  "js",
  "js-throttle",
  "手写节流：首尾语义与时间线",
  "节流没有唯一默认语义，先明确首缘、尾缘、时间窗口和取消行为，再编码并画时序验证。",
  "时间戳版常做到立即执行并跳过窗口内调用，计时器版常合并到尾缘；同时支持首尾时，要避免窗口末尾与下窗口首缘重复或漏掉最后参数。时钟回拨和后台定时器节流也影响实现。",
  "本项目实验采用首个立即、窗口内保留最后一次、到期尾执行，并提供 cancel。|执行时更新计时状态，回调异常不应让内部状态永久卡住。|滚动 UI 可按渲染帧合并，统计采样则按业务时间频率；二者指标不同。",
  "计时器不能保证准点触发，后台页面还可能被明显降频。|leading=false/trailing=false 等组合必须声明，不把面试简化实现误当成熟库全部行为。",
  "如何实现兼顾首尾的节流，哪些边界最易错？",
  "用户在窗口末尾最后一次拖动后停止，纯时间戳节流会丢最后值吗？",
  "可能会，因为最后一次落在窗口内被丢弃且没有尾部任务。需要保存最新参数并安排 trailing；释放拖拽时也可显式提交最终业务值，分开保证动画采样与最终状态正确。",
  "throttle leading trailing 节流 cancel",
);
t(
  "network",
  "net-dns-tcp",
  "DNS、TCP 握手与连接复用",
  "DNS 完成名称解析，TCP 建立可靠有序字节流；连接复用、拥塞和关闭状态会影响实际延迟。",
  "DNS 可经历多层缓存与递归/迭代查询；TCP 三次握手交换序列号并确认双向收发能力。拥塞控制约束网络注入速率，流量控制保护接收方；二者目的不同。HTTP/3 的 QUIC 不走 TCP，应限定协议栈。",
  "分开分析 DNS、TCP、TLS、TTFB，确认连接是否已复用。|TCP 是字节流，业务帧要自行界定；粘包/拆包是应用边界处理问题。|TIME_WAIT 等状态与连接关闭有关，排障结合抓包与系统连接统计。",
  "三次握手不能概括成“确认服务端在线”。|TCP 保证传输层交付不等于业务持久化，更不能代替 ACK 协议定义。",
  "DNS、TCP、TLS 各自解决什么问题？",
  "相同接口第一次慢、第二次快，是否一定是服务端缓存？",
  "不一定，DNS 缓存、连接复用、TLS 会话恢复、HTTP 缓存和 JIT 都可能影响。观察 Network 的连接与 timing，控制缓存条件做对照，不能只依据两次耗时推断服务端命中。",
  "DNS TCP 握手 流量控制 拥塞控制",
);
t(
  "network",
  "net-storage",
  "Cookie、Web Storage 与 IndexedDB",
  "浏览器存储按容量、同步开销、生命周期和安全边界选择；任何客户端存储都不应当作不可伪造的权威来源。",
  "Cookie 随匹配请求自动携带，适合会话但要控制大小与属性；localStorage/sessionStorage 是同步字符串接口，可能阻塞主线程，生命周期不同。IndexedDB 提供异步结构化存储与事务，适合较多离线数据，但仍受配额和清理策略影响。",
  "敏感凭证按威胁模型选择，HttpOnly cookie 可限制直接读取但仍需 CSRF 设计。|持久状态带 schemaVersion，处理旧版本迁移、损坏和写入失败。|多页签用合适的同步机制，事件通知不等于跨页事务锁。",
  "XSS 可读取非 HttpOnly 的可访问数据；前端加密且密钥同存不能自动解决该问题。|浏览器存储可能被用户或系统清理，不等于永久数据库。",
  "Cookie、localStorage、sessionStorage、IndexedDB 如何选？",
  "把几 MB 大对象每次输入都 JSON.stringify 到 localStorage，会有什么问题？",
  "同步序列化和写入占用主线程，配额/隐私模式可能抛错。用增量或延迟保存、IndexedDB 异步存储，并保留内存状态和失败提示；关键编辑先保证恢复语义而非只追求落盘频繁。",
  "Cookie localStorage IndexedDB sessionStorage",
);
t(
  "css",
  "css-center",
  "居中方案、尺寸约束与溢出",
  "居中先区分行内/块、单轴/双轴、是否已知尺寸以及溢出时的可达性，再选择合适布局。",
  "Flex 的 justify-content/align-items 依赖主轴方向；Grid 的 place-items 适合二维对齐；绝对定位配 translate 可居中未知尺寸，但脱离文档流。块盒 auto margin 解决特定水平方向分配，line-height 只适合很受限的单行文本。",
  "现代通用容器优先 Flex/Grid，内容尺寸保持可伸缩。|弹窗高度受视口约束并提供内部滚动，避免居中后顶部内容跑出屏幕无法访问。|考虑垂直书写、RTL、移动键盘和安全区域，不将截图居中等同交互正确。",
  "transform 居中会创建额外层叠/包含块条件，需要检查 fixed 子元素。|不建议用大段固定 margin 或单行 line-height 处理多行动态内容。",
  "水平垂直居中有哪些方案，各自限制是什么？",
  "内容超高的居中弹窗顶部无法滚到，怎么修？",
  "容器限制最大高度并管理 overflow，内容区独立滚动，必要时采用安全对齐或从顶部开始；验证键盘打开、小屏、长文本与焦点可见性。布局必须保证所有内容能被到达。",
  "居中 Flex Grid translate overflow",
);
t(
  "mini",
  "mini-request",
  "wx.request 封装、取消与错误分类",
  "请求层统一超时、鉴权、并发和观测，但保留原生 RequestTask 的取消能力；HTTP 失败和接口调用失败要区分。",
  "wx.request 的 success 表示请求调用层成功返回，不等于业务成功；需要检查 statusCode 和业务码。返回的 RequestTask 可 abort，封装成 Promise 时不能丢掉取消通道；重试仍遵守幂等与预算。",
  "建立 response/error 结构，区分网络失败、超时、取消、HTTP 和业务错误。|并发队列传任务函数，开始时记录执行时间；登录刷新使用单飞，避免多请求同时重登。|退出/卸载/参数变化时取消或忽略旧结果，日志带请求 ID 并脱敏。",
  "请求成功回调里 4xx/5xx 仍需自行判定失败。|平台并发或域名规则随基础库与环境变化，查询文档而非硬编码旧经验。",
  "如何把 wx.request 封装成可取消、可观测的业务请求层？",
  "你封装的 Promise 没有 abort 方法，页面退出后请求继续，怎么改？",
  "返回 {promise,cancel} 或接收可取消信号，把 cancel 适配到 RequestTask.abort；状态结算只执行一次，取消以专用错误表达。即便取消也校验页面/请求版本，避免晚到结果提交。",
  "wx.request RequestTask abort statusCode",
);
t(
  "algorithm",
  "algo-kmp",
  "字符串匹配：朴素算法与 KMP",
  "KMP 复用已匹配前后缀信息，在失配时移动模式位置而不回退文本指针；理解前缀表比背 next 数组格式更重要。",
  "前缀函数 pi[i] 表示模式前缀中最长相等真前后缀长度。构建表与匹配都在失配时沿 pi[j-1] 回退，摊还总时间 O(n+m)。不同教材 next 定义可能不同，应先说明索引语义。",
  "空模式按本题契约返回 0，无匹配返回 -1。|为重复模式如 ababaca 手动画前缀表，解释为什么回退不漏解。|字符串按 UTF-16 码元返回索引还是按码点匹配必须明确，生产使用平台方法前也检查语义。",
  "不能只记遇错 j=next[j] 而不明确 next 的含义。|模式很短时 KMP 额外预处理未必有明显实际收益。",
  "KMP 如何避免朴素匹配的重复比较？",
  "模式大量重复时，为什么失配不能简单把 j 置零？",
  "置零会抛弃已知可复用前后缀，导致重复扫描。前缀表给出仍可能匹配的最长边界，再沿更短边界回退；文本指针不倒退，保证线性摊还复杂度。",
  "KMP next 前缀函数 字符串匹配",
);
t(
  "mini",
  "mini-update",
  "启动、版本更新与兼容发布",
  "小程序代码与服务端接口并非原子切换；新旧客户端会并存，更新提示需要保护用户进行中的任务。",
  "冷/热启动与后台保活影响代码初始化和缓存状态；平台更新管理能力提供检查、准备等通知，实际应用更新要按宿主规则处理。用户可能长时间停留旧版本，服务端不能假设上传新包后所有用户都同步升级。",
  "接口向后兼容并带版本能力协商，关键变更使用灰度与服务端开关。|更新就绪时先保存草稿、确认交易状态，再在合适时机应用更新。|启动失败和缓存损坏留恢复入口，埋点标记代码与基础库版本以定位分布。",
  "强制更新不应中断未确认的付款或丢掉编辑内容。|开发者工具中的自动重启行为不代表用户真机生命周期。",
  "小程序版本更新与服务端兼容怎么设计？",
  "新接口只支持新包，但大量用户还在旧页面，怎么安全切换？",
  "采用新增字段/接口的兼容扩展，保留旧契约直到观察到足够迁移；服务端按能力或版本路由，必要时提示更新并保护进行中任务。先发布兼容服务端，再放量客户端，最后移除旧逻辑。",
  "UpdateManager 冷启动 热启动 版本兼容",
);
