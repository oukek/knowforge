export const labs = [];
const add = (
  id,
  lessonId,
  title,
  prompt,
  signature,
  solution,
  tests,
  complexity,
  hints,
) =>
  labs.push({
    id,
    lessonId,
    title,
    prompt,
    signature,
    starter: `${signature} {\n  // 在这里实现，保持函数名和参数不变\n  throw new Error('尚未实现');\n}`,
    solution,
    tests: tests.map(([name, code]) => ({ name, code })),
    complexity,
    hints,
    provenance: "editorial",
    timeLimitMs: 4000,
  });
add(
  "pool",
  "js-concurrency",
  "并发任务池",
  "实现 settlePool(tasks, limit)：tasks 是延迟执行函数数组。最多 limit 个任务同时执行，返回按输入顺序排列的 {status,value/reason}。同步 throw 和异步 reject 都记录为 rejected，不中断其他任务。非法 limit 抛 RangeError。",
  "async function settlePool(tasks, limit)",
  `async function settlePool(tasks, limit) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit');
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      try { results[index] = {status:'fulfilled', value:await tasks[index]()}; }
      catch (reason) { results[index] = {status:'rejected', reason}; }
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,tasks.length)},worker));
  return results;
}`,
  [
    ["空任务", "equal(await fn([], 2), []);"],
    [
      "结果顺序",
      "const r=await fn([async()=>{await delay(25);return 1},()=>2],2); equal(r.map(x=>x.value),[1,2]);",
    ],
    [
      "上限与真正延迟启动",
      'let active=0,max=0; const tasks=Array.from({length:7},(_,i)=>async()=>{active++;max=Math.max(max,active);await delay(8);active--;return i}); await fn(tasks,2); assert(max===2,"并发应恰好达到且不超过 2");',
    ],
    [
      "同步 throw 与 reject",
      'const r=await fn([()=>{throw "sync"},()=>Promise.reject("async"),()=>3],2); equal(r.map(x=>x.status),["rejected","rejected","fulfilled"]); equal(r.map(x=>x.reason ?? x.value),["sync","async",3]);',
    ],
    [
      "非法并发",
      "let ok=false;try{await fn([],0)}catch(e){ok=e instanceof RangeError}assert(ok);",
    ],
  ],
  "时间 O(n)，额外空间 O(n + limit)。",
  [
    "先写固定数量 worker，不要先调用全部 tasks。",
    "共享索引领取任务，再 await；完成顺序与结果索引分开。",
    "每项 try/catch，让失败也释放执行槽。",
  ],
);
add(
  "promise-all",
  "js-promise-combinators",
  "实现 Promise.all",
  "实现 promiseAll(iterable)，接受可迭代输入、普通值和 Promise。保持输入顺序，任一拒绝后拒绝，空输入成功。不能直接调用原生 Promise.all。",
  "function promiseAll(iterable)",
  `function promiseAll(iterable) {
  return new Promise((resolve,reject)=>{
    const values = Array.from(iterable);
    if (!values.length) { resolve([]); return; }
    const result = new Array(values.length);
    let remaining = values.length;
    values.forEach((value,i)=>Promise.resolve(value).then(x=>{
      result[i]=x;
      if (--remaining===0) resolve(result);
    },reject));
  });
}`,
  [
    ["空输入", "equal(await fn([]),[]);"],
    [
      "混合与顺序",
      "equal(await fn([delay(20).then(()=>1),2,Promise.resolve(3)]),[1,2,3]);",
    ],
    ["可迭代", "equal(await fn(new Set([1,2])),[1,2]);"],
    [
      "拒绝传播",
      'let reason;try{await fn([1,Promise.reject("x")])}catch(e){reason=e}equal(reason,"x");',
    ],
    ["thenable", "equal(await fn([{then(resolve){resolve(7)}}]),[7]);"],
  ],
  "时间 O(n)，结果空间 O(n)。该教学实现不覆盖完整迭代器关闭等规范细节。",
  [
    "返回一个新 Promise。",
    "用计数器判断全部完成，不用数组长度。",
    "用 Promise.resolve 采用普通值和 thenable。",
  ],
);
add(
  "clone",
  "js-clone",
  "保留循环与别名的对象克隆",
  "实现 cloneGraph(value)，输入仅包含基本值、普通对象和数组，均为自有可枚举字符串键。保留循环和共享引用，不修改输入；本题不处理 Date/Map/原型/描述符。",
  "function cloneGraph(value)",
  `function cloneGraph(value) {
  const seen = new WeakMap();
  function copy(x) {
    if (x === null || typeof x !== 'object') return x;
    if (seen.has(x)) return seen.get(x);
    const out = Array.isArray(x) ? new Array(x.length) : {};
    seen.set(x,out);
    for (const key of Object.keys(x)) {
      Object.defineProperty(out,key,{value:copy(x[key]),enumerable:true,writable:true,configurable:true});
    }
    return out;
  }
  return copy(value);
}`,
  [
    [
      "基础与嵌套",
      "const a={x:[1,{n:2}],v:null};const b=fn(a);equal(b,a);assert(b!==a&&b.x!==a.x&&b.x[1]!==a.x[1]);",
    ],
    ["自循环", "const a={};a.self=a;const b=fn(a);assert(b!==a&&b.self===b);"],
    [
      "别名",
      "const child={n:1};const b=fn({a:child,b:child});assert(b.a===b.b&&b.a!==child);",
    ],
    [
      "基本值",
      "assert(fn(undefined)===undefined); assert(fn(null)===null); assert(Number.isNaN(fn(NaN)));",
    ],
    [
      "特殊键安全",
      'const a={};Object.defineProperty(a,"__proto__",{value:{polluted:true},enumerable:true});const b=fn(a);assert(Object.hasOwn(b,"__proto__"));assert(Object.getPrototypeOf(b)===Object.prototype);',
    ],
  ],
  "时间 O(节点+键)，映射与递归空间 O(n)，深链需考虑显式栈。",
  [
    "WeakMap 记录源对象→新对象。",
    "递归子项前先登记副本。",
    "赋 __proto__ 时要避免触发原型 setter。",
  ],
);
add(
  "debounce",
  "js-rate-limit",
  "带 cancel 的尾缘防抖",
  "实现 debounce(fn, wait)，末次调用后的 wait 毫秒执行，保留 this 和最新参数。返回函数提供 cancel()，取消待执行任务。本题不实现 leading/flush/maxWait。",
  "function debounce(fn, wait)",
  `function debounce(fn, wait) {
  let timer;
  function wrapped(...args) {
    clearTimeout(timer);
    const context=this;
    timer=setTimeout(()=>{timer=undefined;fn.apply(context,args)},wait);
  }
  wrapped.cancel=()=>{clearTimeout(timer);timer=undefined};
  return wrapped;
}`,
  [
    [
      "只执行末次",
      "const a=[];const f=fn(x=>a.push(x),15);f(1);f(2);await delay(45);equal(a,[2]);",
    ],
    [
      "保留 this",
      "const a=[];const obj={x:4,run:fn(function(n){a.push(this.x+n)},10)};obj.run(3);await delay(35);equal(a,[7]);",
    ],
    [
      "取消",
      "let n=0;const f=fn(()=>n++,15);f();f.cancel();await delay(40);assert(n===0);",
    ],
    [
      "执行后可再次使用",
      "let n=0;const f=fn(()=>n++,10);f();await delay(35);f();await delay(35);assert(n===2);",
    ],
  ],
  "每次调用 O(1)，保存一个计时器和最近调用闭包。",
  [
    "计时器 ID 保存在闭包。",
    "调用时保存当前 this 与参数。",
    "cancel 要清计时器，函数执行后还应可复用。",
  ],
);
add(
  "flatten",
  "js-array-version",
  "指定深度的数组扁平化",
  "实现 flatten(input, depth=1)，仅展开数组，顺序不变，跳过稀疏空槽，不修改输入。depth 是非负整数或 Infinity；非法深度抛 RangeError。",
  "function flatten(input, depth = 1)",
  `function flatten(input, depth=1) {
  if (!(depth===Infinity || Number.isInteger(depth)&&depth>=0)) throw new RangeError('depth');
  const output=[];
  const stack=[{array:input,index:0,depth}];
  while(stack.length){
    const frame=stack[stack.length-1];
    if(frame.index>=frame.array.length){stack.pop();continue}
    const i=frame.index++;
    if(!(i in frame.array))continue;
    const value=frame.array[i];
    if(Array.isArray(value)&&frame.depth>0)stack.push({array:value,index:0,depth:frame.depth-1});
    else output.push(value);
  }
  return output;
}`,
  [
    ["默认一层", "equal(fn([1,[2,[3]]]),[1,2,[3]]);"],
    ["无限", "equal(fn([1,[2,[3]]],Infinity),[1,2,3]);"],
    ["空槽", "equal(fn([,1,[,2]],1),[1,2]);"],
    [
      "不修改输入",
      "const a=[1,[2]];const b=fn(a,0);assert(b!==a&&b[1]===a[1]);",
    ],
    [
      "深链不爆栈",
      "let a=[1];for(let i=0;i<12000;i++)a=[a];equal(fn(a,Infinity),[1]);",
    ],
  ],
  "时间与访问的元素/槽位相关，显式栈空间 O(嵌套深度)。",
  [
    "可用显式栈保存数组、索引与剩余深度。",
    "注意空槽与显式 undefined 不同。",
    "深度 0 仍返回新数组，内部引用不展开。",
  ],
);
add(
  "version",
  "js-array-version",
  "大数字点分版本比较",
  "实现 compareVersion(a,b)，输入为非空、纯数字点分版本。忽略前导零与尾部零段，返回 -1/0/1。不处理 SemVer 预发布；段值可能超出安全整数。非法格式抛 TypeError。",
  "function compareVersion(a, b)",
  `function compareVersion(a,b) {
  const valid=x=>typeof x==='string'&&/^\\d+(\\.\\d+)*$/.test(x);
  if(!valid(a)||!valid(b))throw new TypeError('version');
  const aa=a.split('.'),bb=b.split('.');
  for(let i=0;i<Math.max(aa.length,bb.length);i++){
    const x=(aa[i]||'0').replace(/^0+/,'')||'0';
    const y=(bb[i]||'0').replace(/^0+/,'')||'0';
    if(x.length!==y.length)return x.length>y.length?1:-1;
    if(x!==y)return x>y?1:-1;
  }
  return 0;
}`,
  [
    ["数字段比较", 'equal(fn("1.10","1.2"),1);equal(fn("2","10"),-1);'],
    ["零与缺失段", 'equal(fn("01.0.0","1"),0);'],
    ["超大整数", 'equal(fn("1.9007199254740993","1.9007199254740992"),1);'],
    [
      "非法输入",
      'let ok=false;try{fn("1..2","1")}catch(e){ok=e instanceof TypeError}assert(ok);',
    ],
  ],
  "时间 O(输入字符数)，空间 O(输入字符数)。",
  [
    "不能 parseFloat 整串。",
    "去掉前导零后先比长度，再按字典序比同长数字串。",
    "把缺失段视为 0，但先验证原始格式。",
  ],
);
add(
  "lru",
  "algo-lru",
  "Map 版 LRU 缓存",
  "实现 createLRU(capacity)，返回 get(key)、put(key,value)、keys()。get 不存在返回 undefined；命中/更新变为最近使用；keys 按最旧→最新输出。capacity=0 不存储，非法容量抛 RangeError。",
  "function createLRU(capacity)",
  `function createLRU(capacity) {
  if(!Number.isInteger(capacity)||capacity<0)throw new RangeError('capacity');
  const map=new Map();
  return {
    get(key){if(!map.has(key))return undefined;const value=map.get(key);map.delete(key);map.set(key,value);return value},
    put(key,value){if(!capacity)return;map.delete(key);map.set(key,value);if(map.size>capacity)map.delete(map.keys().next().value)},
    keys(){return [...map.keys()]}
  };
}`,
  [
    [
      "淘汰与访问",
      'const c=fn(2);c.put("a",1);c.put("b",2);equal(c.get("a"),1);c.put("c",3);equal(c.keys(),["a","c"]);assert(c.get("b")===undefined);',
    ],
    [
      "更新已有键",
      'const c=fn(2);c.put("a",1);c.put("b",2);c.put("a",9);equal(c.keys(),["b","a"]);equal(c.get("a"),9);',
    ],
    [
      "undefined 值也命中",
      'const c=fn(2);c.put("a",undefined);c.put("b",2);c.get("a");equal(c.keys(),["b","a"]);',
    ],
    ["零容量", "const c=fn(0);c.put(1,1);equal(c.keys(),[]);"],
  ],
  "Map 访问平均次线性；常见实现近似 O(1)，严格 O(1) 可手写哈希表+双向链表。",
  [
    "Map 维护插入顺序。",
    "命中时先 delete 再 set 更新顺序。",
    "用 has 区分不存在和存在但值 undefined。",
  ],
);
add(
  "reverse",
  "algo-linked",
  "单链表原地反转",
  "实现 reverseList(head)，节点为 {val,next}，空链为 null，输入无环。复用原节点并返回新头，不得通过数组重新建节点。",
  "function reverseList(head)",
  `function reverseList(head) {
  let prev=null, current=head;
  while(current){const next=current.next;current.next=prev;prev=current;current=next}
  return prev;
}`,
  [
    ["空链", "assert(fn(null)===null);"],
    ["单节点", "const a={val:1,next:null};assert(fn(a)===a&&a.next===null);"],
    [
      "保留节点引用",
      "const c={val:3,next:null},b={val:2,next:c},a={val:1,next:b};const r=fn(a);assert(r===c&&c.next===b&&b.next===a&&a.next===null);",
    ],
  ],
  "时间 O(n)，额外空间 O(1)。",
  [
    "保存 next 后再修改 current.next。",
    "prev 是已反转链的头。",
    "最后返回 prev。",
  ],
);
add(
  "cycle",
  "algo-cycle",
  "找环入口",
  "实现 detectCycle(head)，若无环返回 null，有环返回入口节点引用。额外空间 O(1)，不要改变输入。",
  "function detectCycle(head)",
  `function detectCycle(head) {
  let slow=head,fast=head;
  while(fast&&fast.next){
    slow=slow.next;fast=fast.next.next;
    if(slow===fast){let p=head;while(p!==slow){p=p.next;slow=slow.next}return p}
  }
  return null;
}`,
  [
    [
      "空与无环",
      "assert(fn(null)===null);assert(fn({val:1,next:null})===null);",
    ],
    ["自环", "const a={val:1};a.next=a;assert(fn(a)===a);"],
    [
      "中间入口",
      "const a={val:1},b={val:1},c={val:1};a.next=b;b.next=c;c.next=b;assert(fn(a)===b);",
    ],
    [
      "不修改结构",
      "const a={val:1},b={val:2};a.next=b;b.next=a;fn(a);assert(a.next===b&&b.next===a);",
    ],
  ],
  "时间 O(n)，额外空间 O(1)。",
  [
    "先快慢相遇，再找入口。",
    "一指针从头，一指针从相遇点，各走一步。",
    "比较节点引用，不比较 val。",
  ],
);
add(
  "bfs",
  "algo-tree",
  "二叉树层序遍历",
  "实现 levelOrder(root)，输出按层分组的节点值数组。空树返回 []。节点为 {val,left,right}。",
  "function levelOrder(root)",
  `function levelOrder(root) {
  if(!root)return [];
  const queue=[root],output=[];let head=0;
  while(head<queue.length){const end=queue.length,level=[];while(head<end){const node=queue[head++];level.push(node.val);if(node.left)queue.push(node.left);if(node.right)queue.push(node.right)}output.push(level)}
  return output;
}`,
  [
    ["空树", "equal(fn(null),[]);"],
    [
      "三层",
      "equal(fn({val:1,left:{val:2,left:{val:4}},right:{val:3}}),[[1],[2,3],[4]]);",
    ],
    [
      "只有右侧",
      "equal(fn({val:1,right:{val:2,right:{val:3}}}),[[1],[2],[3]]);",
    ],
  ],
  "时间 O(n)，队列若保留已读元素会占 O(n)；循环队列可降到最大宽度 O(w)。",
  [
    "每层开始固定当前队尾。",
    "不要用每轮增长的 queue.length 作为本层结束条件。",
    "数组加 head 避免反复 shift。",
  ],
);
add(
  "lca",
  "algo-lca",
  "支持节点缺失的 LCA",
  "实现 lowestAncestor(root,p,q)，按引用识别节点；任一个不在树中返回 null。p===q 时若该节点存在就返回它。输入无环。",
  "function lowestAncestor(root, p, q)",
  `function lowestAncestor(root,p,q) {
  if(!root||!p||!q)return null;
  const parent=new Map([[root,null]]),stack=[root];
  while(stack.length){const node=stack.pop();for(const child of [node.left,node.right])if(child){parent.set(child,node);stack.push(child)}}
  if(!parent.has(p)||!parent.has(q))return null;
  const path=new Set();for(let x=p;x;x=parent.get(x))path.add(x);
  for(let x=q;x;x=parent.get(x))if(path.has(x))return x;
  return null;
}`,
  [
    [
      "同子树",
      "const p={val:2},q={val:3},a={val:1,left:p,right:q};assert(fn(a,p,q)===a);",
    ],
    [
      "祖先和后代",
      "const q={val:3},p={val:2,left:q},r={val:1,left:p};assert(fn(r,p,q)===p);",
    ],
    ["缺失", "const p={val:1};assert(fn(p,p,{val:1})===null);"],
    ["同一目标", "const p={val:1};assert(fn(p,p,p)===p);"],
  ],
  "此迭代方案时间 O(n)，空间 O(n)，避免深递归；也可递归携带命中信息。",
  [
    "先构建 parent 映射并确认存在性。",
    "记录 p 的所有祖先。",
    "从 q 向上第一个命中的即 LCA。",
  ],
);
add(
  "window",
  "algo-window",
  "最长无重复子串",
  "实现 longestUnique(text)，按 Unicode 码点处理（Array.from 语义，不要求完整 grapheme cluster），返回最长无重复连续子串的码点长度。",
  "function longestUnique(text)",
  `function longestUnique(text) {
  const chars=Array.from(text),last=new Map();let left=0,best=0;
  for(let right=0;right<chars.length;right++){const c=chars[right];if(last.has(c))left=Math.max(left,last.get(c)+1);last.set(c,right);best=Math.max(best,right-left+1)}
  return best;
}`,
  [
    ["空串", 'equal(fn(""),0);'],
    [
      "典型",
      'equal(fn("abcabcbb"),3);equal(fn("bbbbb"),1);equal(fn("abba"),2);',
    ],
    ["码点", 'equal(fn("😀a😀b"),3);'],
    ["边界不后退", 'equal(fn("tmmzuxt"),5);'],
  ],
  "时间 O(n)，空间 O(字符集/输入长度)。",
  [
    "左边界不能向后移动。",
    "Map 记录码点最后一次出现位置。",
    "明确 Unicode 码点与用户感知字符不同。",
  ],
);
add(
  "brackets",
  "algo-stack",
  "有效括号",
  "实现 validBrackets(text)，只接受 ()[]{}，空串为 true。出现其他字符返回 false。",
  "function validBrackets(text)",
  `function validBrackets(text) {
  const pairs={')':'(',']':'[','}':'{'},stack=[];
  for(const c of text){if('([{'.includes(c))stack.push(c);else if(pairs[c]){if(stack.pop()!==pairs[c])return false}else return false}
  return stack.length===0;
}`,
  [
    ["空与有效", 'assert(fn("")===true);assert(fn("([]{})")===true);'],
    ["数量相同但乱序", 'assert(fn("([)]")===false);'],
    ["多余/缺失", 'assert(fn(")")===false);assert(fn("((")===false);'],
    ["其他字符", 'assert(fn("(a)")===false);'],
  ],
  "时间 O(n)，空间 O(n)。",
  [
    "右括号匹配最近的左括号。",
    "必须检查栈为空和类型。",
    "结束时也要确认栈空。",
  ],
);
add(
  "intervals",
  "algo-interval",
  "合并闭区间",
  "实现 mergeIntervals(intervals)，输入为合法数字闭区间 [start,end]，端点相接算合并。返回升序、不重叠的新区间数组，不修改输入。",
  "function mergeIntervals(intervals)",
  `function mergeIntervals(intervals) {
  const sorted=intervals.map(x=>[...x]).sort((a,b)=>a[0]-b[0]),out=[];
  for(const current of sorted){const prev=out[out.length-1];if(prev&&current[0]<=prev[1])prev[1]=Math.max(prev[1],current[1]);else out.push(current)}
  return out;
}`,
  [
    ["普通", "equal(fn([[1,3],[2,6],[8,10],[15,18]]),[[1,6],[8,10],[15,18]]);"],
    ["相接/包含", "equal(fn([[1,4],[4,5],[2,3]]),[[1,5]]);"],
    ["空", "equal(fn([]),[]);"],
    [
      "不改输入",
      "const a=[[8,9],[1,2],[2,5]];fn(a);equal(a,[[8,9],[1,2],[2,5]]);",
    ],
  ],
  "时间 O(n log n)，额外空间 O(n)。",
  [
    "先复制每个区间再排序。",
    "当前区间与输出最后一项比较。",
    "闭区间使用 <= 判断合并。",
  ],
);
add(
  "three-sum",
  "algo-three-sum",
  "三数之和",
  "实现 threeSum(nums)，返回和为 0 的不重复三元组，每组三个值升序，结果按字典序升序，不修改输入。本题输入有限整数。",
  "function threeSum(nums)",
  `function threeSum(nums) {
  const a=[...nums].sort((x,y)=>x-y),out=[];
  for(let i=0;i<a.length-2;i++){if(i&&a[i]===a[i-1])continue;let l=i+1,r=a.length-1;while(l<r){const sum=a[i]+a[l]+a[r];if(sum<0)l++;else if(sum>0)r--;else{out.push([a[i],a[l],a[r]]);const x=a[l],y=a[r];while(l<r&&a[l]===x)l++;while(l<r&&a[r]===y)r--}}}
  return out;
}`,
  [
    ["典型", "equal(fn([-1,0,1,2,-1,-4]),[[-1,-1,2],[-1,0,1]]);"],
    ["全零", "equal(fn([0,0,0,0]),[[0,0,0]]);"],
    ["无解和短数组", "equal(fn([1,2,3]),[]);equal(fn([0,0]),[]);"],
    ["不修改输入", "const a=[2,-1,-1];fn(a);equal(a,[2,-1,-1]);"],
  ],
  "时间 O(n²)，复制 O(n)，结果空间另计。",
  [
    "固定一个数，余下双指针。",
    "固定值与左右指针都需要去重。",
    "原数组先复制，JS sort 传数值比较。",
  ],
);
add(
  "emitter",
  "js-closure",
  "可取消订阅的事件总线",
  "实现 createEmitter()，提供 on(event,handler) 返回 unsubscribe、emit(event,...args)。按订阅顺序同步通知；本轮 emit 使用订阅快照，通知中取消订阅不影响本轮，下一轮生效。重复订阅视作独立记录。",
  "function createEmitter()",
  `function createEmitter() {
  const events=new Map();
  return {
    on(event,handler){const item={handler};if(!events.has(event))events.set(event,[]);events.get(event).push(item);let active=true;return()=>{if(!active)return;active=false;const list=events.get(event);const i=list?.indexOf(item)??-1;if(i>=0)list.splice(i,1);if(list?.length===0)events.delete(event)}},
    emit(event,...args){for(const item of [...(events.get(event)||[])])item.handler(...args)}
  };
}`,
  [
    [
      "订阅和退订",
      'const e=fn(),a=[];const off=e.on("x",x=>a.push(x));e.emit("x",1);off();off();e.emit("x",2);equal(a,[1]);',
    ],
    [
      "本轮快照",
      'const e=fn(),a=[];let off;e.on("x",()=>{a.push(1);off()});off=e.on("x",()=>a.push(2));e.emit("x");e.emit("x");equal(a,[1,2,1]);',
    ],
    [
      "重复与参数",
      'const e=fn(),a=[],f=(x,y)=>a.push(x+y);const off=e.on("x",f);e.on("x",f);off();e.emit("x",2,3);equal(a,[5]);',
    ],
  ],
  "on 平均 O(1)，emit O(k)，本实现退订 O(k)。",
  [
    "订阅记录用独立对象，不要直接用 Set 吞掉重复。",
    "emit 先复制当前订阅列表。",
    "unsubscribe 保持幂等并删除空事件。",
  ],
);
add(
  "sse",
  "ai-sse-parser",
  "增量 SSE 文本解析器",
  "实现 createSSEParser(onEvent)，返回 push(text)、end()。输入已经按 UTF-8 正确解码；支持 LF、CRLF、CR（含跨块）、注释、data 多行、event/id。空行提交有 data 的事件，默认 event=message，id 跨事件保留；忽略含 NUL 的 id。end 丢弃未完成事件。本题不实现 retry/BOM。",
  "function createSSEParser(onEvent)",
  `function createSSEParser(onEvent) {
  let line='',data=[],event='',id='',skipLF=false;
  function consume(s){
    if(s===''){if(data.length)onEvent({event:event||'message',data:data.join('\\n'),id});data=[];event='';return}
    if(s[0]===':')return;
    const i=s.indexOf(':'),key=i<0?s:s.slice(0,i);
    let value=i<0?'':s.slice(i+1);if(value[0]===' ')value=value.slice(1);
    if(key==='data')data.push(value);else if(key==='event')event=value;else if(key==='id'&&!value.includes('\\0'))id=value;
  }
  return {
    push(text){for(const c of text){if(skipLF){skipLF=false;if(c==='\\n')continue}if(c==='\\r'){consume(line);line='';skipLF=true}else if(c==='\\n'){consume(line);line=''}else line+=c}},
    end(){line='';data=[];event='';skipLF=false}
  };
}`,
  [
    [
      "跨块、多行、字段",
      'const a=[],p=fn(e=>a.push(e));p.push("id: 1\\r");p.push("\\nevent: token\\r\\ndata: 你\\r\\ndata: 好\\r\\n\\r\\n");equal(a,[{event:"token",data:"你\\n好",id:"1"}]);',
    ],
    [
      "多个事件与 id 继承",
      'const a=[],p=fn(e=>a.push(e));p.push("id: a\\ndata: 1\\n\\ndata: 2\\n\\n");equal(a.map(x=>x.id),["a","a"]);equal(a.map(x=>x.data),["1","2"]);',
    ],
    [
      "CR 单独结束行",
      'const a=[],p=fn(e=>a.push(e));p.push(": hi\\rdata: x\\r\\r");equal(a,[{event:"message",data:"x",id:""}]);',
    ],
    [
      "末尾残帧不提交",
      'const a=[],p=fn(e=>a.push(e));p.push("data: x\\n");p.end();equal(a,[]);',
    ],
    [
      "逐字符推送",
      'const a=[],p=fn(e=>a.push(e));for(const c of "data: abc\\r\\n\\r\\n")p.push(c);equal(a[0].data,"abc");',
    ],
  ],
  "总时间 O(字符数) 的理想追加模型；实现时超长字符串拼接需额外限制，空间 O(未完成帧)。",
  [
    "行状态和事件状态分开。",
    "遇 CR 立刻结束一行，下一字符若是 LF 则跳过。",
    "空行是派发点，网络块末尾不是。",
  ],
);
add(
  "context",
  "ai-context",
  "按预算保留最近对话轮次",
  "实现 trimHistory(messages,budget)，messages 按时间升序，每项 {role,tokens,id}，role 只含 system/user/assistant。最多一个 system 且位于首项，必须保留。其后以 user 开始的轮次原子保留（不能只留 assistant）。从最新轮次向前选连续后缀，超预算即停。system 本身超预算抛 RangeError；tokens 为非负整数。",
  "function trimHistory(messages, budget)",
  `function trimHistory(messages,budget) {
  const system=messages[0]?.role==='system'?[messages[0]]:[];
  let used=system[0]?.tokens||0;
  if(used>budget)throw new RangeError('budget');
  const groups=[];
  for(const m of messages.slice(system.length)){if(m.role==='user')groups.push([]);if(!groups.length)throw new TypeError('orphan assistant');groups[groups.length-1].push(m)}
  const selected=[];
  for(let i=groups.length-1;i>=0;i--){const cost=groups[i].reduce((s,m)=>s+m.tokens,0);if(used+cost>budget)break;used+=cost;selected.unshift(groups[i])}
  return [...system,...selected.flat()];
}`,
  [
    [
      "保留整轮",
      'const a=[{role:"system",tokens:2,id:0},{role:"user",tokens:3,id:1},{role:"assistant",tokens:3,id:2},{role:"user",tokens:2,id:3},{role:"assistant",tokens:2,id:4}];equal(fn(a,7).map(x=>x.id),[0,3,4]);',
    ],
    [
      "超大最新轮不能跳过找旧轮",
      'const a=[{role:"user",tokens:1,id:1},{role:"user",tokens:10,id:2}];equal(fn(a,5),[]);',
    ],
    [
      "系统超限",
      'let ok=false;try{fn([{role:"system",tokens:9}],2)}catch(e){ok=e instanceof RangeError}assert(ok);',
    ],
    [
      "空与全部",
      'equal(fn([],0),[]);const a=[{role:"user",tokens:2,id:1}];equal(fn(a,2),a);',
    ],
  ],
  "时间 O(n)，空间 O(n)。真实 AI 上下文还需工具消息配对与准确 tokenizer。",
  [
    "先扣除必须保留的 system 预算。",
    "分组后从尾部整体选择。",
    "要连续最近后缀，不能绕过太大的一轮去挑旧数据。",
  ],
);
add(
  "retry",
  "perf-weaknetwork",
  "可控异步重试",
  "实现 retryTask(task, options)：task(attempt) 从 1 计数；options={maxAttempts,delayMs,shouldRetry}。成功返回值；失败且允许时等待后重试；达到上限或 shouldRetry=false 抛原错误。maxAttempts 非正整数抛 RangeError。本实验不含取消和抖动，口述需补充。",
  "async function retryTask(task, options)",
  `async function retryTask(task,{maxAttempts,delayMs=0,shouldRetry=()=>true}) {
  if(!Number.isInteger(maxAttempts)||maxAttempts<1)throw new RangeError('maxAttempts');
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{return await task(attempt)}catch(error){if(attempt===maxAttempts||!shouldRetry(error,attempt))throw error;await new Promise(r=>setTimeout(r,delayMs))}
  }
}`,
  [
    [
      "立即成功",
      "let n=0;equal(await fn(()=>++n,{maxAttempts:3}),1);assert(n===1);",
    ],
    [
      "失败两次后成功",
      'let n=0;equal(await fn(()=>{if(++n<3)throw "x";return n},{maxAttempts:3}),3);',
    ],
    [
      "不该重试",
      'let n=0,e;try{await fn(()=>{n++;throw "denied"},{maxAttempts:5,shouldRetry:()=>false})}catch(x){e=x}assert(n===1&&e==="denied");',
    ],
    [
      "最终错误",
      'const error=new Error("last");let e,n=0;try{await fn(()=>{n++;return Promise.reject(error)},{maxAttempts:2})}catch(x){e=x}assert(n===2&&e===error);',
    ],
    [
      "非法上限",
      "let ok=false;try{await fn(()=>1,{maxAttempts:0})}catch(e){ok=e instanceof RangeError}assert(ok);",
    ],
  ],
  "最多 maxAttempts 次调用；时间取决于任务和等待，额外空间 O(1)。",
  [
    "循环每次 await task，catch 后判断是否还能重试。",
    "最后一次失败要抛原错误。",
    "真实业务先判断幂等性和总时间预算。",
  ],
);
add(
  "merge-list",
  "algo-cycle",
  "合并两个有序链表",
  "实现 mergeSorted(a,b)，输入为互不共享节点、无环、非降序链表。复用节点返回合并链头，额外空间 O(1)。",
  "function mergeSorted(a, b)",
  `function mergeSorted(a,b) {
  const dummy={next:null};let tail=dummy;
  while(a&&b){if(a.val<=b.val){tail.next=a;a=a.next}else{tail.next=b;b=b.next}tail=tail.next}
  tail.next=a||b;return dummy.next;
}`,
  [
    ["空链", "assert(fn(null,null)===null);"],
    [
      "有序复用",
      "const a2={val:3,next:null},a={val:1,next:a2},b2={val:4,next:null},b={val:2,next:b2};const r=fn(a,b);assert(r===a&&a.next===b&&b.next===a2&&a2.next===b2);",
    ],
    [
      "相等与单侧",
      "const b={val:1,next:null};assert(fn(null,b)===b);const a={val:1,next:null};const r=fn(a,b);const values=[];let p=r;while(p&&values.length<4){values.push(p.val);p=p.next}equal(values,[1,1]);assert(p===null);",
    ],
  ],
  "时间 O(n+m)，额外空间 O(1)。",
  [
    "哑头统一初始插入边界。",
    "每次取当前较小节点后移动对应输入。",
    "一侧结束后直接接另一侧剩余链。",
  ],
);
add(
  "invoke",
  "js-invoke",
  "保留严格 this 的调用封装",
  "实现 invoke(fn,context,args=[])，支持冻结对象、严格函数的原始值/null this，保留返回值与异常。非函数抛 TypeError。本题允许使用 Reflect.apply，重点理解其与临时属性模拟的区别。",
  "function invoke(fn, context, args = [])",
  `function invoke(fn,context,args=[]) {
  if(typeof fn!=='function')throw new TypeError('fn');
  return Reflect.apply(fn,context,args);
}`,
  [
    [
      "冻结对象与参数",
      "const obj=Object.freeze({n:2});equal(fn(function(a,b){return this.n+a+b},obj,[3,4]),9);",
    ],
    [
      "严格 this 保真",
      'assert(fn(function(){"use strict";return this},null)===null);assert(fn(function(){"use strict";return this},7)===7);',
    ],
    [
      "传播异常",
      'const e=new Error("x");let got;try{fn(()=>{throw e},null)}catch(x){got=x}assert(got===e);',
    ],
    [
      "默认参数与类型检查",
      "equal(fn(()=>3,null),3);let ok=false;try{fn(1,null)}catch(e){ok=e instanceof TypeError}assert(ok);",
    ],
  ],
  "调用开销加参数传递；不额外创建对象属性。",
  [
    "不要强行 Object(context)，它会改变严格函数语义。",
    "Reflect.apply 不要求对象可扩展。",
    "不捕获吞掉目标函数的异常。",
  ],
);
add(
  "bind",
  "js-bind",
  "支持构造调用的 bind 教学版",
  "实现 bindLike(target,context,...preset)，普通调用固定 this 并合并参数；new 调用忽略 context、使用目标原型，保留构造器显式对象返回。不要求模拟原生 bound 的 name/length/prototype 属性。允许 Reflect.apply/construct，不允许原生 bind。",
  "function bindLike(target, context, ...preset)",
  `function bindLike(target,context,...preset) {
  if(typeof target!=='function')throw new TypeError('target');
  function bound(...args){if(new.target)return Reflect.construct(target,[...preset,...args],new.target===bound?target:new.target);return Reflect.apply(target,context,[...preset,...args])}
  return bound;
}`,
  [
    [
      "固定 this 与预置参数",
      "const f=fn(function(a,b){return this.x+a+b},{x:1},2);equal(f(3),6);equal(f.call({x:99},3),6);",
    ],
    [
      "构造与原型",
      'function Person(name){this.name=name}Person.prototype.kind="p";const context={};const Bound=fn(Person,context,"A");const p=new Bound();assert(p instanceof Person);equal(p.name,"A");equal(p.kind,"p");assert(context.name===undefined);',
    ],
    [
      "显式返回对象",
      "function C(){return {x:9}}const Bound=fn(C,null);equal(new Bound(),{x:9});",
    ],
    [
      "class 构造",
      "class C{constructor(x){this.x=x}}const Bound=fn(C,null,7);const c=new Bound();assert(c instanceof C);equal(c.x,7);",
    ],
  ],
  "每次调用拼接参数，时间/空间 O(参数量)。",
  [
    "new.target 识别构造调用。",
    "构造采用 Reflect.construct，不对 class 做 apply。",
    "newTarget 为包装自身时改为目标，让实例原型符合约定。",
  ],
);
add(
  "construct",
  "js-new",
  "实现普通构造函数的 new 步骤",
  "实现 newLike(Ctor,...args)，只要求普通可通过 apply 调用的构造函数，不含 class/Date/Proxy。不能直接使用 new Ctor 或 Reflect.construct；正确处理非对象 prototype、对象/函数返回和 null 返回。",
  "function newLike(Ctor, ...args)",
  `function newLike(Ctor,...args) {
  if(typeof Ctor!=='function')throw new TypeError('Ctor');
  const proto=Ctor.prototype;
  const valid=proto!==null&&(typeof proto==='object'||typeof proto==='function');
  const instance=Object.create(valid?proto:Object.prototype);
  const returned=Reflect.apply(Ctor,instance,args);
  return returned!==null&&(typeof returned==='object'||typeof returned==='function')?returned:instance;
}`,
  [
    [
      "原型与参数",
      "function C(x){this.x=x}C.prototype.y=2;const a=fn(C,1);assert(Object.getPrototypeOf(a)===C.prototype);equal([a.x,a.y],[1,2]);",
    ],
    ["对象覆盖", "const o={x:1};assert(fn(function(){return o})===o);"],
    [
      "null/原始值不覆盖",
      "const a=fn(function(){this.x=1;return null});equal(a.x,1);",
    ],
    [
      "非对象 prototype 回退",
      "function C(){}C.prototype=7;assert(Object.getPrototypeOf(fn(C))===Object.prototype);",
    ],
    [
      "函数返回值",
      "const result=()=>1;assert(fn(function(){return result})===result);",
    ],
  ],
  "除构造函数本身外 O(1) 额外对象；只覆盖题目限定的普通函数。",
  [
    "原型不是对象时回退到 Object.prototype。",
    "null 不能视作替代实例的对象。",
    "显式返回函数也会覆盖默认实例。",
  ],
);
add(
  "instanceof",
  "js-instanceof",
  "限定契约的原型链判断",
  "实现 instanceOfSimple(value,Ctor)，仅支持普通函数且 prototype 为非 null 对象，不处理 Symbol.hasInstance 和 bound function。非法 Ctor/prototype 抛 TypeError；原始 value 返回 false。",
  "function instanceOfSimple(value, Ctor)",
  `function instanceOfSimple(value,Ctor) {
  if(typeof Ctor!=='function'||Ctor.prototype===null||!['object','function'].includes(typeof Ctor.prototype))throw new TypeError('Ctor');
  if(value===null||!['object','function'].includes(typeof value))return false;
  let proto=Object.getPrototypeOf(value);
  while(proto){if(proto===Ctor.prototype)return true;proto=Object.getPrototypeOf(proto)}
  return false;
}`,
  [
    [
      "原型继承",
      "function A(){}function B(){}B.prototype=Object.create(A.prototype);const b=new B();assert(fn(b,A)&&fn(b,B));",
    ],
    [
      "原始值",
      'assert(!fn(null,Object));assert(!fn(1,Number));assert(!fn("a",String));',
    ],
    ["无原型对象", "assert(!fn(Object.create(null),Object));"],
    [
      "非法右值",
      "let a=false,b=false;try{fn({}, {})}catch(e){a=e instanceof TypeError}function C(){}C.prototype=null;try{fn({},C)}catch(e){b=e instanceof TypeError}assert(a&&b);",
    ],
  ],
  "时间 O(原型链高度)，额外空间 O(1)。",
  [
    "先校验右值，再判断左值是否对象。",
    "从 value 的原型开始，不包括 value 自身。",
    "不能比较 constructor 字符串。",
  ],
);
add(
  "throttle",
  "js-throttle",
  "首缘加尾缘节流",
  "实现 throttle(fn,wait)，首个调用立即执行；窗口内多次调用仅在窗口结束后用最新参数和 this 再执行一次。持续调用后最多每 wait 执行一次。返回包装函数具有 cancel()，取消后视作新周期。本题使用实际计时器，测试留有容差。",
  "function throttle(fn, wait)",
  `function throttle(fn,wait) {
  let last=0,timer=null,args,context;
  function execute(){last=Date.now();timer=null;const a=args,c=context;args=context=undefined;fn.apply(c,a)}
  function wrapped(...next){args=next;context=this;const remaining=wait-(Date.now()-last);if(!last||remaining<=0){if(timer)clearTimeout(timer);execute()}else if(!timer)timer=setTimeout(execute,remaining)}
  wrapped.cancel=()=>{if(timer)clearTimeout(timer);timer=null;last=0;args=context=undefined};
  return wrapped;
}`,
  [
    [
      "首缘立即执行",
      "let n=0;const f=fn(()=>n++,40);f();assert(n===1);f.cancel();",
    ],
    [
      "尾缘最新参数",
      "const a=[];const f=fn(x=>a.push(x),40);f(1);f(2);f(3);await delay(85);equal(a,[1,3]);",
    ],
    [
      "保留 this",
      "const a=[],obj={x:4,f:fn(function(n){a.push(this.x+n)},35)};obj.f(1);obj.f(2);await delay(75);equal(a,[5,6]);",
    ],
    [
      "cancel 取消并允许立即新周期",
      "const a=[],f=fn(x=>a.push(x),40);f(1);f(2);f.cancel();await delay(75);equal(a,[1]);f(3);equal(a,[1,3]);f.cancel();",
    ],
  ],
  "每次调用 O(1)，保留一个尾部任务。真实产品应进一步明确时钟与选项语义。",
  [
    "保存最近执行时间与尾部计时器。",
    "窗口内只创建一个计时器，但持续替换最近参数。",
    "先更新内部状态再调用目标，避免目标抛错锁住状态。",
  ],
);
add(
  "kmp",
  "algo-kmp",
  "KMP 第一次匹配位置",
  "实现 findSubstring(text,pattern)，返回第一次匹配的 UTF-16 码元索引，无匹配为 -1，空模式为 0。不要调用 indexOf/includes/match/正则来完成匹配，时间 O(n+m)。",
  "function findSubstring(text, pattern)",
  `function findSubstring(text,pattern) {
  if(!pattern.length)return 0;
  const pi=new Array(pattern.length).fill(0);
  for(let i=1,j=0;i<pattern.length;i++){while(j>0&&pattern[i]!==pattern[j])j=pi[j-1];if(pattern[i]===pattern[j])j++;pi[i]=j}
  for(let i=0,j=0;i<text.length;i++){while(j>0&&text[i]!==pattern[j])j=pi[j-1];if(text[i]===pattern[j])j++;if(j===pattern.length)return i-j+1}
  return -1;
}`,
  [
    [
      "空与无解",
      'equal(fn("abc",""),0);equal(fn("","a"),-1);equal(fn("abc","d"),-1);',
    ],
    ["典型前后缀", 'equal(fn("abababcababaca","ababaca"),7);'],
    ["重复字符", 'equal(fn("aaaaaaab","aaab"),4);'],
    ["UTF16 索引", 'equal(fn("😀abc","abc"),2);'],
    [
      "大规模重复",
      'equal(fn("a".repeat(100000)+"b","a".repeat(1000)+"b"),99000);',
    ],
  ],
  "时间 O(n+m)，前缀表空间 O(m)。",
  [
    "pi 存最长相等真前后缀长度。",
    "失配不断 j=pi[j-1]，文本指针不回退。",
    "命中时返回 i-pattern.length+1。",
  ],
);
add(
  "all-settled",
  "js-promise-combinators",
  "实现 allSettled",
  "实现 allSettledLike(iterable)，接受普通值、Promise 和 thenable，等所有项目结束后按输入顺序返回 {status,value} 或 {status,reason}。不能使用原生 allSettled；本题允许 Promise.all。",
  "function allSettledLike(iterable)",
  `function allSettledLike(iterable) {
  return Promise.all(Array.from(iterable,value=>Promise.resolve(value).then(
    value=>({status:'fulfilled',value}),
    reason=>({status:'rejected',reason})
  )));
}`,
  [
    ["空", "equal(await fn([]),[]);"],
    [
      "混合与顺序",
      'const r=await fn([delay(15).then(()=>1),Promise.reject("e"),3]);equal(r,[{status:"fulfilled",value:1},{status:"rejected",reason:"e"},{status:"fulfilled",value:3}]);',
    ],
    [
      "thenable 拒绝",
      'equal(await fn([{then(resolve,reject){reject("x")}}]),[{status:"rejected",reason:"x"}]);',
    ],
    [
      "迭代输入",
      'equal(await fn(new Set([1,2])),[{status:"fulfilled",value:1},{status:"fulfilled",value:2}]);',
    ],
  ],
  "时间 O(n)，空间 O(n)。",
  [
    "将每项拒绝转换成成功的状态记录。",
    "Promise.resolve 同化普通值和 thenable。",
    "聚合后的 all 不再因单项业务拒绝而快速失败。",
  ],
);
add(
  "promise-lite",
  "js-promise-handwrite",
  "教学 Promise：状态与异步 then",
  "实现 createDeferred()，返回 {promise,resolve,reject}。promise.then(onFulfilled,onRejected) 返回原生 Promise；回调必须异步，状态只能变化一次，支持等待前后订阅与透传。本题 resolve 只接普通非 thenable 值，不要求实现完整 Promise/A+，不能用原生 Promise 直接保存 deferred 状态。",
  "function createDeferred()",
  `function createDeferred() {
  let state='pending',value,list=[];
  function flush(){if(state==='pending')return;const tasks=list;list=[];for(const run of tasks)queueMicrotask(run)}
  function settle(next,x){if(state!=='pending')return;state=next;value=x;flush()}
  const promise={then(onFulfilled,onRejected){return new Promise((resolve,reject)=>{list.push(()=>{const cb=state==='fulfilled'?onFulfilled:onRejected;if(typeof cb!=='function'){(state==='fulfilled'?resolve:reject)(value);return}try{resolve(cb(value))}catch(e){reject(e)}});flush()})}};
  return {promise,resolve:x=>settle('fulfilled',x),reject:e=>settle('rejected',e)};
}`,
  [
    [
      "先订阅与异步",
      "const d=fn(),order=[];const p=d.promise.then(x=>{order.push(x);return x+1});d.resolve(2);order.push(1);equal(order,[1]);equal(await p,3);equal(order,[1,2]);",
    ],
    [
      "状态不可逆",
      "const d=fn();d.resolve(1);d.reject(2);d.resolve(3);equal(await d.promise.then(x=>x),1);",
    ],
    [
      "后订阅与透传",
      "const d=fn();d.resolve(4);equal(await d.promise.then(),4);",
    ],
    [
      "拒绝及恢复",
      'const d=fn();d.reject("x");equal(await d.promise.then(undefined,e=>e+"!"),"x!");',
    ],
    [
      "回调异常",
      'const d=fn();d.resolve(1);let e;try{await d.promise.then(()=>{throw "bad"})}catch(x){e=x}equal(e,"bad");',
    ],
  ],
  "监听数量为 n 时派发 O(n)，保存待执行回调 O(n)。此实验故意不覆盖 resolve thenable 同化。",
  [
    "先独立维护状态、值和回调队列。",
    "then 返回原生 Promise 用于链接，但当前 deferred 的状态由你维护。",
    "flush 时复制队列并清空，用 queueMicrotask 异步执行。",
  ],
);
