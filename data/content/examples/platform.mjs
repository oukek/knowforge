import { ex } from "./helpers.mjs";
ex(
  "mini-runtime",
  "跨层消息不能共享同一个对象",
  "用 JSON 往返模拟传统跨层传输，观察副本与原对象的区别。",
  String.raw`
const logic = {selected: false};
const view = JSON.parse(JSON.stringify(logic));
logic.selected = true;
console.log(logic.selected);
console.log(view.selected);
console.log(logic === view);
`,
  [true, false, false],
  "视图得到独立序列化结果后，逻辑对象的直接变化不会自动修改该副本。真实宿主通信和 Skyline 不完全等于 JSON 往返，这个模型只说明边界和显式提交。",
  "model",
);
ex(
  "mini-setdata",
  "同步 data 与异步视图的教学模型",
  "模拟一次局部 patch；不调用真实微信 API，也不覆盖数据路径或宿主调度。",
  String.raw`
const data = {count:0};
const view = {count:0};
function setData(patch, callback) {
  Object.assign(data, patch);
  queueMicrotask(() => { Object.assign(view, patch); callback?.(); });
}
setData({count:1}, () => console.log('回调', view.count));
console.log('立即读取', data.count, view.count);
`,
  ["立即读取 1 0", "回调 1"],
  "data 同步变化，而视图提交在另一个调度点。真实 setData 不一定用微任务，视图完成要依据宿主回调；不要把这个模型的任务顺序当作微信实现。",
  "model",
);
ex(
  "mini-skyline",
  "用测量维度评估迁移",
  "网络瓶颈和渲染瓶颈在总耗时中占比不同；模拟不代表 Skyline 基准。",
  String.raw`
function total(network, logic, render) { return network + logic + render; }
console.log(total(800, 100, 100));
console.log(total(800, 100, 50));
console.log(total(100, 100, 400));
console.log(total(100, 100, 200));
`,
  [1000, 950, 600, 400],
  "相同渲染减半在不同瓶颈下总收益不同，不能从引擎能力推断固定首屏提升。这些数值是演示输入，迁移要测实际机型、兼容性和完整链路。",
  "model",
);
ex(
  "mini-worklet",
  "高频动画与低频业务提交分层",
  "普通 JS 数值模拟 UI 连续坐标与业务最终状态，不是真实 Worklet 线程。",
  String.raw`
let sharedX = 0;
const businessUpdates = [];
for (const x of [10, 20, 30, 40]) sharedX = x;
businessUpdates.push({finalX: sharedX});
console.log(sharedX);
console.log(businessUpdates.length);
console.log(businessUpdates[0]);
`,
  [40, 1, '{"finalX":40}'],
  "四次高频更新只向业务提交一次最终值，体现动画与业务的频率边界。真实 Worklet 有独立上下文和可调用 API 限制，不能直接搬运任意 JS 对象或函数。",
  "model",
);
ex(
  "mini-packages",
  "主包和总包预算校验模型",
  "用 KB 为自定统一单位检查演示预算，不对官方 M/KB 单位做隐含换算。",
  String.raw`
function check(mainKB, subKB, mainBudgetKB, totalBudgetKB) {
  return {mainOK:mainKB <= mainBudgetKB, totalOK:mainKB + subKB.reduce((a,b)=>a+b,0) <= totalBudgetKB};
}
console.log(check(1800, [1500, 1600], 2000, 6000));
console.log(check(2300, [1000], 2000, 6000));
`,
  ['{"mainOK":true,"totalOK":true}', '{"mainOK":false,"totalOK":true}'],
  "总预算通过不代表主包预算通过；包拆分也需检查单包与引用。此处预算由参数输入，不替代官方当前限制和 miniprogram-ci 的实际包体检查。",
  "model",
);
ex(
  "mini-lifecycle",
  "幂等启动与停止资源",
  "模拟多次 onShow 不重复订阅，onHide 释放资源。",
  String.raw`
let active = false, starts = 0;
function onShow() { if (!active) { active = true; starts++; } }
function onHide() { active = false; }
onShow(); onShow();
console.log(starts, active);
onHide(); onShow();
console.log(starts, active);
`,
  ["1 true", "2 true"],
  "同一次显示期间只启动一次；隐藏后再次显示可重新启动。真实定时器、监听与请求还要保存清理句柄，并区分隐藏、卸载和进程被终止。",
  "model",
);
ex(
  "mini-routing",
  "压栈、替换、返回的状态模型",
  "数组代表页面栈，只演示 navigateTo/redirectTo/navigateBack 的核心意图。",
  String.raw`
const stack = ['首页'];
function navigateTo(page) { stack.push(page); }
function redirectTo(page) { stack[stack.length-1] = page; }
navigateTo('商品'); navigateTo('确认页');
redirectTo('结果页');
console.log(stack);
stack.pop();
console.log(stack);
`,
  ['["首页","商品","结果页"]', '["首页","商品"]'],
  "压栈保留旧页，替换只改当前层，返回移除顶层。这里没有模拟 tabBar、页面栈上限和真实生命周期，实际路由规则以微信宿主为准。",
  "model",
);
ex(
  "mini-login",
  "一次性 code 与业务会话分离",
  "用服务端 Map 模拟 code 被消费后不能再次交换；不生成真实微信凭证。",
  String.raw`
const unusedCodes = new Set(['code-A']);
function serverExchange(code) {
  if (!unusedCodes.delete(code)) throw new Error('code 已使用');
  return {businessSession:'session-demo', userId:'user-A'};
}
console.log(serverExchange('code-A').userId);
try { serverExchange('code-A'); } catch (error) { console.log(error.message); }
`,
  ["user-A", "code 已使用"],
  "code 的使用与自定义业务会话是不同层；平台交换和密钥保留在真实服务端。这个内存模型没有鉴权、签名、过期或安全随机性，不能作为登录实现。",
  "model",
);
ex(
  "mini-privacy",
  "授权拒绝也保留非必要功能",
  "把浏览和需要手机号的业务区分，避免用一个权限开关挡住全部流程。",
  String.raw`
function available(action, hasPhoneConsent) {
  return action === '浏览' || hasPhoneConsent;
}
console.log(available('浏览', false));
console.log(available('手机号联系', false));
console.log(available('手机号联系', true));
`,
  [true, false, true],
  "浏览与手机号用途分开，拒绝授权仍能完成不依赖手机号的任务。真实系统还需合法用途、平台资格、服务端凭证验证和替代流程，不是只有一个布尔值。",
  "model",
);
ex(
  "mini-web-difference",
  "平台适配通过显式接口注入",
  "业务逻辑使用统一接口，宿主层决定具体网络/存储实现。",
  String.raw`
function createProfileService(storage) {
  return { save(name) { storage.set('profile', {name}); } };
}
const memory = new Map();
const service = createProfileService({set:(key,value)=>memory.set(key,value)});
service.save('Ada');
console.log(memory.get('profile'));
console.log(typeof document);
`,
  ['{"name":"Ada"}', "undefined"],
  "Worker 也没有 document，依赖 DOM 的库不能直接用；接口注入可隔离业务与宿主。Worker 不是小程序逻辑层，这里只演示缺少 DOM 时的适配原则。",
);
ex(
  "mini-longlist",
  "定高虚拟列表的窗口计算",
  "用视口、行高和 overscan 算出需要渲染的索引范围。",
  String.raw`
function windowRange(scrollTop, viewport, itemHeight, count, overscan) {
  return {
    start: Math.max(0, Math.floor(scrollTop/itemHeight)-overscan),
    end: Math.min(count, Math.ceil((scrollTop+viewport)/itemHeight)+overscan)
  };
}
console.log(windowRange(200, 300, 50, 1000, 2));
console.log(windowRange(0, 300, 50, 1000, 2));
`,
  ['{"start":2,"end":12}', '{"start":0,"end":8}'],
  "end 是排除端点，overscan 向两侧扩展并夹到合法范围。该公式适用于定高；动态高度需要测量缓存、前缀和和滚动锚点处理。",
);
ex(
  "mini-memory",
  "压缩文件大小不等于解码内存",
  "按 RGBA 每像素四字节估算驻留，不模拟宿主实际内存分配。",
  String.raw`
function rgbaMiB(width, height, copies=1) { return width*height*4*copies/1024/1024; }
console.log(rgbaMiB(2048, 2048));
console.log(rgbaMiB(2048, 2048, 3));
console.log(rgbaMiB(512, 512));
`,
  [16, 48, 1],
  "2048² RGBA 像素约 16MiB，三份约 48MiB；缩略到 512² 约 1MiB。真实纹理、解码缓存与格式存在额外开销，这只是估算，不是内存上限。",
  "model",
);
ex(
  "mini-performance-api",
  "排队、执行与总耗时分开",
  "自定时间点计算不同阶段；这些是演示数据而非微信 Performance API 实测。",
  String.raw`
const requests = [
  {enqueue:0, start:10, end:50},
  {enqueue:0, start:50, end:110}
];
const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
console.log(mean(requests.map(x => x.start-x.enqueue)));
console.log(mean(requests.map(x => x.end-x.start)));
console.log(mean(requests.map(x => x.end-x.enqueue)));
`,
  [30, 50, 80],
  "三种口径分别是平均排队、平均执行和平均总耗时。把排队时间混进执行时间会误判接口；真实统计还要保留失败样本、设备网络分组和分位数。",
  "model",
);
ex(
  "mini-component",
  "受控状态通过事件更新",
  "子组件发送意图，父级持有权威值，不隐式修改共享对象。",
  String.raw`
let parentValue = 0;
function createChild(getValue, emit) {
  return {click() { emit('change', getValue()+1); }};
}
const child = createChild(() => parentValue, (event, next) => {
  if (event === 'change') parentValue = next;
});
child.click(); child.click();
console.log(parentValue);
`,
  [2],
  "子组件读取父级当前值并发出 change 意图，由父级更新权威状态。这里使用普通函数模拟 properties/事件，真实组件还有更新调度和生命周期。",
  "model",
);
ex(
  "mini-ci",
  "质量门槛与上传资格",
  "把类型、用例、包体结果合成发布前决策；不连接真实 CI 或微信上传。",
  String.raw`
function canUpload(report) {
  return report.types && report.tests && report.bundleWithinBudget;
}
console.log(canUpload({types:true, tests:true, bundleWithinBudget:true}));
console.log(canUpload({types:true, tests:false, bundleWithinBudget:true}));
console.log(canUpload({types:true, tests:true, bundleWithinBudget:false}));
`,
  [true, false, false],
  "任一必要质量门槛失败就阻止上传。上传成功也不等于审核通过或上线，真实链路还需凭证管理、产物追踪、体验验证和回退。",
  "model",
);
ex(
  "mini-request",
  "调用成功不等于 HTTP 成功",
  "模拟 wx.request 返回后对 statusCode 做业务层判定。",
  String.raw`
function unwrap(response) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error('HTTP ' + response.statusCode);
  }
  return response.data;
}
console.log(unwrap({statusCode:200, data:{ok:true}}));
try { unwrap({statusCode:503, data:{}}); } catch (error) { console.log(error.message); }
`,
  ['{"ok":true}', "HTTP 503"],
  "宿主 success 回调里的响应仍可能是 HTTP 503，需要独立判断状态和业务码。此处没有真实 RequestTask、取消或网络，只演示分层错误处理。",
  "model",
);
ex(
  "mini-update",
  "接口扩展保留旧客户端契约",
  "同时处理只有 name 的旧数据和包含 displayName 的新数据，演示兼容读取。",
  String.raw`
function displayName(profile) { return profile.displayName ?? profile.name ?? '匿名'; }
console.log(displayName({name:'旧客户端'}));
console.log(displayName({name:'旧字段', displayName:'新字段'}));
console.log(displayName({}));
`,
  ["旧客户端", "新字段", "匿名"],
  "新旧版本并存时，兼容读取能给迁移窗口；服务端也应保留约定的旧契约。此例不实现微信更新管理器，实际更新时仍要保护草稿与进行中交易。",
  "model",
);

ex(
  "vue-reactivity",
  "最小依赖收集模型",
  "实现一个 key→effect 集合，演示读取 track 和写入 trigger；不是 Vue 源码替代。",
  String.raw`
let active;
const dependencies = new Map();
const state = new Proxy({count:0}, {
  get(target,key) {
    if (active) {
      if (!dependencies.has(key)) dependencies.set(key,new Set());
      dependencies.get(key).add(active);
    }
    return Reflect.get(target,key);
  },
  set(target,key,value) {
    Reflect.set(target,key,value);
    for (const effect of dependencies.get(key) ?? []) effect();
    return true;
  }
});
function effect(fn) { active=fn; fn(); active=undefined; }
effect(() => console.log(state.count));
state.count = 2;
`,
  [0, 2],
  "effect 初次读取 count 建立依赖，写入再次触发。真实 Vue 还处理嵌套、分支清理、调度与集合等行为，这个同步模型只说明核心关系。",
  "model",
);
ex(
  "vue-computed-watch",
  "懒缓存与失效的模型",
  "只有标记失效后才重新运行派生计算；不调用真实 Vue API。",
  String.raw`
let count=1, dirty=true, cached, runs=0;
function computedValue() {
  if (dirty) { cached=count*2; dirty=false; runs++; }
  return cached;
}
console.log(computedValue(), computedValue(), runs);
count=3; dirty=true;
console.log(computedValue(), runs);
`,
  ["2 2 1", "6 2"],
  "连续读取复用缓存，依赖变化后标记脏，下次读取才重算。此处手动设置 dirty，真实 computed 由响应式追踪自动失效，watch 则负责副作用。",
  "model",
);
ex(
  "vue-render",
  "key 决定状态跟随业务身份",
  "用 Map 模拟按稳定 ID 复用输入状态，排序后状态不会按位置串到别的项目。",
  String.raw`
const stateById = new Map([['A','输入 A'],['B','输入 B']]);
const sortedIds = ['B','A'];
console.log(sortedIds.map(id => stateById.get(id)));
const stateByIndex = ['输入 A','输入 B'];
console.log(sortedIds.map((id,index) => id + ':' + stateByIndex[index]));
`,
  ['["输入 B","输入 A"]', '["B:输入 A","A:输入 B"]'],
  "稳定 ID 让输入态跟随业务项目，按索引保留则可能把原 A 状态配给 B。真实 Vue 的 diff/patch 比该 Map 模型复杂，但身份契约相同。",
  "model",
);
ex(
  "vue-nexttick",
  "批量更新队列的模型",
  "多次状态赋值只调度一次刷新；等待刷新不等于等待浏览器绘制。",
  String.raw`
let value=0, rendered=0, pending=null;
function set(valueNext) {
  value=valueNext;
  pending ??= Promise.resolve().then(() => { rendered=value; pending=null; });
}
set(1); set(2);
console.log(rendered);
await pending;
console.log(rendered);
`,
  [0, 2],
  "两次写合并到同一次微任务刷新，最终视图模型为 2。真实 nextTick 等待 Vue 的 DOM 队列，不保证图片加载或下一帧已显示。",
  "model",
);
ex(
  "vue-state",
  "状态声明位置决定共享",
  "函数内部创建状态会独立，模块级状态可被多个调用共享。",
  String.raw`
function localCounter() { let count=0; return () => ++count; }
const first=localCounter(), second=localCounter();
console.log(first(), second());
let sharedCount=0;
const sharedCounter=() => () => ++sharedCount;
console.log(sharedCounter()(), sharedCounter()());
`,
  ["1 1", "1 2"],
  "composable 是否共享不是名称决定，而是状态创建位置决定。真实 Pinia 和 SSR 还要管理应用/请求隔离，不能让模块级用户状态跨请求串用。",
);
ex(
  "vue-keepalive",
  "缓存实例与资源启停分开",
  "模拟实例缓存、激活与停用；真实 KeepAlive 由 Vue 管理组件实例。",
  String.raw`
const cache = new Map();
function enter(id) {
  if (!cache.has(id)) cache.set(id,{visits:0, polling:false});
  const state=cache.get(id); state.visits++; state.polling=true; return state;
}
const page=enter('A'); page.polling=false;
console.log(enter('A').visits);
console.log(cache.size);
`,
  [2, 1],
  "再次进入复用同一状态，实例数不变；资源是否暂停由生命周期处理，不会因缓存自动停掉。生产还需要容量、失效与账号隔离策略。",
  "model",
);
ex(
  "react-fiber",
  "可丢弃 render 与一次 commit 的模型",
  "模拟低优先级计算被新版本替换，避免在 render 阶段执行副作用。",
  String.raw`
let version=0, visible='旧界面';
function render(value) { return {version:++version,value}; }
const low=render('低优先级');
const urgent=render('紧急输入');
function commit(work) { if (work.version===version) visible=work.value; }
commit(low); commit(urgent);
console.log(visible);
`,
  ["紧急输入"],
  "旧计算可以被丢弃，只有合适版本进入提交。真实 React 调度不等于这个版本号模型，但同样要求 render 纯粹，不能在可重做计算中下单或写外部状态。",
  "model",
);
ex(
  "react-hooks",
  "状态快照与函数式更新",
  "普通 JS 模拟闭包读取旧快照，以及基于待处理状态的更新。",
  String.raw`
let state=0;
const snapshot=state;
const stale=() => { state=snapshot+1; };
stale(); stale();
console.log(state);
state=0;
const update=fn => { state=fn(state); };
update(value=>value+1); update(value=>value+1);
console.log(state);
`,
  [1, 2],
  "两个旧闭包都基于 0 写入 1；函数式更新依次基于前值，得到 2。实际 React 的调度和快照更复杂，例子不实现 Hook 槽位或 Effect。",
  "model",
);
ex(
  "react-memo",
  "引用相等与缓存失效",
  "用 Object.is 展示浅比较依赖身份；不实际运行 React memo。",
  String.raw`
const shared={limit:10};
console.log(Object.is(shared, shared));
console.log(Object.is({limit:10}, {limit:10}));
const previous=[shared, 1];
const next=[shared, 1];
console.log(next.every((value,index)=>Object.is(value,previous[index])));
`,
  [true, false, true],
  "结构相同的新对象引用不同，会使浅依赖比较变化。memo 仍可能因内部状态/上下文更新；缓存是性能策略，不应承担正确性。",
);
ex(
  "react-suspense",
  "等待、失败与成功不是同一种状态",
  "显式状态机区分 loading 和 error；这不是 React Suspense 的内部实现。",
  String.raw`
function view(state) {
  if (state.status==='pending') return '加载中';
  if (state.status==='failed') return '重试入口';
  return state.value;
}
console.log(view({status:'pending'}));
console.log(view({status:'failed'}));
console.log(view({status:'ready',value:'内容'}));
`,
  ["加载中", "重试入口", "内容"],
  "等待与失败应有不同界面。真实 Suspense 依赖支持挂起的数据源，普通 Effect fetch 不会自动接管；错误边界也不捕获所有事件和后台 Promise 错误。",
  "model",
);

ex(
  "eng-build",
  "按请求转换与转换缓存的模型",
  "模拟开发服务器只转换被请求模块，并缓存结果；不代表具体 Vite 版本底层实现。",
  String.raw`
const cache=new Map(); let transforms=0;
function requestModule(id) {
  if (!cache.has(id)) { transforms++; cache.set(id,'compiled:'+id); }
  return cache.get(id);
}
console.log(requestModule('entry.js'));
requestModule('entry.js');
console.log(transforms);
requestModule('other.js');
console.log(transforms);
`,
  ["compiled:entry.js", 1, 2],
  "重复请求命中转换缓存，新模块才增加工作。真实模块图、依赖预处理和生产打包有更多步骤，不能用模型替代实际工具版本和产物测量。",
  "model",
);
ex(
  "eng-plugin",
  "单模块转换与产物级检查",
  "用函数模拟不同层级的扩展职责，不执行真实 Loader/Plugin。",
  String.raw`
const transform=source => source.replace('const','let');
const assets=[{name:'a.js',bytes:80},{name:'b.js',bytes:50}];
console.log(transform('const count=1;'));
console.log(assets.reduce((sum,file)=>sum+file.bytes,0));
console.log(assets.every(file=>file.bytes<=100));
`,
  ["let count=1;", 130, true],
  "转换函数看单个模块，产物检查能观察整个资产集合。这里的文本替换不是可靠语法转译，真实 Babel/Loader 应操作 AST 或使用成熟转换器。",
  "model",
);
ex(
  "eng-hmr",
  "热替换前释放旧资源",
  "重复加载模块时先调用 dispose，避免订阅累计。",
  String.raw`
const listeners=new Set(); let dispose;
function replaceModule(version) {
  dispose?.();
  const listener=() => version;
  listeners.add(listener);
  dispose=() => listeners.delete(listener);
}
replaceModule(1); replaceModule(2); replaceModule(3);
console.log(listeners.size);
console.log([...listeners][0]());
`,
  [1, 3],
  "每次替换释放上一份监听，最终只有当前版本。真实 HMR 还涉及模块图更新边界和整页回退，组件卸载也需要自己的清理。",
  "model",
);
ex(
  "eng-tree-shaking",
  "可达导出与副作用的保留模型",
  "根据使用集合演示为什么副作用声明影响删除安全，不是真实打包器分析。",
  String.raw`
const modules=[
  {name:'used',used:true,sideEffect:false},
  {name:'unused',used:false,sideEffect:false},
  {name:'styles',used:false,sideEffect:true}
];
console.log(modules.filter(item=>item.used||item.sideEffect).map(item=>item.name));
modules[2].sideEffect=false;
console.log(modules.filter(item=>item.used||item.sideEffect).map(item=>item.name));
`,
  ['["used","styles"]', '["used"]'],
  "必要样式有副作用时需要保留，误标无副作用后可能丢失。真实 Tree Shaking 还需静态模块结构、语句分析与工具配置，不是这个布尔过滤器。",
  "model",
);
ex(
  "eng-babel",
  "语法兼容与运行时方法兼容分离",
  "用注入的能力表模拟缺少内置方法，不修改全局 Promise。",
  String.raw`
function firstAvailable(values, runtime) {
  if (typeof runtime.any !== 'function') return '需要 polyfill 或替代方案';
  return runtime.any(values);
}
console.log(firstAvailable([], {}));
console.log(firstAvailable([1,2], {any:values=>values[0]}));
`,
  ["需要 polyfill 或替代方案", 1],
  "代码能解析不代表运行时方法存在。这里注入的 any 只作同步能力占位，并不是 Promise.any 实现；真实 polyfill 要按目标环境选择和验证。",
  "model",
);
ex(
  "eng-quality",
  "外部数据需要运行时校验",
  "TypeScript 类型不在运行时保护 JSON；用小型校验函数说明边界。",
  String.raw`
function parseUser(input) {
  if (!input || typeof input.id!=='string' || !Number.isInteger(input.age)) throw new TypeError('用户格式错误');
  return {id:input.id,age:input.age};
}
console.log(parseUser({id:'A',age:20}));
try { parseUser({id:'A',age:null}); } catch(error) { console.log(error.name); }
`,
  ['{"id":"A","age":20}', "TypeError"],
  "显式校验挡住实际响应中的 null，返回可信领域对象。真实复杂契约适合 schema 库，仍需业务边界和错误恢复，不能用类型断言代替校验。",
);
ex(
  "eng-monorepo",
  "任务图的依赖优先顺序",
  "递归按依赖输出构建顺序；模型只覆盖无环依赖图。",
  String.raw`
const dependencies={app:['ui','core'],ui:['core'],core:[]};
const visited=new Set(),order=[];
function build(name) {
  if (visited.has(name)) return;
  visited.add(name);
  dependencies[name].forEach(build); order.push(name);
}
build('app');
console.log(order);
`,
  ['["core","ui","app"]'],
  "共享 core 只构建一次，依赖在消费者之前。真实任务图需要环检测、输入/输出缓存键和环境约束；本模型将 visited 提前标记，不能用来可靠检测循环。",
  "model",
);
ex(
  "eng-microfrontend",
  "远程模块失败时保留应用壳",
  "加载异常只降级局部区域，不替换整个导航与壳。",
  String.raw`
async function remoteView(loader) {
  try { return await loader(); }
  catch { return '局部降级'; }
}
console.log('应用壳可用');
console.log(await remoteView(()=>Promise.reject(new Error('远程入口失败'))));
console.log(await remoteView(()=>Promise.resolve('远程内容')));
`,
  ["应用壳可用", "局部降级", "远程内容"],
  "隔离失败让其他区域继续工作。真实微前端还需版本、路由、样式和共享依赖契约，这个异步函数不提供沙箱或权限隔离。",
  "model",
);

ex(
  "node-loop",
  "nextTick 与 Promise 的队列模型",
  "Worker 没有 Node process；显式队列只解释常见 CJS 回调边界下的优先级，不能用作所有 ESM 的真实顺序。",
  String.raw`
const nextTickQueue=[],microtasks=[];
nextTickQueue.push(()=>console.log('nextTick 模型'));
microtasks.push(()=>console.log('Promise 模型'));
console.log('同步');
while(nextTickQueue.length) nextTickQueue.shift()();
while(microtasks.length) microtasks.shift()();
console.log(typeof process);
`,
  ["同步", "nextTick 模型", "Promise 模型", "undefined"],
  "此模型故意手动清队列，Worker 本身不提供 process.nextTick。真实 Node 的阶段和 ESM 顶层顺序受上下文与版本影响，需用 Node 最小示例验证。",
  "model",
);
ex(
  "node-middleware",
  "洋葱模型的 await next",
  "用普通 async 中间件组合展示进入和回退顺序。",
  String.raw`
const middleware=[
  async next=>{ console.log('A 进入'); await next(); console.log('A 返回'); },
  async next=>{ console.log('B 进入'); await next(); console.log('B 返回'); }
];
function dispatch(index) { return Promise.resolve(middleware[index]?.(()=>dispatch(index+1))); }
await dispatch(0);
`,
  ["A 进入", "B 进入", "B 返回", "A 返回"],
  "外层等待下游完成后再返回。真实 Koa 组合还防止重复 next、传递 ctx 并处理异常；删掉 await 可以观察返回顺序变动，但不应把此简版作为生产 compose。",
);
ex(
  "node-stream",
  "背压让生产者等待消费者",
  "用异步逐项消费模拟限制积压；不调用 Node Stream，也不模拟 write/drain 的完整协议。",
  String.raw`
let buffered=0, peak=0;
for (const chunk of ['A','B','C']) {
  buffered++; peak=Math.max(peak,buffered);
  await new Promise(resolve=>setTimeout(resolve,5));
  buffered--;
  console.log('消费',chunk);
}
console.log(peak);
`,
  ["消费 A", "消费 B", "消费 C", 1],
  "每次等待消费完成再生产下一项，积压峰值为 1。真实 Stream 用 write 返回值和 drain/pipeline 传播背压，并处理错误和客户端断连。",
  "model",
);
ex(
  "node-buffer",
  "UTF-8 中文跨块解码",
  "使用 Worker 也提供的 TextEncoder/TextDecoder，演示字节分块不等于字符边界。",
  String.raw`
const bytes=new TextEncoder().encode('你好');
const decoder=new TextDecoder();
const first=decoder.decode(bytes.slice(0,2),{stream:true});
const rest=decoder.decode(bytes.slice(2),{stream:true})+decoder.decode();
console.log(bytes.length);
console.log(first.length);
console.log(first+rest);
`,
  [6, 0, "你好"],
  "“你”占三个 UTF-8 字节，前两字节不构成完整字符，流式解码器保留残留直到下块补齐。Node Buffer/网络流同样需要状态化解码，不能逐块随意 toString。",
);
ex(
  "node-workers",
  "CPU 任务分配给有界工作池",
  "这里只模拟任务分区，不创建真实 Node worker_threads 或展示并行性能。",
  String.raw`
function partition(tasks, workers) {
  const queues=Array.from({length:workers},()=>[]);
  tasks.forEach((task,index)=>queues[index%workers].push(task));
  return queues;
}
console.log(partition([1,2,3,4,5],2));
console.log(partition([1,2,3],1));
`,
  ["[[1,3,5],[2,4]]", "[[1,2,3]]"],
  "任务被分到固定数量工作者；真实 CPU 并行还需启动线程、传输数据、等待结果与处理超时。把普通任务放数组并不自动产生并行，负载不均时还要动态调度。",
  "model",
);
ex(
  "node-memory",
  "有界缓存比无限保留更可控",
  "用 Map 模拟保留对象数量，只说明引用存量，不模拟 GC 或真实 RSS。",
  String.raw`
const cache=new Map();
function put(key,value) {
  cache.set(key,value);
  if(cache.size>2) cache.delete(cache.keys().next().value);
}
for(let i=0;i<5;i++) put(i,{payload:i});
console.log(cache.size);
console.log([...cache.keys()]);
`,
  [2, "[3,4]"],
  "容量限制使旧引用不再被缓存保留；是否回收仍取决于其他引用和 GC。真实排查要分 heap/external/RSS，不可由缓存条数直接推断进程内存。",
  "model",
);
ex(
  "node-api",
  "重试复用幂等键的模型",
  "同一业务键重复提交返回原结果，参数冲突则拒绝；不模拟数据库并发事务。",
  String.raw`
const operations=new Map(); let created=0;
function create(key, amount) {
  if(operations.has(key)) {
    const previous=operations.get(key);
    if(previous.amount!==amount) throw new Error('幂等键参数冲突');
    return previous;
  }
  const result={id:++created,amount}; operations.set(key,result); return result;
}
console.log(create('order-A',100).id,create('order-A',100).id);
try { create('order-A',200); } catch(error) { console.log(error.message); }
`,
  ["1 1", "幂等键参数冲突"],
  "重试不重复创建，但不同参数不能悄悄复用旧结果。真实多实例要用数据库唯一约束和事务，内存 Map 不承担跨实例一致性和鉴权。",
  "model",
);
