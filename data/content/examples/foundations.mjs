import { ex, fromLab, fill } from "./helpers.mjs";
ex(
  "js-event-loop",
  "任务与微任务的执行顺序",
  "修改 then、queueMicrotask 和定时器的位置，再比较输出顺序。",
  String.raw`
console.log('同步开始');
setTimeout(() => console.log('定时器'), 0);
Promise.resolve().then(() => {
  console.log('Promise');
  queueMicrotask(() => console.log('内层微任务'));
});
console.log('同步结束');
`,
  ["同步开始", "同步结束", "Promise", "内层微任务", "定时器"],
  "同步代码先完成，Promise 回调在微任务检查点执行。回调中新入队的微任务继续在同一检查点处理，随后定时器任务才有机会运行。",
);
ex(
  "js-async-await",
  "await 普通值也会暂停续体",
  "比较 await 前后与外层同步代码的先后顺序。",
  String.raw`
async function task() {
  console.log('函数开始');
  await 1;
  console.log('await 之后');
}
const pending = task();
console.log('外层同步');
await pending;
`,
  ["函数开始", "外层同步", "await 之后"],
  "async 函数在第一个 await 前同步运行。即使等待普通值，后续逻辑也在异步续体中恢复；await 不会阻塞外层同步代码。",
);
ex(
  "js-scope",
  "TDZ 和循环绑定",
  "观察未初始化的词法绑定与每轮 let 的独立闭包。",
  String.raw`
try {
  console.log(typeof value);
  let value = 1;
} catch (error) {
  console.log(error.name);
}
const callbacks = [];
for (let i = 0; i < 3; i++) callbacks.push(() => i);
console.log(callbacks.map(fn => fn()));
`,
  ["ReferenceError", "[0,1,2]"],
  "typeof 不能绕过 TDZ；循环 let 创建逐轮绑定，三个闭包读取各自的 i。把 let 改成 var 可观察所有回调共享同一绑定。",
);
ex(
  "js-this",
  "成员调用、解绑定与显式 this",
  "严格模式里普通函数的 this 取决于调用方式。",
  String.raw`
const object = {
  name: '对象',
  read() { return this?.name ?? '没有 this'; }
};
const detached = object.read;
console.log(object.read());
console.log(detached());
console.log(detached.call({name: '显式绑定'}));
`,
  ["对象", "没有 this", "显式绑定"],
  "读取方法不会永久绑定接收者。脱离成员表达式调用时严格函数的 this 为 undefined；call 可为普通函数指定本次接收者。",
);
ex(
  "js-prototype",
  "属性查找与原型身份",
  "自己的属性会遮蔽原型属性；删除自身属性后继续向原型查找。",
  String.raw`
function Item(name) { this.name = name; }
Item.prototype.kind = '原型值';
const item = new Item('A');
item.kind = '自身值';
console.log(item.kind);
delete item.kind;
console.log(item.kind);
console.log(Object.getPrototypeOf(item) === Item.prototype);
console.log(item instanceof Item);
`,
  ["自身值", "原型值", "true", "true"],
  "属性查找先自身后原型，删除自身属性不会删原型属性。new 默认把实例的内部原型连接到构造器 prototype，instanceof 根据这一关系判断。",
);
ex(
  "js-closure",
  "闭包是绑定而非快照",
  "比较每个工厂独立状态与同一闭包内部不断变化的计数。",
  String.raw`
function createCounter() {
  let count = 0;
  return () => ++count;
}
const first = createCounter();
const second = createCounter();
console.log(first(), first(), second());
let current = 1;
const read = () => current;
current = 9;
console.log(read());
`,
  ["1 2 1", "9"],
  "两次调用工厂产生独立词法环境；同一个环境中的闭包读取当前绑定，所以 current 改成 9 后 read 也读到 9，而不是创建时的数值。",
);
ex(
  "js-promise",
  "异常传播与 finally 透传",
  "观察回调返回值、抛错、恢复以及 finally 的返回值。",
  String.raw`
const value = await Promise.resolve(2)
  .then(value => value * 3)
  .then(() => { throw new Error('失败'); })
  .catch(error => {
    console.log(error.message);
    return 7;
  })
  .finally(() => 99);
console.log(value);
`,
  ["失败", "7"],
  "catch 返回普通值可恢复链；finally 返回普通值通常不会覆盖原结果，因此最后仍为 7。如果 finally 抛错或返回拒绝，结果会改变。",
);
ex(
  "js-promise-combinators",
  "结果顺序与失败聚合",
  "all 保留输入顺序，allSettled 保留每项状态，any 选择首个成功。",
  String.raw`
const slow = new Promise(resolve => setTimeout(() => resolve('慢'), 15));
console.log(await Promise.all([slow, Promise.resolve('快')]));
const settled = await Promise.allSettled([1, Promise.reject('错误')]);
console.log(settled.map(item => item.status));
console.log(await Promise.any([Promise.reject('坏'), Promise.resolve('可用')]));
`,
  ['["慢","快"]', '["fulfilled","rejected"]', "可用"],
  "all 的结果按输入排列，与谁先结束不同；allSettled 不因单项拒绝而丢弃其他结果，any 忽略失败直到出现成功或全部失败。",
);
fromLab(
  "js-concurrency",
  "pool",
  "修改任务数和并发上限，观察最大活跃数与返回顺序。",
  String.raw`
let active = 0, peak = 0;
const tasks = [0, 1, 2, 3].map(value => async () => {
  active++;
  peak = Math.max(peak, active);
  await new Promise(resolve => setTimeout(resolve, 10));
  active--;
  return value;
});
const results = await settlePool(tasks, 2);
console.log(peak);
console.log(results.map(item => item.value));
`,
  [2, "[0,1,2,3]"],
  "两个 worker 同时工作，最大活跃数为 2；结果写回领取任务时的索引，完成时机不改变输入顺序。传入函数才能真正延迟启动。",
);
fromLab(
  "js-clone",
  "clone",
  "克隆带共享子对象和自循环的普通对象图。",
  String.raw`
const child = {value: 1};
const source = {left: child, right: child};
source.self = source;
const copy = cloneGraph(source);
console.log(copy !== source);
console.log(copy.left === copy.right);
console.log(copy.left !== child);
console.log(copy.self === copy);
`,
  [true, true, true, true],
  "WeakMap 同时解决循环和别名：同一源节点只复制一次，副本内部共享关系保留，但不再引用源图里的可变子对象。",
);
fromLab(
  "js-rate-limit",
  "debounce",
  "密集调用只保留最后参数；cancel 会取消尚未发生的尾部调用。",
  String.raw`
const result = [];
const save = debounce(value => result.push(value), 15);
save('A');
save('B');
await new Promise(resolve => setTimeout(resolve, 40));
save('C');
save.cancel();
await new Promise(resolve => setTimeout(resolve, 40));
console.log(result);
`,
  ['["B"]'],
  "第一次窗口里 A 被 B 替换，只执行 B。第二次待执行 C 被 cancel 清除；取消不会撤销已经执行的 B。",
);
ex(
  "js-array-version",
  "展开、去重与数值排序",
  "Set 的相等规则、flat 的深度与 sort 比较器解决不同问题。",
  String.raw`
console.log([1, [2, [3]]].flat(1));
console.log([...new Set([1, 1, NaN, NaN])].map(String));
console.log([2, 10, 1].sort());
console.log([2, 10, 1].sort((a, b) => a - b));
`,
  ["[1,2,[3]]", '["1","NaN"]', "[1,10,2]", "[1,2,10]"],
  "flat(1) 只展开一层，Set 能去重 NaN，默认 sort 按字符串比较；数值排序需要比较器。这里不把点分版本当浮点数处理。",
);
ex(
  "js-modules",
  "live binding 与值快照的教学模型",
  "用 getter 对照“读取当前绑定”与“保存当时值”；这不是实际模块加载器。",
  String.raw`
let exported = 1;
const namespace = {get count() { return exported; }};
const snapshot = namespace.count;
exported = 2;
console.log(namespace.count);
console.log(snapshot);
`,
  [2, 1],
  "getter 在读取时取当前值，snapshot 只保存了当时的原始值。这个模型帮助理解 live binding，但没有模拟 ESM 链接、只读导入和循环初始化规则。",
  "model",
);
fromLab(
  "js-invoke",
  "invoke",
  "验证冻结对象和严格函数的原始 this；不需要临时给对象加属性。",
  String.raw`
console.log(invoke(function(a) { return this.value + a; }, Object.freeze({value: 2}), [3]));
console.log(invoke(function() { return this === null; }, null));
console.log(invoke(function() { return typeof this; }, 7));
`,
  [5, true, "number"],
  "Reflect.apply 保留目标函数自身的 this 规则，并且不要求接收对象可扩展。临时属性法会额外引入冻结对象和原始值装箱的限制。",
);
fromLab(
  "js-bind",
  "bind",
  "预置参数用于普通调用与构造调用；构造调用忽略绑定接收者。",
  String.raw`
function Person(name) { this.name = name; }
const context = {name: '旧值'};
const Bound = bindLike(Person, context, 'Ada');
Bound();
console.log(context.name);
context.name = '重置';
const instance = new Bound();
console.log(instance.name, instance instanceof Person);
console.log(context.name);
`,
  ["Ada", "Ada true", "重置"],
  "普通调用使用绑定 this；new 创建独立实例并沿目标原型构造，预置参数仍有效。教学版没有模拟原生 bound 的所有属性语义。",
);
fromLab(
  "js-new",
  "construct",
  "观察普通构造器返回 null 和对象时的区别。",
  String.raw`
function First() { this.value = 1; return null; }
function Second() { this.value = 1; return {value: 9}; }
console.log(newLike(First).value);
console.log(newLike(Second).value);
console.log(newLike(First) instanceof First);
`,
  [1, 9, true],
  "null 和其他原始值不替代新实例；显式返回对象会覆盖默认实例。此实现只支持题目限定的普通构造函数，不适用于任意 class 或内置构造器。",
);
fromLab(
  "js-instanceof",
  "instanceof",
  "沿原型链比较引用，不通过 constructor 名称猜类型。",
  String.raw`
function Parent() {}
function Child() {}
Child.prototype = Object.create(Parent.prototype);
const value = new Child();
console.log(instanceOfSimple(value, Parent));
console.log(instanceOfSimple(1, Number));
console.log(instanceOfSimple(Object.create(null), Object));
`,
  [true, false, false],
  "子实例沿链找到 Parent.prototype，所以为 true；原始数值没有本题要求的对象链，null 原型对象也不会经过 Object.prototype。",
);
fromLab(
  "js-promise-handwrite",
  "promise-lite",
  "最小 deferred 状态机：微任务订阅和单向状态变化。",
  String.raw`
const deferred = createDeferred();
const value = deferred.promise.then(number => {
  console.log('then', number);
  return number + 1;
});
deferred.resolve(4);
deferred.resolve(99);
console.log('同步');
console.log(await value);
`,
  ["同步", "then 4", 5],
  "resolve 第一次后状态固定，第二次不生效；then 通过微任务执行，返回的新原生 Promise 采用回调结果。这不是完整 Promise/A+ 实现。",
);
fromLab(
  "js-throttle",
  "throttle",
  "首个调用立即执行，窗口内只保留最后一次尾调用。",
  String.raw`
const output = [];
const report = throttle(value => output.push(value), 25);
report(1); report(2); report(3);
console.log(output);
await new Promise(resolve => setTimeout(resolve, 60));
console.log(output);
report.cancel();
`,
  ["[1]", "[1,3]"],
  "leading 立即输出 1；窗口内 2 被 3 替换，尾部只输出 3。计时器延迟是最早执行机会，不承诺所有设备准点。",
);

ex(
  "net-navigation",
  "关键资源的依赖图模型",
  "通过依赖时间计算首屏关键路径；不会真的打开网络连接或渲染页面。",
  String.raw`
const tasks = {
  html: {duration: 80, dependencies: []},
  css: {duration: 30, dependencies: ['html']},
  js: {duration: 50, dependencies: ['html']},
  render: {duration: 10, dependencies: ['css', 'js']}
};
function finish(name) {
  const task = tasks[name];
  return task.duration + Math.max(0, ...task.dependencies.map(finish));
}
console.log(finish('render'));
tasks.js.duration = 20;
console.log(finish('render'));
`,
  [140, 120],
  "模型中 CSS 与 JS 在 HTML 后并行，关键路径取较慢依赖而不是总和。JS 优化到 20 后，CSS 成为关键依赖；真实浏览器还有流式发现和主线程调度。",
  "model",
);
ex(
  "net-cache",
  "新鲜、验证与不存储的策略模型",
  "更改 cache-control 与资源年龄，观察决策。未模拟真实 HTTP 缓存完整规范。",
  String.raw`
function decision({noStore = false, noCache = false, age, maxAge}) {
  if (noStore) return '不存储';
  if (noCache || age >= maxAge) return '向服务端验证';
  return '复用新鲜响应';
}
console.log(decision({age: 10, maxAge: 60}));
console.log(decision({noCache: true, age: 10, maxAge: 60}));
console.log(decision({noStore: true, age: 0, maxAge: 60}));
`,
  ["复用新鲜响应", "向服务端验证", "不存储"],
  "no-cache 允许存储但要求验证，no-store 才是不存储。模型仅覆盖基本决策，没有实现 Vary、共享缓存、Age 计算或启发式新鲜期。",
  "model",
);
ex(
  "net-cors",
  "同源比较与允许源列表",
  "URL.origin 同时包含协议、主机和端口。CORS 决策由真实服务端响应和浏览器执行。",
  String.raw`
const page = new URL('https://app.example.com');
for (const url of ['https://app.example.com/a', 'https://app.example.com:8443/a', 'http://app.example.com/a']) {
  console.log(new URL(url).origin === page.origin);
}
const allowed = new Set(['https://app.example.com']);
console.log(allowed.has('https://evil.example.com'));
`,
  [true, false, false, false],
  "路径不同仍可能同源，端口或协议不同则不同源。允许源列表只是服务端决策的一部分，不能替代浏览器 CORS、预检和凭证规则。",
  "model",
);
ex(
  "net-http",
  "传输层队头阻塞的简化模型",
  "比较一个流丢包时其他流能否继续交付；这不是 HTTP/QUIC 协议实现。",
  String.raw`
function deliver(protocol, lost) {
  const streams = ['A', 'B', 'C'];
  if (protocol === 'h2' && lost) return [];
  return streams.filter(name => name !== lost);
}
console.log(deliver('h2', 'B'));
console.log(deliver('h3', 'B'));
`,
  ["[]", '["A","C"]'],
  "模型把 H2 的 TCP 字节流阻塞与 QUIC 的按流交付区别凸显出来；真实网络仍有拥塞、优先级和应用依赖，不能据此宣称 H3 在任何网络都更快。",
  "model",
);
ex(
  "net-tls",
  "证书验证条件的逻辑模型",
  "只模拟必需条件，不执行密码学、证书解析或证书链验证。",
  String.raw`
function acceptable(certificate, host, now) {
  return certificate.trusted && certificate.host === host && now >= certificate.start && now < certificate.end;
}
const certificate = {trusted: true, host: 'example.com', start: 100, end: 200};
console.log(acceptable(certificate, 'example.com', 150));
console.log(acceptable(certificate, 'evil.com', 150));
console.log(acceptable(certificate, 'example.com', 200));
`,
  [true, false, false],
  "受信任、主机名匹配与有效期同时需要成立；到期点不再有效。真实验证还包含链、扩展和算法等约束，不能使用这个函数替代 TLS 库。",
  "model",
);
ex(
  "net-websocket",
  "补拉与去重的消息归并",
  "在本地模拟重连后重复收到一条消息，并补齐序号缺口。",
  String.raw`
const local = [{id:'a', seq:1}, {id:'c', seq:3}];
const replay = [{id:'b', seq:2}, {id:'c', seq:3}];
const merged = new Map(local.map(item => [item.id, item]));
for (const item of replay) merged.set(item.id, item);
console.log([...merged.values()].sort((a,b) => a.seq-b.seq).map(item => item.id));
console.log(Math.max(...[...merged.values()].map(item => item.seq)));
`,
  ['["a","b","c"]', 3],
  "消息 ID 负责去重，频道序号负责排序与恢复游标。这只是本地归并步骤，真实系统还需鉴权、缺口检测、ACK 和服务端幂等。",
  "model",
);
ex(
  "net-xss",
  "文本编码与危险 HTML",
  "在 Worker 中仅操作字符串，不将危险内容插入真实 DOM。此编码只适用于 HTML 文本上下文。",
  String.raw`
function escapeText(value) {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
console.log(escapeText('<img src=x onerror=alert(1)>'));
console.log(escapeText('A&B'));
`,
  ["&lt;img src=x onerror=alert(1)&gt;", "A&amp;B"],
  "把尖括号等编码后作为文本显示；它不是通用 HTML 清洗器，也不能直接用于 URL/脚本上下文。真实富文本使用受维护的清洗库，普通文本优先 textContent。",
);
ex(
  "net-csrf",
  "请求意图校验的模型",
  "模拟会话 token 与精确来源同时匹配。真实策略需结合 Cookie、SameSite 和威胁模型。",
  String.raw`
function authorizedRequest(request, session) {
  return request.origin === 'https://app.example.com' && request.csrf === session.csrf;
}
const session = {csrf: 'token-A'};
console.log(authorizedRequest({origin:'https://app.example.com', csrf:'token-A'}, session));
console.log(authorizedRequest({origin:'https://evil.com', csrf:'token-A'}, session));
console.log(authorizedRequest({origin:'https://app.example.com', csrf:'bad'}, session));
`,
  [true, false, false],
  "两个条件在模型里同时成立才接受；来源相同但 token 错误也失败。这不是完整认证/CSRF 中间件，真实服务端还需会话、权限和适合的头部校验。",
  "model",
);
ex(
  "net-resource-security",
  "验证资源内容而不是只信 URL",
  "使用标准 Web Crypto 计算摘要。真正的 SRI 由浏览器依据完整性元数据验证。",
  String.raw`
const encode = value => new TextEncoder().encode(value);
async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
const expected = await digest('trusted resource');
console.log(await digest('trusted resource') === expected);
console.log(await digest('changed resource') === expected);
`,
  [true, false],
  "同样内容得到同样摘要，修改资源使摘要不同。这个片段说明内容完整性，不实现完整 SRI 编码/资源加载，也不能证明被信任的原始代码本身无恶意。",
);
ex(
  "net-dns-tcp",
  "连接复用与分段耗时模型",
  "同一请求业务时间不变，连接复用仍能减少前置成本。",
  String.raw`
function total({reuse, dns=15, tcp=30, tls=30, response=40}) {
  return (reuse ? 0 : dns + tcp + tls) + response;
}
console.log(total({reuse:false}));
console.log(total({reuse:true}));
`,
  [115, 40],
  "第一次含 DNS/TCP/TLS 的模型成本为 115，复用时只剩响应成本 40。真实请求可能部分复用、使用会话恢复或走 QUIC，不应把这个固定数值当实测。",
  "model",
);
ex(
  "net-storage",
  "按身份、版本隔离客户端缓存",
  "用 Map 代表存储，演示缓存键和版本检查；这里不是浏览器 localStorage。",
  String.raw`
const storage = new Map();
const key = user => 'draft:v2:' + user;
storage.set(key('A'), JSON.stringify({version:2, text:'草稿 A'}));
function read(user) {
  const raw = storage.get(key(user));
  if (!raw) return null;
  const data = JSON.parse(raw);
  return data.version === 2 ? data.text : null;
}
console.log(read('A'));
console.log(read('B'));
`,
  ["草稿 A", "null"],
  "缓存键包含身份和格式版本，用户 B 不会读到 A 的草稿。真实存储还要处理配额、损坏与退出清理，客户端存储不能作为权限证明。",
  "model",
);

ex(
  "css-box-bfc",
  "盒模型尺寸的算术对照",
  "计算 content-box/border-box 总宽度；BFC 和外边距折叠需要在真实 DOM/CSS 中验证。",
  String.raw`
function outerWidth(width, padding, border, boxSizing) {
  return boxSizing === 'border-box' ? width : width + padding * 2 + border * 2;
}
console.log(outerWidth(100, 10, 1, 'content-box'));
console.log(outerWidth(100, 10, 1, 'border-box'));
`,
  [122, 100],
  "content-box 的 width 不含内边距和边框，左右各加一次；border-box 已包含。纯 JS 模型只解释尺寸关系，不执行 BFC 排版或浮动布局。",
  "model",
);
ex(
  "css-flex-grid",
  "Flex 缩小权重的简化计算",
  "在没有 min/max 限制时，按 shrink×basis 分摊负剩余空间。",
  String.raw`
const basis = [200, 100];
const shrink = [1, 1];
const deficit = 60;
const weights = basis.map((size, i) => size * shrink[i]);
const total = weights.reduce((sum, value) => sum + value, 0);
console.log(basis.map((size, i) => size - deficit * weights[i] / total));
`,
  ["[160,80]"],
  "两个 shrink 都是 1 也不表示等量减少，因为权重还乘基础尺寸。真实 Flex 还要迭代处理 min-content、min/max 和冻结项目，模型未覆盖这些约束。",
  "model",
);
ex(
  "css-render",
  "读写交替与集中处理的计数模型",
  "模拟布局失效后首次读触发布局刷新；真实成本请用 Performance 面板确认。",
  String.raw`
function measure(actions) {
  let dirty = false, layouts = 0;
  for (const action of actions) {
    if (action === 'write') dirty = true;
    else if (dirty) { layouts++; dirty = false; }
  }
  return layouts;
}
console.log(measure(['write','read','write','read','write','read']));
console.log(measure(['read','read','read','write','write','write']));
`,
  [3, 0],
  "模型中的写操作使布局失效，后续读才强制刷新。先集中读再写可避免这轮同步刷新；浏览器最终仍需要布局，不意味着真实布局总数永远为零。",
  "model",
);
ex(
  "css-stacking",
  "z-index 是分层比较的模型",
  "把父上下文和子层级组成向量，按祖先顺序比较，而不是只取子级最大数字。",
  String.raw`
function compareLayers(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  }
  return Math.sign(a.length - b.length);
}
console.log(compareLayers([1, 99999], [2, 1]));
console.log(compareLayers([2, 10], [2, 5]));
`,
  [-1, 1],
  "父层级 1 里的巨大子级仍排在父层级 2 后面；父级相同才比较内部。真实 CSS 绘制顺序还有定位、负层级和 top layer 等规则，需在 DOM 中验证。",
  "model",
);
ex(
  "css-mobile",
  "rpx、CSS 像素与设备像素",
  "将 750 设计宽下的 rpx 转为 CSS 像素，再按 DPR 估算设备像素尺度。",
  String.raw`
const viewportWidth = 375;
const dpr = 3;
const rpxToCssPx = value => value * viewportWidth / 750;
console.log(rpxToCssPx(100));
console.log(rpxToCssPx(100) * dpr);
console.log(1 * dpr);
`,
  [50, 150, 3],
  "375 宽下 100rpx 对应 50 CSS px，DPR=3 时约 150 设备像素尺度。实际细线效果还受缩放和栅格化影响，这不是浏览器或小程序真实测量。",
  "model",
);
ex(
  "css-container",
  "组件宽度与视口宽度不同",
  "用 JS 模拟一个组件按自身宽度切换布局。真实样式应由 CSS 容器查询完成。",
  String.raw`
function columns(containerWidth) { return containerWidth >= 480 ? 2 : 1; }
const viewportWidth = 1440;
console.log(columns(280));
console.log(columns(640));
console.log(viewportWidth >= 480);
`,
  [1, 2, true],
  "视口虽宽，但侧栏组件可能只有 280px，仍应单列；主区域 640px 可以双列。这说明查询对象应是组件容器，而非把所有布局都绑定视口断点。",
  "model",
);
ex(
  "css-accessibility",
  "键盘操作也能进入相同命令",
  "模拟按钮键盘激活；真实页面优先用原生 button，它已提供语义与交互行为。",
  String.raw`
let count = 0;
function activate(key) {
  if (key === 'Enter' || key === ' ') count++;
}
activate('Enter'); activate('ArrowDown'); activate(' ');
console.log(count);
console.log(['按钮', '输入框', '提交'].join(' → '));
`,
  [2, "按钮 → 输入框 → 提交"],
  "Enter 和 Space 在模型里进入同一动作，方向键未触发。真实可访问性还需要焦点、禁用状态、label、读屏和顺序，不能靠这个函数替代原生控件。",
  "model",
);
ex(
  "css-center",
  "居中偏移与超高内容",
  "尺寸已知时用差值的一半说明几何居中；超出容器时需要保证内容可达。",
  String.raw`
function offset(container, content) { return (container - content) / 2; }
console.log(offset(300, 100));
console.log(offset(300, 500));
console.log(Math.max(0, offset(300, 500)));
`,
  [100, -100, 0],
  "内容超高时几何居中偏移会为负，顶部可能跑出可滚动区域。最后一行用顶部对齐作概念对照；真实弹窗需设置高度约束、overflow 和焦点可见。",
  "model",
);
