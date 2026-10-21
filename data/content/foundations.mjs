import { topic as t } from "./base.mjs";
t(
  "js",
  "js-event-loop",
  "浏览器事件循环与微任务",
  "同步栈先执行，微任务在检查点清空，随后浏览器可能获得渲染机会；定时器只是达到最早可调度时间。",
  "事件循环按任务源选择可执行任务。一个任务执行结束后，在相应检查点清空微任务队列，期间新入队的微任务也会继续执行。渲染是宿主调度的一部分，不是每个任务后必然发生；Promise 构造器同步执行，then 回调异步执行。",
  "区分任务：脚本、定时器、用户交互；微任务：Promise reaction、queueMicrotask、MutationObserver 回调。|逐行记录调用栈、微任务入队顺序和任务来源，再展开执行结果。|连续微任务可能饿死渲染；大计算应拆任务或交给 Worker，而不是不断 Promise.resolve。",
  "不要把所有异步回调都叫宏任务。|setTimeout(fn,0) 不承诺立刻执行，也不等于一帧。",
  "如何分析 Promise、queueMicrotask 与 setTimeout 的输出顺序？",
  "页面用递归 queueMicrotask 分片处理大数组，为什么还是无法响应点击？",
  "微任务检查点会持续执行新加入的微任务，浏览器很难进入下一次任务和渲染。改用带预算的任务分片或 Worker；用 Performance 面板检查长任务和输入延迟，并保证任务取消。",
  "eventloop Promise 微任务 任务 饥饿",
  `console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => {
  console.log('C');
  queueMicrotask(() => console.log('D'));
});
console.log('E');
// A E C D B`,
  ["html-loop", "ecma"],
);
t(
  "js",
  "js-async-await",
  "async / await 与错误传播",
  "async 总是返回 Promise；await 暂停当前函数，把后续逻辑放到 Promise 完成后的续体中，不会阻塞线程。",
  "await 会将等待值按 Promise 规则处理。等待完成后，当前 async 函数从暂停处继续；普通值也会产生异步恢复。try/catch 能捕获被 await 的拒绝，却不能捕获一个启动后未等待的异步任务的未来异常。",
  "相互独立的任务先创建 Promise 再 Promise.all 等待，避免无意串行。|有依赖的任务保持串行，并在边界处理异常、取消和结果过期。|forEach 不等待 async 回调；有序串行用 for...of，受控并行用调度器。",
  "不要把 await 当作线程锁。|不要用 new Promise(async executor) 包装异步逻辑，它会混淆拒绝通道。",
  "async / await 如何影响调度和异常处理？",
  "搜索词变化时依次请求接口，旧结果最后返回覆盖新结果，如何处理？",
  "为每轮请求分配递增序号，提交状态前校验是否仍是最新；支持时取消旧请求以节省资源。取消并不能取代结果校验，因为服务端可能已经完成或取消发生竞态。",
  "async await 异步 错误 竞态",
  `let version = 0;
async function search(query) {
  const current = ++version;
  const response = await fetch('/search?q=' + encodeURIComponent(query));
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const result = await response.json();
  if (current === version) return result;
}`,
);
t(
  "js",
  "js-scope",
  "作用域、提升与 TDZ",
  "JavaScript 使用词法作用域；var 提升后初始化为 undefined，let / const 在绑定初始化前处于暂时性死区。",
  "函数创建时确定可访问的词法环境，调用位置不会改变作用域链。块级绑定存在于整块，但初始化前访问会抛 ReferenceError；const 限制绑定重新赋值，不使对象深度不可变。",
  "识别全局、模块、函数、块作用域以及遮蔽关系。|区分函数声明、var、let、const 的创建和初始化时间。|循环 let 为每轮建立可供闭包捕获的绑定，var 通常共享同一个绑定。",
  "typeof 未声明变量安全，但 typeof TDZ 内变量也会抛错。|浏览器脚本顶层 var 和 ESM 顶层声明的全局行为不同。",
  "为什么 let 有提升却不能在声明前访问？",
  "for 循环里注册三个定时器都输出 3，怎样解释和修复？",
  "var 的三个回调捕获同一函数作用域绑定，回调执行时循环已结束。用 let 创建逐轮绑定，或显式函数传参捕获当次值；延长定时器时间不能修复绑定模型。",
  "scope TDZ let const var 闭包",
);
t(
  "js",
  "js-this",
  "this、箭头函数与绑定优先级",
  "普通函数的 this 由调用方式决定；箭头函数捕获词法 this，call / apply / bind 无法改写它。",
  "先看是否通过 new 调用，再看是否显式绑定或对象成员调用，最后考虑默认调用。严格模式下普通函数默认 this 为 undefined。bind 产生绑定函数，构造调用时绑定的 thisArg 不参与实例 this 的选择。",
  "识别 obj.fn() 与 const f=obj.fn; f() 的调用差异。|事件、定时器、回调中要根据宿主调用约定判断 this，不能只看函数定义位置。|手写 bind 要讨论参数预置、new 调用与原生绑定函数的语义差距。",
  "箭头函数没有自身 this，也不能作为构造器。|把方法赋给变量会丢失对象调用关系，不是对象方法的 this 永久绑定。",
  "call、apply、bind 和箭头函数分别改变什么？",
  "把 class 实例方法直接传给按钮回调，内部 this 丢失，怎么设计？",
  "可在构造器 bind 一次，或使用实例箭头字段。不要每次渲染创建不同绑定再用于事件取消；清理监听时必须使用原函数引用，并考虑每实例分配函数的成本。",
  "this call apply bind 箭头函数",
);
t(
  "js",
  "js-prototype",
  "原型链、new 与 instanceof",
  "对象通过内部原型查找属性；构造函数的 prototype 属性通常决定 new 实例的内部原型。",
  "读取属性先查自身，再沿 [[Prototype]] 向上直到 null。new 创建对象、设置原型、调用构造器；构造器返回对象时替代默认实例，返回原始值时忽略。instanceof 可被 Symbol.hasInstance 自定义。",
  "区分 F.prototype、Object.getPrototypeOf(instance) 与不建议业务使用的 __proto__。|Object.create(null) 没有 Object.prototype，可避免某些键名碰撞；Map 更适合动态键集合。|手写 new 可用 Object.create 与 Reflect.apply；原生 class 构造器不能被普通 apply 调用，Reflect.construct 更接近原生。",
  "跨 iframe 的 Array 可能不满足当前环境 Array 的 instanceof，判断数组用 Array.isArray。|改变原型不等于拷贝父类自身状态。",
  "new 做了什么？instanceof 能否可靠判断所有类型？",
  "实现一个校验器，来自 iframe 的数组被判成非数组，原因是什么？",
  "instanceof 比较的是构造器原型身份，不同 realm 的 Array.prototype 不相同。改用 Array.isArray；普通对象类型校验需明确允许的结构，而不是依赖 constructor.name。",
  "prototype new instanceof Reflect 原型链",
);
t(
  "js",
  "js-closure",
  "闭包、内存与生命周期",
  "闭包是函数保留对词法环境的访问能力；内存问题取决于可达性和资源生命周期，不是闭包本身有错。",
  "当内部函数被外部引用时，它需要的外部绑定仍然可达。垃圾回收主要依据对象是否能从根访问到；事件监听、全局缓存、计时器和异步回调都可能形成较长保留链。",
  "适用场景：函数工厂、模块私有状态、once、memoize、请求序号。|为订阅和定时器定义 dispose，组件卸载时注销；缓存必须有容量或过期策略。|用堆快照对比重复进入/退出页面前后对象数量，查找 Retainers。",
  "闭包捕获变量绑定，不会自动拍下当时值的快照。|循环引用在现代追踪式 GC 中不必然泄漏，根可达的循环才值得排查。",
  "闭包为什么能保留变量？如何排查相关内存增长？",
  "组件已卸载但大数组一直无法回收，你会从哪里查起？",
  "检查 window 监听、未清理 interval、事件总线和模块级 Map 是否引用闭包或组件。通过快照的保留路径定位所有者，清理后重复相同行为验证内存是否回落，不只看单次总量。",
  "closure 闭包 GC 内存 可达性",
);
t(
  "js",
  "js-promise",
  "Promise 状态、链式调用与 thenable",
  "Promise 状态从 pending 单向变为 fulfilled 或 rejected；then 返回新 Promise，回调返回值决定下一段链的结果。",
  "resolve 不总是立即 fulfilled：接收 Promise 或 thenable 时会采用其最终结果。then 的回调异常会拒绝返回的新 Promise；没有对应回调时值或错误继续传播。finally 通常透传原结果，但其抛错或返回拒绝会改变链。",
  "手写时实现一次性状态迁移、异步回调队列与值解析过程。|区分 fulfilled 的普通值、回调返回 Promise、thenable getter 抛错、自解析循环。|生产代码用原生 Promise；教学版应声明不等同完整规范，并用针对性用例验证。",
  "执行器内抛错会拒绝；执行器调用 resolve 后再抛错不会改变已经确定的命运。|用 catch 吞错却返回 undefined，后续链就可能被当作成功。",
  "Promise 的 resolve 和 then 返回值采用规则是什么？",
  "then 里 return 一个对象，它的 then getter 抛异常，后续会怎样？",
  "解析返回值时读取 then 也可能抛错，应拒绝 then 返回的新 Promise。教学实现如果只判断 value instanceof Promise，会遗漏跨 realm Promise 和普通 thenable。",
  "Promise thenable resolve finally 链式",
);
t(
  "js",
  "js-promise-combinators",
  "all / race / allSettled / any",
  "组合器的核心区别是何时结束与如何聚合结果；它们本身不限制并发，也不会取消已启动的任务。",
  "all 按输入顺序给结果，任一拒绝则拒绝。allSettled 等所有输入结束并保留状态。race 采用首个完成的输入；any 采用首个成功，全部失败时拒绝 AggregateError。空输入时 all/allSettled 成功，any 拒绝，race 保持 pending。",
  "先明确失败策略：全部成功、尽量完整、最快结果、任一可用。|需要限流时传入任务函数，由调度器决定启动时机，而不是把已发出的 Promise 交给 all。|需要取消时联合 AbortController 与资源清理，并单独处理晚到结果。",
  "Promise.all 的快速失败不意味着其余网络请求自动停止。|race 包一个超时 Promise 只停止等待，不会自动关闭底层请求。",
  "Promise 四个组合器的失败、顺序和空数组行为有什么差别？",
  "批量上传 20 张图片，要展示每张的成败并允许单独重试，选什么？",
  "用受限并发启动上传，再将每项转成 settled 结果，或使用 allSettled 聚合。保留稳定文件 ID 和每项错误；只重试可恢复失败，避免把成功项重新上传。",
  "Promise all race any allSettled",
);
t(
  "js",
  "js-concurrency",
  "带并发限制的异步调度器",
  "并发控制管理正在执行的任务数；任务函数只有拿到槽位时才调用，完成或失败后必须释放槽位。",
  "维护输入游标和固定数量的 worker。每个 worker 领取一个任务，await 后继续领取下一个；结果写入输入索引，最终返回顺序不被完成顺序影响。并发上限不是 QPS，长短任务会导致不同吞吐。",
  "验证并发数为正整数；空任务立即返回。|明确 fail-fast、继续收集错误或取消剩余任务的语义，同步 throw 也必须覆盖。|记录排队时间和执行时间，接入取消、优先级和退避时维护同一调度状态机。",
  "Promise.all(tasks.map(fn=>fn())) 已经全部启动，无法再限流。|不要把失败任务漏掉导致 active 计数不下降、队列永远不结束。",
  "如何实现最多 N 个并发，按输入顺序返回结果？",
  "用 wx.request 批量请求，如何统计平均耗时而不把排队时间混进去？",
  "每项记录 enqueueAt、startedAt、settledAt，执行耗时为 settledAt-startedAt，排队耗时另算；成功失败分开统计，并报告 p50/p95、样本数与取消项。用请求 task.abort 适配取消，完成回调只结算一次。",
  "并发 scheduler wx.request 队列 限流",
  `async function pool(tasks, limit) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit');
  let cursor = 0;
  const results = new Array(tasks.length);
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      try { results[i] = { status: 'fulfilled', value: await tasks[i]() }; }
      catch (reason) { results[i] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}`,
);
t(
  "js",
  "js-clone",
  "深浅拷贝、循环引用与 structuredClone",
  "先明确要复制的数据类型与语义，再选择浅拷贝、结构化克隆或定制复制。JSON 往返不是通用深拷贝。",
  "展开语法和 Object.assign 只复制一层可枚举自有属性。structuredClone 支持多种内置类型与循环引用，但不克隆函数和 DOM，也不保留所有自定义原型行为。通用递归需要用 WeakMap 记住已拷贝对象。",
  "列出类型矩阵：Array、Date、Map、Set、RegExp、函数、Symbol、属性描述符。|先登记源对象到副本映射，再遍历子项，才能处理环和共享引用。|ArrayBuffer 转移会让源缓冲不可用，与复制语义不同。",
  "JSON 会丢 undefined、函数等信息，BigInt 和循环结构可能报错。|拷贝能隔离引用，但大对象复制本身有 CPU 与内存成本。",
  "深拷贝需要处理哪些边界？JSON 方案为什么不够？",
  "两个字段原本指向同一个子对象，拷贝后变成两个对象，这算正确吗？",
  "通常应保持源图中的别名关系，否则修改语义可能改变。用 WeakMap 将同一个源节点映射到同一个副本，循环引用也使用这一映射；先与需求确认是否需要保持共享结构。",
  "深拷贝 WeakMap structuredClone 循环引用",
);
t(
  "js",
  "js-rate-limit",
  "防抖、节流与可取消封装",
  "防抖把密集调用合并到安静窗口；节流约束持续调用的执行频率。它们适合不同交互，不是相互替代。",
  "防抖常用于搜索输入，节流常用于滚动采样。实现要保存最新参数和 this，明确 leading/trailing，提供 cancel 和可选 flush。计时器代表下次执行机会，系统繁忙时执行会延后。",
  "需求先写时序图：首个是否立即执行，末次是否必须执行。|搜索防抖仍需处理请求取消和结果竞态；滚动渲染可按 rAF 合并。|卸载取消尾部任务，避免对已销毁状态继续写入。",
  "rAF 是对齐渲染机会，不是固定 16ms 的通用节流计时器。|防抖可能让持续输入时一直不执行，需要 maxWait 时要明确设计。",
  "防抖与节流的区别、边界和典型场景是什么？",
  "自动保存使用防抖，用户直接关闭页面丢失最后一次修改，怎么处理？",
  "编辑状态先在本地持久化，防抖只控制远端写入；页面隐藏时尝试 flush，小体量上报可考虑 beacon，但不能保证关闭时网络一定成功。启动后对比版本并恢复待同步数据。",
  "debounce throttle 防抖 节流 cancel",
);
t(
  "js",
  "js-array-version",
  "扁平化、去重、版本比较与复杂度",
  "基础工具题要先明确输入契约：层数、空洞、对象相等规则、版本格式都会改变答案。",
  "Set 以 SameValueZero 判断相等，能去重 NaN，但不同对象按引用区分。flat 按层数展开且会处理空槽。数字点分版本逐段比较，不能按普通字符串排序；SemVer 还包含预发布标识和构建元数据。",
  "大数组避免无限递归导致栈溢出，可用显式栈；保留顺序时注意压栈方向。|对象去重要按业务主键建 Map，明确保留首项还是末项。|面试简化版版本比较先验证纯数字段，生产 SemVer 使用成熟解析库。",
  "1.10 比 1.2 大，但字典序可能相反。|parseFloat 会把 1.10.2 错当小数，字符串去重也不能替代结构等价。",
  "数组工具题如何从边界与复杂度入手？",
  "版本 1.0.0-beta 与 1.0.0 谁更大？能否直接按数字段比较？",
  "SemVer 中正式版高于对应预发布版本；预发布标识有额外排序规则，构建元数据不参与优先级。先确认业务需要 SemVer 还是普通数字点分版本，再选实现。",
  "flatten Set Map semver 版本排序",
);
t(
  "js",
  "js-modules",
  "ESM、CommonJS 与循环依赖",
  "ESM 具有静态结构和 live binding；CommonJS 执行时加载并暴露 module.exports，循环依赖时可能看到尚未完成的导出。",
  "ESM 先链接依赖图再求值，导入绑定只读但能观察导出绑定变化；初始化顺序错误可触发 TDZ。CommonJS require 通常缓存模块求值结果，解构一个导出属性往往只是当前值，不是 live binding。",
  "区分静态 import 与返回 Promise 的 import()，后者适合按条件或路由加载。|循环依赖优先通过抽取共享契约、依赖倒置拆解，而不是随意移动语句碰运气。|Node 的 ESM/CJS 互操作受 package type、扩展名和 Node 版本影响，应在目标运行时验证。",
  "ESM 不等于浏览器专属，CommonJS 也不意味着每次 require 都重新执行。|Tree Shaking 的效果还取决于副作用声明和打包器分析。",
  "ESM 与 CommonJS 的加载、导出和循环依赖有什么差异？",
  "两个模块互相 import，某个导出读取时报初始化前访问，你如何改造？",
  "先画依赖图找到环和求值时机，把共享常量/类型提到第三模块，或把读取延迟到初始化后调用；延迟只是缓解，核心是减少双向业务依赖并用集成测试验证启动路径。",
  "ESM CommonJS import 循环依赖",
);

t(
  "network",
  "net-navigation",
  "从 URL 输入到页面可交互",
  "按导航、连接、响应、解析、渲染和交互分层描述，并说明哪些阶段可能被缓存、复用或并行化。",
  "导航可能命中 Service Worker 或 HTTP 缓存；网络请求需要名称解析、连接与 TLS，但已有连接可复用。HTML 流式解析并发现子资源，CSS 影响渲染，脚本的执行策略影响解析；布局、绘制、合成共同生成帧。",
  "先判断是否同文档导航、重定向、缓存命中和连接复用。|区分 DOM 构建、CSSOM、样式计算、布局、绘制与合成；现代渲染是流水线而非一次性步骤表。|以 Performance/Network 记录定位 TTFB、资源发现、主线程与交互瓶颈。",
  "DOMContentLoaded、load 和页面业务可用不是同一时间。|DNS、TCP、TLS 不保证每次导航都重新执行，HTTP/3 也不使用 TCP。",
  "从输入 URL 到页面可交互，如何讲得完整而不机械背诵？",
  "接口很快但首屏慢，下一步怎么定位？",
  "看导航与资源瀑布，分解服务端响应、关键资源发现、下载、脚本解析执行和渲染时间。检查大 JS、阻塞 CSS、LCP 图片优先级与长任务；用相同设备网络复测，不把接口延迟当成全部首屏。",
  "导航 DNS TLS DOM CSSOM 渲染",
);
t(
  "network",
  "net-cache",
  "强缓存、协商缓存与版本发布",
  "先判断响应能否复用、是否新鲜；需要验证时发送条件请求，由验证器决定返回完整实体还是 304。",
  "Cache-Control 的 max-age 控制新鲜期，no-cache 允许存储但使用前需验证，no-store 要求不存储。ETag/If-None-Match 和 Last-Modified/If-Modified-Since 是验证机制。缓存键还受 Vary、URL、共享缓存策略影响。",
  "内容哈希静态资源用长缓存和 immutable；HTML 入口短缓存或协商，确保指向新资源。|个性化响应区分 private、no-store，CDN 缓存需要隔离身份和租户。|部署先上传新资源再切入口，保留旧资源避免已打开页面懒加载 404。",
  "no-cache 不等于不缓存。|304 仍需要网络往返，缓存命中不必然等于 304。",
  "如何为 HTML、带 hash 的 JS 和用户信息接口制定缓存策略？",
  "上线后部分用户白屏，旧 HTML 引用了被删除的 JS，怎么避免？",
  "保留至少覆盖缓存和长会话窗口的旧资产；资源先部署、入口后切换，回滚也保持原 hash 可用。监控 chunk 加载失败，提示刷新前保留用户草稿；刷新不是正确发布策略的替代。",
  "cache ETag 304 immutable Cache-Control",
);
t(
  "network",
  "net-cors",
  "同源策略、CORS 与预检",
  "同源策略约束不同源间读取敏感资源；CORS 是服务端允许浏览器跨源读取响应的协议，不是身份认证。",
  "源由协议、主机和端口组成。满足条件的请求无需预检，非简单方法/请求头等可能触发 OPTIONS。预检成功后才发送实际请求；带凭证时不能用通配允许源代替明确允许列表。",
  "服务端校验 Origin，精确返回允许方法、头和凭证策略，动态 Origin 响应配 Vary。|开发代理把请求在服务端转发，不能证明生产跨域已经配置正确。|JSONP 借脚本执行返回数据，仅适合很受限的历史场景且有代码执行风险。",
  "跨域失败时请求可能已发出，只是响应不能被脚本读取。|CORS 不能阻止服务端、curl 或攻击站点发起所有请求，也不能替代 CSRF 防护。",
  "预检什么时候发生？CORS 为什么不等于请求鉴权？",
  "图片能显示但 fetch 读同一 URL 报跨域错误，为什么？",
  "某些跨源资源嵌入在浏览器允许范围内，但脚本读取响应需要 CORS 授权。Canvas 读取跨源图片像素也可能被污染；应由资源服务正确配置允许源，而不是前端设置 mode:no-cors 期待可读响应。",
  "CORS OPTIONS 同源 预检 Origin",
);
t(
  "network",
  "net-http",
  "HTTP/1.1、HTTP/2 与 HTTP/3",
  "比较连接复用、多路复用、队头阻塞与握手迁移成本；协议升级能改善部分网络瓶颈，不能消除应用层依赖。",
  "HTTP/1.1 常通过多个 TCP 连接提高并发。HTTP/2 在同一 TCP 连接上复用多个流，但 TCP 丢包仍可能阻塞所有流。HTTP/3 使用 QUIC，基于 UDP，在传输层按流处理可靠性，降低流间阻塞并支持连接迁移。",
  "说明 HTTP/2 头部压缩、帧、流和优先级机制，与 HTTP 语义分开。|讨论弱网下的丢包、拥塞控制和回退，不声称 HTTP/3 永远更快。|通过 ALPN、服务端和 CDN 能力、浏览器 Network 面板确认实际协商协议。",
  "HTTP/2 多路复用没有解决 TCP 层队头阻塞。|QUIC 提供可靠有序流，不等于应用直接使用不可靠 UDP 报文。",
  "HTTP/2 和 HTTP/3 分别解决了哪类队头阻塞？",
  "已经升级 HTTP/2，为什么一个超大的 JS 仍拖慢首屏？",
  "多路复用不改变关键资源必须下载、解析与执行的总成本，也无法自动拆开应用依赖。按路由分包、减依赖、调整关键资源优先级，再检查 CPU 是否是主要瓶颈。",
  "HTTP2 HTTP3 QUIC TCP 多路复用",
);
t(
  "network",
  "net-tls",
  "HTTPS、证书链与 TLS",
  "HTTPS 通过 TLS 提供传输机密性、完整性和服务器身份验证；只有正确验证证书与主机名，这些保障才成立。",
  "客户端检查证书信任链、有效期、域名等约束；握手协商算法并建立会话密钥。现代 TLS 通常用临时密钥交换实现前向保密，再用对称加密保护应用数据，不能概括为“用公钥加密全部内容”。",
  "先确定 TLS 版本，说明 TLS 1.3 与旧版握手的差异，不混背 RTT。|证书证明公钥与身份的绑定，CA 信任并不保证网站业务诚实。|排查证书问题时看完整链、SNI、时钟和中间证书，不在生产跳过校验。",
  "TLS 不解决浏览器中的 XSS，也不自动提供业务鉴权。|0-RTT 存在重放风险，不宜不加区分地用于有副作用操作。",
  "HTTPS 如何防止中间人攻击？证书到底验证了什么？",
  "测试环境为了调通关闭证书验证，能直接沿用到生产吗？",
  "不能。关闭验证会破坏服务器身份验证，使中间人可冒充。应补齐可信证书、正确域名和中间链；内网场景明确受控根证书分发，并保证测试配置不会进入生产构建。",
  "HTTPS TLS 证书 中间人 前向保密",
);
t(
  "network",
  "net-websocket",
  "WebSocket、心跳与断线重连",
  "WebSocket 提供持续双向消息通道；可靠交付、鉴权、去重与重连恢复仍属于应用协议。",
  "经典 WebSocket 通过 HTTP Upgrade 握手建立连接，之后交换 WebSocket 帧；其他 HTTP 版本存在扩展连接方式。浏览器 WebSocket 不按普通 fetch 的 CORS 流程处理，服务端必须验证 Origin 和身份。",
  "设计指数退避加随机抖动，网络恢复或前后台变化时触发受控重连。|区分传输 Ping/Pong 与业务心跳，浏览器 JS 无法任意发送协议级 Ping 帧。|消息带唯一 ID、会话/频道序号与 ACK，重连携带游标补齐缺口并去重。",
  "WebSocket 连上不代表用户仍有权限，长连接需要会话更新/失效处理。|TCP 有序只覆盖同一连接，不保证跨重连消息恰好一次。",
  "WebSocket 如何完成重连、心跳与消息恢复？",
  "Wi-Fi 切换到移动网络后聊天消息重复且顺序错乱，怎么设计协议？",
  "客户端以 clientMessageId 重试同一逻辑消息，服务端幂等入库并分配频道内序号；重连从最后确认序号补拉，前端按 ID 去重、按序归并。区分发送中、已接收、已投递，不能仅凭 socket.send 成功标记送达。",
  "WebSocket 心跳 ACK 重连 消息有序",
);
t(
  "network",
  "net-xss",
  "XSS 与不可信内容渲染",
  "根因是把不可信数据放进可执行上下文；防御依赖按上下文编码、安全 DOM API、受控清洗和纵深策略。",
  "存储型、反射型和 DOM 型是不同来源/路径分类。HTML、属性、URL、脚本上下文需要不同处理；纯文本优先 textContent。需要富文本时采用维护良好的白名单清洗器，并禁用不必要的危险协议和嵌入能力。",
  "模板转义通常保护文本插值，v-html 或 dangerouslySetInnerHTML 会绕过该边界。|CSP 和 Trusted Types 是纵深防线，不能替代安全输出与依赖治理。|HttpOnly 阻止 JS 直接读 cookie，但 XSS 仍可借当前身份发请求、读页面或窃取其他凭证。",
  "仅替换尖括号不能覆盖 URL、属性和脚本上下文。|Markdown 解析不是 HTML 安全清洗。",
  "XSS 有哪些入口？如何安全展示用户 Markdown？",
  "AI 回复包含带 onerror 的图片 HTML，前端应该怎样处理？",
  "默认禁用原始 HTML 或在 Markdown 转 HTML 后做白名单清洗，链接只允许可信协议；代码块通过文本节点展示。服务端存储原文也不能免除渲染时防护，再配 CSP、测试攻击样本与依赖更新。",
  "XSS CSP DOMPurify 转义 Markdown",
  "",
  ["owasp"],
);
t(
  "network",
  "net-csrf",
  "CSRF、Cookie 与会话安全",
  "CSRF 利用浏览器自动附带身份凭证发起非本人意愿的操作；关键是验证请求意图与来源，而不只检查是否登录。",
  "当会话保存在自动发送的 cookie 中，攻击者可诱导跨站请求。SameSite 能减少部分跨站携带场景；服务端仍要根据场景采用 CSRF token、Origin/Referer 校验与合适的方法语义。",
  "有副作用的操作不用 GET，token 绑定会话并在服务端校验。|Session cookie 配 Secure、HttpOnly、合适的 SameSite；跨站需求使用 None 时必须配 Secure 并加强校验。|Bearer token 放请求头降低经典 cookie CSRF 面，但存储位置与 XSS 仍需评估。",
  "同站和同源不同，子域场景不能用一句 SameSite 足够概括。|CORS 拒绝响应读取不等于阻止有副作用请求被提交。",
  "CSRF 与 XSS 的攻击前提、防御方法有什么不同？",
  "接口只允许 JSON Content-Type，是否就可以删除所有 CSRF 校验？",
  "不能把单一条件视为永久保证。严格 JSON 与 CORS 配置可减少攻击面，但还需检查兼容入口、子域信任、内容类型解析和认证方式；按威胁模型验证 token、来源与 cookie 策略。",
  "CSRF SameSite Cookie token 会话",
);
t(
  "network",
  "net-resource-security",
  "点击劫持、SRI 与前端供应链",
  "页面嵌入、第三方资源和依赖构建分别形成不同信任边界，需要在资源入口和发布链路控制。",
  "点击劫持通过透明/伪装 frame 诱导操作，可用 CSP frame-ancestors 或 X-Frame-Options 限制嵌入。SRI 用预期哈希验证外部资源内容是否被改动；它不能判断原本内容是否恶意，也不替代 CSP。",
  "第三方脚本尽量最少化、锁定版本并审计权限；明确是否必要使用跨域属性与 SRI。|依赖锁文件进入版本控制，CI 验证构建来源，避免把 token 打包到浏览器资源。|发布保留审计与可回滚产物，关注 install 脚本、CDN 和 sourcemap 访问。",
  "不要将 X-Frame-Options 配在 HTML meta 里期待等同响应头。|SRI 保护单个匹配资源，不能覆盖其动态拉取的全部代码。",
  "如何防点击劫持？SRI 能解决什么问题？",
  "CDN 脚本被替换了，为什么使用 HTTPS 仍不够？",
  "HTTPS 保护传输到当前服务端的连接，不能防服务端本身被攻陷或供应链发布恶意版本。受控外部资源用 SRI 固定内容，重要依赖本地构建，结合 CSP、锁版本、审计和回滚。",
  "SRI 点击劫持 CSP 供应链",
);

t(
  "css",
  "css-box-bfc",
  "盒模型、BFC 与外边距折叠",
  "盒模型决定尺寸包含范围；BFC 是块级格式化上下文，影响内部布局、浮动包含与部分 margin 折叠。",
  "content-box 的 width 不包含 padding/border，border-box 包含它们。普通文档流相邻块级垂直 margin 可能折叠；父子间是否折叠取决于边框、内边距、内容和格式化上下文等条件。",
  "用 display:flow-root 明确建立 BFC 来包含浮动，减少把 overflow:hidden 当万能清除浮动。|BFC 的区域不会与浮动盒重叠，内部布局与外部格式化上下文隔离。|IFC 处理行内内容与 line box；baseline 会影响图片底部空隙。",
  "BFC 不会让所有相邻兄弟的 margin 都自动不折叠。|overflow:hidden 可能截断内容、阴影并改变滚动行为。",
  "BFC 解决什么问题？它与盒模型是什么关系？",
  "浮动图片让父容器高度塌陷，怎样修复且不裁剪阴影？",
  "优先给父容器 display:flow-root 形成 BFC，或按需求改成 Flex/Grid；不要为了清浮动直接 overflow:hidden 导致裁剪。用实际内容验证宽高和后续布局，不只观察一个截图。",
  "BFC IFC box-sizing margin 浮动",
);
t(
  "css",
  "css-flex-grid",
  "Flex、Grid 与自适应约束",
  "Flex 更适合单轴内容分配，Grid 更适合同时组织行列；布局问题常常来自最小尺寸和内容约束。",
  "Flex 在主轴分配剩余空间，收缩权重与基础尺寸相关；项目默认最小尺寸可能限制收缩。Grid 用轨道与区域表达二维关系，fr 分剩余空间，但 min-content 约束仍影响溢出。",
  "卡片列表可用 repeat(auto-fit,minmax(...))；连续内容与按钮行用 Flex。|长文本收缩常需 min-width:0，省略号还需 overflow 与白空格规则。|Grid 的 minmax(0,1fr) 可避免某些内容撑开等分列，保留合理可读下限。",
  "flex:1 不代表任何条件下绝对等宽。|不能只靠固定宽高在一个屏幕实现居中而忽略内容溢出。",
  "Flex 和 Grid 怎么选？长文本为什么会把布局撑开？",
  "两列布局中右侧代码块很长，整个页面出现横向滚动，如何定位？",
  "检查 Flex 子项的自动 min-width 与 Grid 轨道最小内容约束，给需要收缩的容器 min-width:0，代码区局部 overflow:auto。保留长代码横向滚动，避免隐藏页面内容掩盖问题。",
  "Flex Grid min-width minmax 布局",
);
t(
  "css",
  "css-render",
  "布局、绘制、合成与动画",
  "先判断改动影响渲染流水线的哪一步，再选优化；transform 和 opacity 在满足条件时适合合成动画，但并非零成本。",
  "几何变化通常使布局失效，颜色变化常需要绘制，已建立合成层的 transform/opacity 动画可能只更新合成。读取布局信息可能迫使浏览器提前完成样式与布局，交替读写会产生 layout thrashing。",
  "批量读取几何信息后集中写入，避免循环内每次读 offsetWidth 再修改样式。|用性能面板观察 Layout、Paint 和合成层，确认优化目标。|will-change 按需提前启用并在结束后释放，避免大量纹理占用内存。",
  "GPU 加速不等于更省内存或永不卡顿。|transform 不影响普通流布局占位，但会影响视觉位置和一些包含块行为。",
  "重排、重绘、合成有什么区别？怎样验证动画瓶颈？",
  "给几百个列表项都加 will-change 后更卡，为什么？",
  "图层数量、纹理上传与显存占用增加，可能超过合成收益。仅给实际动画节点使用并及时移除，缩小绘制区域，减少同时动画的数量；在低端设备记录帧耗时与内存。",
  "layout paint composite transform will-change",
);
t(
  "css",
  "css-stacking",
  "层叠上下文与 z-index",
  "z-index 不是全局排名；元素先受所在层叠上下文约束，再参与该上下文内部比较。",
  "定位元素配合非 auto 的 z-index、transform、opacity 小于 1、isolation 等条件可建立层叠上下文。一个子元素无论 z-index 多大，都不能越过其父上下文与更高层兄弟的整体层级关系。",
  "从遮挡节点向祖先逐级寻找上下文创建条件。|弹窗用统一 Portal/Teleport 到受控挂载点，管理遮罩、焦点与滚动锁。|设计有限层级 token，避免业务随意叠加 999999。",
  "position:fixed 也会受祖先 transform 等包含块条件影响。|提高子元素 z-index 不会自动提高父层叠上下文。",
  "为什么 z-index:99999 的弹窗仍被挡住？",
  "弹窗放在带 transform 的卡片里，既被遮挡又不再相对视口定位，怎么改？",
  "transform 可能创建层叠上下文和 fixed 包含块；把弹窗 Teleport 到顶层容器或移除不必要 transform。之后检查焦点陷阱、关闭后焦点返回与移动端滚动锁，避免只修视觉。",
  "z-index stacking Teleport 层叠上下文",
);
t(
  "css",
  "css-mobile",
  "viewport、DPR、rpx 与 1px",
  "CSS 像素、设备像素和设计尺寸是不同概念；适配要同时考虑布局、可读性、触控和设备安全区域。",
  "DPR 是设备像素与 CSS 像素的比例。viewport meta 决定移动页面初始布局视口。rem 随根字号，vw 随视口；小程序 rpx 以屏幕宽度进行换算，但文字可访问性和横竖屏仍需单独验证。",
  "布局优先流式、Flex/Grid 与断点，避免把全部尺寸机械换成 vw/rpx。|细线可用缩放伪元素或高 DPR 下亚像素边框，必须真机验证栅格结果。|底部操作区结合 env(safe-area-inset-bottom)，触控目标和字号留足空间。",
  "1 CSS px 不总等于 1 个物理像素。|不要禁止用户缩放来掩盖布局问题，也不要让随屏幕缩小的字体不可读。",
  "移动端适配为什么不能只选一个单位解决？",
  "同一条 1px 线在不同手机上粗细不同，该怎么解释？",
  "设备 DPR 与栅格取整不同，1 CSS px 可能覆盖多个物理像素。确认目标是视觉细线还是数学上的一个物理像素，用伪元素缩放等方案真机校验；同时检查缩放与设备截图的采样影响。",
  "viewport DPR rpx rem vw safearea",
);
t(
  "css",
  "css-container",
  "CSS 变量、容器查询与主题",
  "变量管理设计值，容器查询让组件根据自身可用空间变化；它们服务于组件边界，而不只是全局断点。",
  "CSS 自定义属性参与层叠和继承，可在运行时切换主题并提供 var 回退。尺寸容器查询依赖祖先建立 container-type，后代根据容器尺寸应用规则；与按视口判断的媒体查询适用边界不同。",
  "把颜色、间距与层级定义成语义变量，而不是散落魔法值。|同一组件在侧栏和主栏复用时用容器查询，在整站布局和用户偏好上用媒体查询。|兼容性与目标 WebView、基础库相关，提供合理基础样式并验证支持矩阵。",
  "声明容器会改变包含与尺寸计算条件，不能随便加在所有节点。|变量不是 Sass 编译变量；它在浏览器运行时参与计算。",
  "媒体查询与容器查询的应用场景有什么差别？",
  "一张卡片在宽屏侧栏仍很窄，但媒体查询给它桌面多列布局，如何修复？",
  "以卡片外层的实际宽度建立 inline-size 查询容器，达到组件需要的空间才切多列。视口断点保留给页面结构，避免同一个全局断点承担所有组件响应式需求。",
  "container CSS变量 主题 响应式",
);
t(
  "css",
  "css-accessibility",
  "语义、键盘与可访问交互",
  "可访问性是交互正确性的一部分：语义结构、键盘操作、焦点状态、对比度和状态反馈都要覆盖。",
  "原生 button、a、input 提供默认键盘和辅助技术语义。视觉上的可点击 div 需要额外处理角色、焦点、Enter/Space 和禁用状态，通常不如直接选对元素。异步状态用适度 live region 通知。",
  "表单有可关联 label，错误文本明确指出修复方式。|弹窗进入后管理焦点，Esc 关闭并恢复触发点；列表/菜单按对应模式设计键盘导航。|尊重 prefers-reduced-motion，保留可见 focus，不仅靠颜色表示对错。",
  "aria-label 不能修复错误的交互逻辑。|placeholder 不是持久可见的字段标签，hover 提示也不能代替关键说明。",
  "怎样把一个鼠标可用的页面做到键盘可用？",
  "答题页面自动切换下一题，屏幕阅读器用户不知道发生了什么，怎么处理？",
  "更新标题与进度后将焦点移到下一题标题，或使用简短 aria-live 状态；不要每秒播报倒计时。保证选项用原生表单控件、结果用文字说明，对键盘顺序做实际验证。",
  "a11y ARIA keyboard focus 无障碍",
);
