import { ex, fromLab } from "./helpers.mjs";
ex(
  "perf-vitals",
  "按样本计算 p75，而不是只看平均",
  "使用 nearest-rank 定义演示 p75；并非 web-vitals SDK，也不是完整指标采集。",
  String.raw`
function percentile(values, ratio) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.ceil(sorted.length*ratio)-1];
}
const samples=[100,100,100,1000];
console.log(samples.reduce((a,b)=>a+b,0)/samples.length);
console.log(percentile(samples,0.75));
console.log(percentile(samples,0.95));
`,
  [325, 100, 1000],
  "均值为 325，但 p75 为 100，p95 落在 1000；不同统计量表达不同问题。真实 CWV 聚合需说明指标生命周期、足量样本与设备分组。",
);
ex(
  "perf-firstscreen",
  "不要把非关键资源放到关键串行链",
  "用依赖阶段预算比较加载策略，不发送真实请求。",
  String.raw`
const html=50,css=30,hero=100,analytics=80;
console.log(html+css+hero+analytics);
console.log(html+Math.max(css,hero));
console.log(html+Math.max(css,hero)+analytics);
`,
  [260, 150, 230],
  "模型中分析脚本不应阻塞关键内容，CSS 与主图可并行；关键内容 150ms 可用，不等于全部工作都完成。真实瀑布与 CPU 仍需实测，不把模型数字当优化成果。",
  "model",
);
fromLab(
  "perf-weaknetwork",
  "retry",
  "只对允许恢复的错误重试，并保留尝试次数。",
  String.raw`
let calls=0;
const result=await retryTask(attempt=>{
  calls++;
  if(attempt<3) throw new Error('暂时失败');
  return '成功';
},{maxAttempts:3,delayMs:5,shouldRetry:()=>true});
console.log(result,calls);
`,
  ["成功 3"],
  "两次失败后第三次成功，最大尝试数包含首次调用。真实请求还需幂等、随机抖动、总时限与取消；不是所有错误都适合重试。",
);
ex(
  "perf-offline",
  "版本冲突不能静默覆盖",
  "以基础版本为前提做条件写入，用内存模型代表服务端权威数据。",
  String.raw`
let document={version:2,text:'服务器内容'};
function sync(baseVersion,text) {
  if(baseVersion!==document.version) return '冲突';
  document={version:document.version+1,text}; return '已保存';
}
console.log(sync(1,'离线旧稿'));
console.log(document.text);
console.log(sync(2,'新稿'));
console.log(document.version);
`,
  ["冲突", "服务器内容", "已保存", 3],
  "基于旧版本的写入不能直接覆盖新内容；匹配后才递增版本。真实离线系统还需要持久队列、幂等、合并 UI 和用户/租户隔离。",
  "model",
);
ex(
  "perf-monitor",
  "错误聚合与敏感字段白名单",
  "只从原始事件提取必要字段，并按稳定指纹统计次数。",
  String.raw`
const raw={message:'加载失败',release:'v1',path:'/home',token:'secret-demo'};
const safe={message:raw.message,release:raw.release,path:raw.path};
const issues=new Map();
for(const event of [safe,safe]) {
  const key=event.release+':'+event.message;
  issues.set(key,(issues.get(key)??0)+1);
}
console.log(Object.hasOwn(safe,'token'));
console.log([...issues.values()]);
`,
  [false, "[2]"],
  "白名单避免顺手上传 token；指纹聚合相同错误以便观察频率。真实 SDK 需更细的脱敏、采样与上下文策略，消息本身也可能含敏感信息。",
);
ex(
  "perf-sdk",
  "至少一次传输与服务端事件去重",
  "同一事件被重传，接收端按 ID 保留一次业务效果。",
  String.raw`
const received=new Set(); let stored=0;
function accept(event) {
  if(received.has(event.id)) return '重复';
  received.add(event.id); stored++; return '接收';
}
console.log(accept({id:'e1'}));
console.log(accept({id:'e1'}));
console.log(stored);
`,
  ["接收", "重复", 1],
  "丢失 ACK 后重传会重复到达，稳定 ID 支持去重。真实平台还需可靠持久化后确认、有界客户端队列、退避和去重保留期，内存 Set 不是持久交付保证。",
  "model",
);
ex(
  "perf-longtask",
  "微任务并不等于让出一个任务",
  "同步计算切为微任务仍可能先于定时器和渲染机会全部完成。",
  String.raw`
console.log('同步');
setTimeout(()=>console.log('下一任务'),0);
for(let i=0;i<3;i++) queueMicrotask(()=>console.log('微任务',i));
`,
  ["同步", "微任务 0", "微任务 1", "微任务 2", "下一任务"],
  "微任务在检查点持续清空，递归微任务不天然给输入和绘制机会。真正拆分长任务要减少工作，或使用宿主任務调度/Worker，并测交互延迟。",
);
ex(
  "perf-release",
  "分组指标能暴露总体均值隐藏的退化",
  "演示固定分组下的变化方向，这些数值不是真实用户数据。",
  String.raw`
const before={fast:[100,100],slow:[800,800]};
const after={fast:[50,50,50,50,50,50],slow:[1000,1000]};
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
console.log(mean(Object.values(before).flat()));
console.log(mean(Object.values(after).flat()));
console.log(mean(after.slow)-mean(before.slow));
`,
  [450, 287.5, 200],
  "总体均值改善是因为样本结构和快设备收益，但慢设备退化 200。灰度应按设备网络和关键业务指标分层，不能只看一个总体均值。",
  "model",
);

fromLab(
  "algo-linked",
  "reverse",
  "反转后使用返回的新头，原 head 变为尾节点。",
  String.raw`
const third={val:3,next:null};
const second={val:2,next:third};
const first={val:1,next:second};
const head=reverseList(first),values=[];
for(let node=head;node;node=node.next) values.push(node.val);
console.log(values);
console.log(first.next===null);
`,
  ["[3,2,1]", true],
  "反转复用原节点，先保存 next 再改指针；返回值指向新的头，原 first 成为尾。调用方若仍从旧 head 遍历，只会看到一个节点。",
);
fromLab(
  "algo-cycle",
  "cycle",
  "值相同不代表环，相遇与入口按节点引用判断。",
  String.raw`
const a={val:1},b={val:1},c={val:1};
a.next=b; b.next=c; c.next=b;
console.log(detectCycle(a)===b);
c.next=null;
console.log(detectCycle(a));
`,
  [true, "null"],
  "第一个输入的入口为 b；断开 c.next 后三个重复值仍然存在，但链无环。快慢指针比较引用，不通过 val 判断。",
);
fromLab(
  "algo-tree",
  "bfs",
  "逐层收集树节点，当前层终点在处理前固定。",
  String.raw`
const root={val:1,left:{val:2,left:{val:4}},right:{val:3}};
console.log(levelOrder(root));
console.log(levelOrder(null));
`,
  ["[[1],[2,3],[4]]", "[]"],
  "层序队列把每层的节点划到一起，空树返回空结果。示例按树契约，不处理带环图；使用 head 游标可避免反复 shift。",
);
fromLab(
  "algo-lca",
  "lca",
  "两个目标必须都存在；同值的另一个对象不是同一节点。",
  String.raw`
const p={val:2},q={val:3},root={val:1,left:p,right:q};
console.log(lowestAncestor(root,p,q)===root);
console.log(lowestAncestor(root,p,{val:3}));
console.log(lowestAncestor(root,p,p)===p);
`,
  [true, "null", true],
  "第一组在根分叉，第二组 q 的同值新对象并不在树里，第三组同一目标存在时祖先就是自身。该解使用父指针表，空间 O(n)。",
);
fromLab(
  "algo-window",
  "window",
  "左边界只能向前；按 Unicode 码点统计长度。",
  String.raw`
console.log(longestUnique('abba'));
console.log(longestUnique('😀a😀b'));
console.log(longestUnique(''));
`,
  [2, 3, 0],
  "abba 不能把左边界因第二个 a 向后退；表情按码点视为一个元素。此例不等同完整用户感知字素簇分割，组合字符另有语义。",
);
fromLab(
  "algo-three-sum",
  "three-sum",
  "排序和双指针去重，不修改输入数组。",
  String.raw`
const source=[-1,0,1,2,-1,-4];
console.log(threeSum(source));
console.log(source);
console.log(threeSum([0,0,0,0]));
`,
  ["[[-1,-1,2],[-1,0,1]]", "[-1,0,1,2,-1,-4]", "[[0,0,0]]"],
  "固定点和两端都去重，结果不会重复；先复制再排序保留调用方输入。二重扫描的最坏时间为 O(n²)，不是线性。",
);
fromLab(
  "algo-interval",
  "intervals",
  "闭区间端点相接也合并；和半开会议区间约定不同。",
  String.raw`
console.log(mergeIntervals([[1,3],[2,6],[8,10]]));
console.log(mergeIntervals([[1,2],[2,3]]));
console.log(mergeIntervals([]));
`,
  ["[[1,6],[8,10]]", "[[1,3]]", "[]"],
  "本题使用闭区间与 <= 合并，因此 [1,2] 与 [2,3] 相接也合并。半开区间的冲突检测不能直接照搬条件，必须先确定业务契约。",
);
fromLab(
  "algo-stack",
  "brackets",
  "顺序和类型同时匹配，仅统计括号数量不够。",
  String.raw`
console.log(validBrackets('([]{})'));
console.log(validBrackets('([)]'));
console.log(validBrackets('(a)'));
`,
  [true, false, false],
  "第二个输入数量相同但嵌套类型错；第三个因本题仅允许括号而失败。解析真实 JavaScript 还要识别字符串、注释等，不能只用这个栈。",
);
fromLab(
  "algo-lru",
  "lru",
  "访问更新最近使用顺序，满容量淘汰最旧项。",
  String.raw`
const cache=createLRU(2);
cache.put('A',1);cache.put('B',2);
console.log(cache.get('A'));
cache.put('C',3);
console.log(cache.keys());
console.log(cache.get('B'));
`,
  [1, '["A","C"]', "undefined"],
  "读取 A 后它变最新，插入 C 淘汰 B。keys 按最旧到最新；get 需用 has 区分未命中和存在但值为 undefined。",
);
fromLab(
  "algo-kmp",
  "kmp",
  "前缀表复用已匹配信息，文本指针不回退。",
  String.raw`
console.log(findSubstring('abababcababaca','ababaca'));
console.log(findSubstring('😀abc','abc'));
console.log(findSubstring('abc',''));
`,
  [7, 2, 0],
  "第一次匹配在 7；UTF-16 里表情占两个码元，所以 abc 索引为 2；空模式按契约返回 0。复杂度为 O(n+m)，索引不是用户感知字符位置。",
);

ex(
  "design-list",
  "动态高度前缀和与定位",
  "根据已知高度找包含目标偏移的项目；这是列表数据模型，不渲染真实页面。",
  String.raw`
const heights=[40,60,50];
const prefix=[0];
for(const height of heights) prefix.push(prefix.at(-1)+height);
function locate(offset) { return heights.findIndex((height,i)=>offset>=prefix[i]&&offset<prefix[i+1]); }
console.log(prefix);
console.log(locate(80));
console.log(locate(100));
`,
  ["[0,40,100,150]", 1, 2],
  "80 落在第二项的 [40,100)，100 正好进入第三项。真实大列表可二分查找并维护测量缓存；图片改高、插入和滚动锚点还要独立处理。",
  "model",
);
ex(
  "design-chat",
  "ACK 与乐观消息归并",
  "临时消息在服务端确认后更新同一项，不再插入一条重复消息。",
  String.raw`
const messages=new Map();
messages.set('client-1',{clientId:'client-1',status:'sending',text:'你好'});
function acknowledge(clientId,serverId,seq) {
  const previous=messages.get(clientId);
  messages.set(clientId,{...previous,serverId,seq,status:'accepted'});
}
acknowledge('client-1','server-9',8);
acknowledge('client-1','server-9',8);
console.log(messages.size);
console.log(messages.get('client-1').status);
`,
  [1, "accepted"],
  "重复 ACK 更新同一条逻辑消息，界面不重复插入。accepted 只代表定义的接收状态，不自动等于已投递或已读；真实协议还要幂等、补拉和序号。",
  "model",
);
ex(
  "design-upload",
  "断点恢复只上传缺失片",
  "按 uploadId 对应的已确认分片集合计算缺片，不真正读文件或上传。",
  String.raw`
const total=5;
const confirmed=new Set([0,2,4]);
const missing=Array.from({length:total},(_,index)=>index).filter(index=>!confirmed.has(index));
console.log(missing);
console.log(confirmed.size/total*100);
`,
  ["[1,3]", 60],
  "缺片为 1 和 3；进度基于确认片计数仅适用于各片等大，实际末片和字节进度需按确认字节计算。服务端还要校验内容、所有权和幂等合并。",
  "model",
);
ex(
  "design-state",
  "票据用途、受众与时效一起校验",
  "用确定性条件模拟跨应用票据校验，不提供签名或真实身份认证。",
  String.raw`
function verify(ticket, audience, now) {
  return ticket.audience===audience&&ticket.expires>now&&ticket.purpose==='login';
}
const ticket={audience:'B',expires:200,purpose:'login'};
console.log(verify(ticket,'B',100));
console.log(verify(ticket,'A',100));
console.log(verify(ticket,'B',200));
`,
  [true, false, false],
  "票据不能随意跨受众重用，到期也应拒绝。真实服务端需验证签名/存储状态、防重放和用户授权；纯前端布尔判断不能建立可信登录态。",
  "model",
);
ex(
  "design-monitor",
  "按发布版本聚合故障率",
  "同一错误在不同发布中应分组，避免均值隐藏新版本回归。",
  String.raw`
const events=[{release:'v1',ok:true},{release:'v1',ok:true},{release:'v2',ok:false},{release:'v2',ok:true}];
const groups=new Map();
for(const event of events) {
  const group=groups.get(event.release)??{total:0,failed:0};
  group.total++;if(!event.ok)group.failed++;groups.set(event.release,group);
}
console.log([...groups].map(([release,group])=>[release,group.failed/group.total]));
`,
  ['[["v1",0],["v2",0.5]]'],
  "分组后 v2 的失败率明显不同；真实告警还需最低样本、用户影响、采样权重和版本关联，不能据两条演示事件做发布决策。",
  "model",
);
ex(
  "design-sdk",
  "init/dispose 的幂等契约",
  "反复初始化不重复注册，销毁后允许重新初始化。",
  String.raw`
let active=false,subscriptions=0;
const sdk={
  init(){if(active)return;active=true;subscriptions++;},
  dispose(){if(!active)return;active=false;subscriptions--;}
};
sdk.init();sdk.init();console.log(subscriptions);
sdk.dispose();sdk.dispose();console.log(subscriptions);
sdk.init();console.log(subscriptions);
`,
  [1, 0, 1],
  "初始化与销毁都幂等，资源计数不会重复或变负。真实 SDK 还需释放监听、队列和包装函数，并考虑多个版本共存，不能只用全局布尔值管理复杂所有权。",
  "model",
);

ex(
  "project-story",
  "从主张到证据清单",
  "用结构化数据检查一个项目故事是否给出了约束、动作和验证，不自动评价面试水平。",
  String.raw`
const story={problem:'列表卡顿',constraint:'低端机',action:'虚拟化',evidence:''};
const required=['problem','constraint','action','evidence'];
console.log(required.filter(key=>!story[key]));
story.evidence='同条件真机记录与节点数对照';
console.log(required.every(key=>Boolean(story[key])));
`,
  ['["evidence"]', "true"],
  "清单暴露缺失的证据项；填了文字不代表证据真实有效，仍需能解释测量和个人贡献。这是资料组织辅助，不是面试质量的自动语义评分。",
  "model",
);
ex(
  "project-metrics",
  "先固定测量口径再计算变化",
  "仅对演示样本计算中位数和变化比例，不把输入数字当个人业绩。",
  String.raw`
const median=values=>{const a=[...values].sort((x,y)=>x-y);return (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;};
const before=median([100,110,120]);
const after=median([70,80,90]);
console.log(before,after);
console.log(Number(((before-after)/before*100).toFixed(1)));
`,
  ["110 80", 27.3],
  "相同定义下演示中位数下降 27.3%，但计算正确不证明因果。真实回答要给设备网络、采样、分位数、失败率与对照；不能套用这些示例数字。",
  "model",
);
ex(
  "project-incident",
  "时间线与恢复耗时",
  "以虚构时间点区分发现与恢复，说明指标定义的重要性。",
  String.raw`
const timeline={started:100,detected:130,recovered:220};
console.log(timeline.detected-timeline.started);
console.log(timeline.recovered-timeline.detected);
console.log(timeline.recovered-timeline.started);
`,
  [30, 90, 120],
  "分别为发现延迟、发现后恢复和总影响时长，口径不同不应混用。实际事故还需用户影响、止损证据与长期改进，时间差不能替代根因分析。",
  "model",
);
ex(
  "project-refactor",
  "适配层让新旧契约渐进迁移",
  "将旧接口字段转换到统一契约，切换实现不迫使全部消费者同时修改。",
  String.raw`
function adaptLegacy(record) { return {id:record.user_id,name:record.user_name}; }
const legacy={user_id:'A',user_name:'Ada'};
const modern={id:'B',name:'Lin'};
console.log(adaptLegacy(legacy));
console.log([adaptLegacy(legacy),modern].map(user=>user.name));
`,
  ['{"id":"A","name":"Ada"}', '["Ada","Lin"]'],
  "适配层隔离旧格式，帮助小步替换。真实迁移应定义兼容期、测试、回退与旧路径删除计划，不能让适配层永久吞掉所有业务差异。",
);
ex(
  "project-depth",
  "把技术主张拆成可验证追问",
  "按实现、边界与证据组织追问树，不自动判断候选人是否掌握。",
  String.raw`
const claim={name:'并发池',checks:{mechanism:true,implementation:true,boundary:false,evidence:false}};
console.log(Object.entries(claim.checks).filter(([,ready])=>!ready).map(([key])=>key));
console.log(Object.values(claim.checks).filter(Boolean).length);
`,
  ['["boundary","evidence"]', 2],
  "实现过不等于边界和证据齐全，清单用于定位准备缺口。布尔值来自自己的核验，不是 AI 或程序根据几个关键词评定能力。",
  "model",
);

ex(
  "ai-transport",
  "文本流字节分块不保留事件边界",
  "同一段 SSE 文本可以被拆成任意字符串块，不能将块直接视作消息。",
  String.raw`
const event='data: A\n\ndata: B\n\n';
const chunks=[event.slice(0,3),event.slice(3,12),event.slice(12)];
console.log(chunks.length);
console.log(chunks.join('')===event);
console.log(event.split('\n\n').filter(Boolean));
`,
  [3, true, '["data: A","data: B"]'],
  "三个传输块仍只包含两个事件。最后一行仅用于完整已知 LF 文本的对照，不是生产解析器；真实流还要跨块解码、多行 data 与 CRLF/CR 状态。",
);
fromLab(
  "ai-sse-parser",
  "sse",
  "逐字符喂入 SSE 解析器，验证跨块 CRLF、多行 data 与 id。",
  String.raw`
const events=[];
const parser=createSSEParser(event=>events.push(event));
for(const char of 'id: 7\r\ndata: 你\r\ndata: 好\r\n\r\n') parser.push(char);
console.log(events.length);
console.log(events[0].id);
console.log(events[0].data.split('\n'));
`,
  [1, "7", '["你","好"]'],
  "解析器先组行再组事件，网络块边界不参与派发。此实验假设字节已正确 UTF-8 解码，完整链路还要限制缓冲大小并处理 retry/BOM 等契约。",
);
ex(
  "ai-cancel",
  "取消后忽略上一轮晚到结果",
  "generationId 防止旧结果落到新会话；真实终止后端计算还需要取消传播。",
  String.raw`
let generation=0,text='';
const old=++generation;
function append(id,chunk) { if(id===generation) text+=chunk; }
append(old,'A');
generation++;
append(old,'旧结果');
append(generation,'B');
console.log(text);
const controller=new AbortController();controller.abort();
console.log(controller.signal.aborted);
`,
  ["AB", true],
  "序号校验屏蔽旧 chunk，AbortSignal 标记客户端取消。aborted 为 true 不证明供应商计算或计费已结束，网关需传播取消或确认服务端终止。",
);
ex(
  "ai-render",
  "按批提交而不是每 token 渲染",
  "用固定批量模拟调度边界，不构造 DOM，也不实现 Markdown 渲染。",
  String.raw`
let buffer='',text='',commits=0;
function flush(){if(buffer){text+=buffer;buffer='';commits++;}}
for(const [index,token] of ['你','好','，','世','界'].entries()) {
  buffer+=token;if((index+1)%2===0)flush();
}
flush();
console.log(text);
console.log(commits);
`,
  ["你好，世界", 3],
  "五个 token 只提交三次且最终缓冲被刷新，避免末尾丢字。真实 UI 更适合按帧/时间预算提交，同时处理自动跟随、安全清洗与长列表更新范围。",
  "model",
);
ex(
  "ai-gateway",
  "预算检查与权限化缓存键",
  "用模型说明租户和提示版本参与隔离，不生成真实 API 密钥或费用数据。",
  String.raw`
function cacheKey({tenant,user,query,promptVersion}) {return JSON.stringify([tenant,user,query,promptVersion]);}
console.log(cacheKey({tenant:'T',user:'A',query:'你好',promptVersion:1})===cacheKey({tenant:'T',user:'B',query:'你好',promptVersion:1}));
function withinBudget(used,estimate,limit){return used+estimate<=limit;}
console.log(withinBudget(80,15,100));
console.log(withinBudget(80,30,100));
`,
  [false, true, false],
  "同样 query 不应跨用户裸复用；预估输出也需计入预算。真实网关还要并发原子配额、身份鉴权、供应商计费和取消，前端检查不能替代服务端边界。",
  "model",
);
ex(
  "ai-injection",
  "工具 schema 合法后仍需资源授权",
  "模型提议的资源 ID 必须由服务端按当前身份再检查，不能只信 JSON 格式。",
  String.raw`
const owned=new Set(['doc-A']);
function authorize(call) {
  return call.tool==='readDocument'&&typeof call.documentId==='string'&&owned.has(call.documentId);
}
console.log(authorize({tool:'readDocument',documentId:'doc-A'}));
console.log(authorize({tool:'readDocument',documentId:'doc-B'}));
console.log(authorize({tool:'sendToURL',documentId:'doc-A'}));
`,
  [true, false, false],
  "工具白名单、参数类型和资源所有权同时成立才接受。真正的身份、租户与数据权限必须在服务端确定性执行；关键词过滤和模型口头同意不构成授权。",
  "model",
);
fromLab(
  "ai-context",
  "context",
  "按完整轮次保留最新后缀，并先预留系统预算。",
  String.raw`
const history=[
 {role:'system',tokens:2,id:'system'},
 {role:'user',tokens:3,id:'old-user'},
 {role:'assistant',tokens:3,id:'old-answer'},
 {role:'user',tokens:2,id:'new-user'},
 {role:'assistant',tokens:2,id:'new-answer'}
];
console.log(trimHistory(history,7).map(message=>message.id));
console.log(trimHistory(history,2).map(message=>message.id));
`,
  ['["system","new-user","new-answer"]', '["system"]'],
  "预算 7 扣除系统 2 后只装下最新完整轮次 4；预算 2 只剩系统。真实上下文还需准确 tokenizer 和工具调用/结果配对，不能任意切断消息结构。",
);
ex(
  "ai-multimodal",
  "二进制字节与 base64 传输开销",
  "在已知字节长度下计算标准 base64 字符数，不执行文件上传或图片压缩。",
  String.raw`
const encodedLength=bytes=>4*Math.ceil(bytes/3);
console.log(encodedLength(3));
console.log(encodedLength(4));
console.log(encodedLength(300));
`,
  [4, 8, 400],
  "base64 每三字节变四字符，不满一组仍需填充；300 字节约变 400 字符，还未计 data URL 前缀和 JS 字符串内存。实际上传通常优先 Blob/二进制。",
  "model",
);
ex(
  "ai-agent",
  "确认必须绑定最终参数版本",
  "同一 operationId 的参数变了，旧确认不能继续放行。",
  String.raw`
const confirmation={operationId:'op-1',version:1,target:'A'};
function canExecute(operation) {
  return operation.id===confirmation.operationId&&operation.version===confirmation.version&&operation.target===confirmation.target;
}
console.log(canExecute({id:'op-1',version:1,target:'A'}));
console.log(canExecute({id:'op-1',version:2,target:'B'}));
`,
  [true, false],
  "确认与具体操作和最终参数绑定，参数变化需重新确认。真实服务端还要鉴权、幂等和不可逆动作边界，不能只在前端比字段。",
  "model",
);
ex(
  "ai-rag",
  "检索前过滤权限，再返回可访问引用",
  "本地数组模拟检索权限边界，真实过滤必须由可信服务端执行。",
  String.raw`
const documents=[{id:'public',allowed:true,score:0.8},{id:'private',allowed:false,score:0.99},{id:'team',allowed:true,score:0.9}];
const retrieved=documents.filter(doc=>doc.allowed).sort((a,b)=>b.score-a.score).slice(0,2);
console.log(retrieved.map(doc=>doc.id));
console.log(retrieved.some(doc=>doc.id==='private'));
`,
  ['["team","public"]', false],
  "高相关性不能覆盖权限要求；先排除无权文档。此模型里的 allowed 不是客户端可提交的真实授权，缓存答案和打开引用时仍需重新校验权限。",
  "model",
);
ex(
  "ai-local",
  "冷启动成本与复用次数",
  "比较下载初始化后多次本地推理与逐次云请求的总时间模型。",
  String.raw`
function localTotal(count){return 3000+count*20;}
function cloudTotal(count){return count*200;}
console.log(localTotal(1),cloudTotal(1));
console.log(localTotal(30),cloudTotal(30));
`,
  ["3020 200", "3600 6000"],
  "一次使用时冷启动主导，复用多次后本地模型可能摊薄成本。这里只比较虚构时间，真实选型还要模型大小、设备内存、功耗、隐私和准确率，不能只比热推理延迟。",
  "model",
);
ex(
  "ai-dev",
  "独立边界用例能揭示错误假设",
  "对一个故意错误的去重实现运行反例；不调用 AI 服务。",
  String.raw`
function generatedUnique(values){return values.filter((value,index)=>values.indexOf(value)===index);}
console.log(generatedUnique([1,1,2]));
console.log(generatedUnique([NaN,NaN]));
console.log([...new Set([NaN,NaN])].map(String));
`,
  ["[1,2]", "[]", '["NaN"]'],
  "普通样本正确不代表语义正确，indexOf 找不到 NaN，错误实现把它们都丢了。独立反例与输入契约比只让生成者自我评价更有检验力。",
);

ex(
  "arch-tradeoff",
  "硬约束优先于加权偏好",
  "先淘汰不满足兼容要求的方案，再在可行候选里比较指标。",
  String.raw`
const candidates=[{name:'新方案',compatible:false,score:95},{name:'稳定方案',compatible:true,score:80},{name:'折中方案',compatible:true,score:85}];
console.log(candidates.filter(item=>item.compatible).sort((a,b)=>b.score-a.score)[0].name);
console.log([...candidates].sort((a,b)=>b.score-a.score)[0].name);
`,
  ["折中方案", "新方案"],
  "不先处理硬约束会选出高分却不可交付的方案。分数来自人为权重和实测依据，不是客观万能排名；真实选型要记录假设、试点和退出策略。",
  "model",
);
ex(
  "arch-crossplatform",
  "共享领域规则，平台能力显式注入",
  "同一业务规则运行在不同适配器上；不假装所有端都有同样能力。",
  String.raw`
function checkout(platform,amount) {
  if(amount<=0)throw new Error('金额错误');
  return platform.pay(amount);
}
console.log(checkout({pay:amount=>'Web 支付 '+amount},10));
console.log(checkout({pay:amount=>'小程序支付 '+amount},10));
`,
  ["Web 支付 10", "小程序支付 10"],
  "共享业务校验而将支付能力留给平台适配器。真实支付仍需服务端订单、鉴权、签名和平台 SDK；这里只输出演示文本，不创建支付。",
  "model",
);
ex(
  "arch-scale",
  "轮询与重试会放大请求量",
  "用确定性算术估算流量，不代表任何实际微信业务规模。",
  String.raw`
function qps(users,intervalSeconds,retryMultiplier=1){return users/intervalSeconds*retryMultiplier;}
console.log(qps(10000,1));
console.log(qps(10000,10));
console.log(qps(10000,1,3));
`,
  [10000, 1000, 30000],
  "轮询间隔从 1 秒到 10 秒可降低基础频率，平均三次尝试则放大三倍。真实容量还看峰值、分组、缓存和重连抖动，不能只用均值配置资源。",
  "model",
);
ex(
  "arch-platform",
  "接入数据不等于价值，要看分母",
  "区分已接入数量与实际覆盖范围，避免用下载次数冒充采用率。",
  String.raw`
function adoption(used,eligible){return eligible ? used/eligible : null;}
console.log(adoption(8,10));
console.log(adoption(8,100));
console.log(adoption(0,0));
`,
  [0.8, 0.08, "null"],
  "同样接入 8 个团队，在不同目标范围里含义不同；无分母时不应硬算百分比。真实基建还需接入成本、稳定性和维护反馈，采用率不等于全部价值。",
  "model",
);
ex(
  "arch-future",
  "任务成功与流畅输出分开衡量",
  "使用虚构任务样本计算成功率和错误可恢复性，不自动评价模型产品。",
  String.raw`
const tasks=[{success:true,recovered:false},{success:false,recovered:true},{success:true,recovered:false},{success:false,recovered:false}];
console.log(tasks.filter(task=>task.success).length/tasks.length);
console.log(tasks.filter(task=>!task.success&&task.recovered).length);
`,
  [0.5, 1],
  "任务成功率为一半，其中一个失败能恢复；流畅动画或字数不能替代这类结果。真实评估还要安全、成本、延迟和代表性任务，不根据这四条虚构样本下结论。",
  "model",
);
ex(
  "study-priority",
  "用相关性和短板编排投入",
  "简单排序帮助做备考计划；权重由岗位和真实缺口确定，不是固定面试命中模型。",
  String.raw`
const topics=[{name:'异步',relevance:3,gap:3},{name:'冷门框架',relevance:1,gap:3},{name:'项目',relevance:3,gap:2}];
console.log(topics.sort((a,b)=>b.relevance*b.gap-a.relevance*a.gap).map(topic=>topic.name));
`,
  ['["异步","项目","冷门框架"]'],
  "相关性乘短板程度是一个可解释的编排启发，不代表真实题频或通过率。实际仍要看简历主张、岗位要求和你能否独立解释与实现。",
  "model",
);
ex(
  "study-answer",
  "把已知、推断与待验证分开",
  "结构化输出回答依据，避免把推断说成确定事实。",
  String.raw`
const claims=[{kind:'已知',text:'all 不自动取消请求'},{kind:'推断',text:'封装可能主动 abort'},{kind:'待验证',text:'当前项目封装实现'}];
console.log(claims.filter(claim=>claim.kind==='已知').map(claim=>claim.text));
console.log(claims.filter(claim=>claim.kind!=='已知').length);
`,
  ['["all 不自动取消请求"]', 2],
  "已知语义、合理推测和待查实现需要明确标记。程序只帮整理标签，不判断陈述真假；还需官方文档、源码和最小实验支持。",
  "model",
);
ex(
  "study-review",
  "简化间隔规则的确定性计算",
  "演示当前项目的学习间隔，而非完整 FSRS 或学习效果保证。",
  String.raw`
function interval(previous,rating) {
  if(rating===0)return 10/1440;
  if(rating===1)return 1;
  return rating===2?Math.max(2,Math.round(previous*1.8)):Math.max(4,Math.round(previous*2.5));
}
console.log(interval(0,2));
console.log(interval(2,3));
console.log(interval(5,1));
`,
  [2, 5, 1],
  "首次独立回答至少 2 天，再很稳可到 5 天，困难则缩回 1 天。记忆强度并非由这一公式精确描述，开放题自评也需要主动回忆验证。",
);
ex(
  "study-plan",
  "时间不足的内容进入待排，不堆最后一天",
  "用有界天数和每日预算编排任务，剩余保留为 backlog。",
  String.raw`
const tasks=[8,8,8,8,8];
const days=[[],[]];const backlog=[];let day=0,total=0;
for(const minutes of tasks){
  if(total+minutes>16){day++;total=0;}
  if(day>=days.length){backlog.push(minutes);continue;}
  days[day].push(minutes);total+=minutes;
}
console.log(days);
console.log(backlog.length);
`,
  ["[[8,8],[8,8]]", 1],
  "两天各容纳 16 分钟，最后一个任务留待后续周期，不伪装成一天能完成全部。真实计划还需复习、手写、休息和任务估时的不确定性。",
);
