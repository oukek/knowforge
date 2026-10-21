import { fill, fills } from "./helpers.mjs";
function quick(id, name, params, body, cases, prompt, explanation, hint) {
  fill(
    id,
    prompt,
    `function ${name}(${params}) {\n  // TODO：按题目要求补全，不修改函数名\n  return undefined;\n}`,
    `function ${name}(${params}) {\n  ${body}\n}`,
    `function ${name}(${params})`,
    cases.map(([args, expected, label], i) => [
      label || "验证 " + (i + 1),
      `equal(await fn(...${JSON.stringify(args)}), ${JSON.stringify(expected)});`,
    ]),
    explanation,
    hint,
  );
}
quick(
  "js-scope",
  "capture",
  "",
  `const callbacks=[];for(let i=0;i<3;i++)callbacks.push(()=>i);return callbacks.map(fn=>fn());`,
  [[[], [0, 1, 2], "逐轮独立绑定"]],
  "补全 capture，返回三个闭包各自读出的循环值 [0,1,2]，不能直接返回这个数组字面量。",
  "let 每轮创建绑定，闭包之后执行仍读取对应那轮 i；var 在同一函数作用域共享绑定。",
  "先收集三个函数，循环结束后再调用它们。",
);
quick(
  "js-this",
  "readWith",
  "object",
  `return Reflect.apply(function(){return this.name;},object,[]);`,
  [
    [[{ name: "Ada" }], "Ada"],
    [[{ name: "Lin" }], "Lin"],
  ],
  "通过 Reflect.apply 调用普通函数，从传入对象的 this.name 返回名字。",
  "目标是普通函数，Reflect.apply 传入明确接收者；箭头函数不能这样重新绑定 this。",
  "Reflect.apply 的三个参数依次为函数、thisArg、参数数组。",
);
quick(
  "js-prototype",
  "isDirectPrototype",
  "value, prototype",
  `return Object.getPrototypeOf(value) === prototype;`,
  [
    [[{}, null], false],
    [[[], null], false],
  ],
  "补全直接原型比较，使用引用判断，不比较 constructor 名称。此题传入对象与待比较原型。",
  "Object.getPrototypeOf 读取内部原型；相同名字或内容不表示同一个原型对象。",
  "比较 Object.getPrototypeOf 的结果与 prototype。",
);
quick(
  "js-closure",
  "counterSequence",
  "start",
  `let count=start;const next=()=>++count;return [next(),next()];`,
  [
    [[0], [1, 2]],
    [[5], [6, 7]],
  ],
  "用闭包建立计数器，并连续调用两次返回两个结果。",
  "闭包持有同一 count 绑定，后一次调用基于前一次变化；每次外层调用又有自己的环境。",
  "在函数内部声明局部 count，然后创建 next。",
);
quick(
  "js-promise",
  "recover",
  "number",
  `return Promise.resolve(number).then(value=>{if(value<0)throw new Error('negative');return value*2;}).catch(()=>0);`,
  [
    [[2], 4],
    [[-1], 0],
    [[0], 0],
  ],
  "返回 Promise：非负数翻倍；负数在 then 中抛错，再由 catch 恢复成 0。",
  "抛错拒绝 then 返回的 Promise，catch 返回值让后续恢复成功。不能只捕获同步调用栈。",
  "把判断放 then，catch 返回 0。",
);
quick(
  "js-promise-combinators",
  "collectStatuses",
  "values",
  `return Promise.allSettled(values.map(value=>value<0?Promise.reject(value):Promise.resolve(value))).then(results=>results.map(item=>item.status));`,
  [
    [[[1, -1, 2]], ["fulfilled", "rejected", "fulfilled"]],
    [[[]], []],
  ],
  "非负输入模拟成功，负数模拟拒绝。等待全部结束后按输入顺序返回 status 数组。",
  "allSettled 收集各项状态，不因单项拒绝快速失败；映射输出顺序保持输入顺序。",
  "每个值变成成功或拒绝的 Promise，再用 allSettled。",
);
quick(
  "js-concurrency",
  "workerCount",
  "tasks, limit",
  `if(!Number.isInteger(limit)||limit<1)throw new RangeError('limit');return Math.min(tasks.length,limit);`,
  [
    [[[1, 2, 3], 2], 2],
    [[[], 3], 0],
    [[[1], 5], 1],
  ],
  "只补全调度器启动的 worker 数量：非空任务不超过并发上限，空任务为 0；limit 已约定为正整数。",
  "不需要为少量任务创建多余 worker，空输入应直接完成；真正的调度还要在槽位内调用任务函数。",
  "取任务数量与 limit 的较小值。",
);
quick(
  "js-clone",
  "copyOneLevel",
  "source",
  `return {...source};`,
  [
    [[{ a: 1 }], { a: 1 }],
    [[{ a: 1, b: 2 }], { a: 1, b: 2 }],
  ],
  "用展开语法返回普通对象的浅副本，不修改源对象。这里仅检查值，继续在示例区验证嵌套引用是否共享。",
  "浅副本只复制一层，内部对象仍共享引用。通过这些简单用例并不代表完成深拷贝。",
  "返回 {...source}，再自行添加嵌套对象实验。",
);
quick(
  "js-array-version",
  "unique",
  "values",
  `return [...new Set(values)];`,
  [
    [[[1, 1, 2, 2]], [1, 2]],
    [[[]], []],
    [[["A", "B", "A"]], ["A", "B"]],
  ],
  "按出现顺序去重基本值，使用 Set。",
  "Set 保持插入顺序，按 SameValueZero 判断相等；对象按引用区分，不按字段深比较。",
  "把数组放进 Set，再展开成数组。",
);
quick(
  "js-invoke",
  "invokeSum",
  "object, values",
  `return Reflect.apply(function(a,b){return this.base+a+b;},object,values);`,
  [
    [[{ base: 1 }, [2, 3]], 6],
    [[{ base: 5 }, [0, 2]], 7],
  ],
  "借 Reflect.apply 调用以 this.base 为基数的加法函数，两个参数从 values 数组传入。",
  "apply 风格将参数作为数组传递，接收对象不用增加临时属性。",
  "函数使用普通 function；箭头会捕获外层 this。",
);
quick(
  "js-new",
  "buildObject",
  "name",
  `function Item(value){this.name=value;}return Reflect.construct(Item,[name]).name;`,
  [
    [["Ada"], "Ada"],
    [["B"], "B"],
  ],
  "用 Reflect.construct 构造一个 Item，并返回实例 name。",
  "构造调用创建实例并设置原型；Reflect.construct 支持真正的内部构造过程。",
  "给 Reflect.construct 传构造器与参数数组。",
);
quick(
  "js-throttle",
  "remainingWait",
  "last, now, wait",
  `return Math.max(0,wait-(now-last));`,
  [
    [[100, 110, 30], 20],
    [[100, 150, 30], 0],
    [[100, 100, 30], 30],
  ],
  "计算当前节流窗口还要等待的时间，已过窗口返回 0。题目假定时钟不回拨。",
  "负等待应夹到 0；真实节流还要保存尾部参数、this、计时器与取消状态。",
  "wait 减去已过去的时间，再与 0 取最大。",
);
quick(
  "net-cache",
  "cacheDecision",
  "age, maxAge, noCache",
  `return noCache||age>=maxAge?'validate':'reuse';`,
  [
    [[10, 60, false], "reuse"],
    [[60, 60, false], "validate"],
    [[10, 60, true], "validate"],
  ],
  "简化缓存决策：未过期且没有 no-cache 时 reuse，否则 validate。",
  "no-cache 要求复用前验证，并非不存储；达到 max-age 边界已不新鲜。模型不覆盖全部 HTTP 缓存规范。",
  "先判断 noCache 或 age >= maxAge。",
);
quick(
  "net-cors",
  "sameOrigin",
  "left, right",
  `return new URL(left).origin===new URL(right).origin;`,
  [
    [["https://a.com/x", "https://a.com/y"], true],
    [["https://a.com", "http://a.com"], false],
    [["https://a.com", "https://a.com:8443"], false],
  ],
  "使用 URL.origin 判断两个地址是否同源。输入保证是合法绝对 URL。",
  "origin 包含协议、主机与有效端口，不包含路径。CORS 是跨源读取授权，和是否同源是不同问题。",
  "new URL(url).origin。",
);
quick(
  "net-websocket",
  "mergeMessages",
  "messages",
  `return [...new Map(messages.map(item=>[item.id,item])).values()].sort((a,b)=>a.seq-b.seq).map(item=>item.id);`,
  [
    [
      [
        [
          { id: "B", seq: 2 },
          { id: "A", seq: 1 },
          { id: "B", seq: 2 },
        ],
      ],
      ["A", "B"],
    ],
    [[[]], []],
  ],
  "按消息 ID 去重，再按 seq 排序，返回 ID 数组。此题同一 ID 的记录完全一致。",
  "ID 去重与序号排序分别解决重复与有序；不等于已经实现重连恢复与消息交付。",
  "Map 以 id 为键，values 转数组后按 seq 排序。",
);
quick(
  "net-tls",
  "hostMatches",
  "expected, actual",
  `return expected===actual;`,
  [
    [["example.com", "example.com"], true],
    [["example.com", "evil.com"], false],
  ],
  "在这个精确主机名模型中，只有两个规范化主机名完全一致才接受；不实现通配符或证书链。",
  "主机名匹配只是实际 TLS 验证的一个条件，不可用此函数替代证书库。",
  "本题输入已规范化，只比较完全相等。",
);
quick(
  "net-storage",
  "storageKey",
  "userId, version",
  `return 'draft:v'+version+':'+userId;`,
  [
    [["A", 2], "draft:v2:A"],
    [["B", 3], "draft:v3:B"],
  ],
  "构造同时包含用户和格式版本的草稿缓存键。",
  "键隔离能减少串用，但不证明身份可信，也不能替代退出清理、加密或服务端授权。",
  "按 draft:v版本:用户 拼接。",
);
quick(
  "css-box-bfc",
  "outerWidth",
  "width, padding, border, sizing",
  `return sizing==='border-box'?width:width+2*padding+2*border;`,
  [
    [[100, 10, 1, "content-box"], 122],
    [[100, 10, 1, "border-box"], 100],
    [[80, 0, 0, "content-box"], 80],
  ],
  "补全盒模型总宽度的算术模型，padding/border 表示每一侧数值。",
  "左右两侧都计入 content-box 总宽度；border-box 的 width 已包括这些部分，实际布局仍需浏览器。",
  "content-box 加两次 padding 和两次 border。",
);
quick(
  "css-mobile",
  "rpxToPx",
  "rpx, viewport",
  `return rpx*viewport/750;`,
  [
    [[100, 375], 50],
    [[750, 390], 390],
    [[0, 375], 0],
  ],
  "把按 750 设计宽度定义的 rpx 换算为当前视口的 CSS 像素。",
  "rpx 换算只处理布局尺度，字号、缩放、DPR 与安全区域仍需单独考虑。",
  "rpx × viewport / 750。",
);
quick(
  "css-center",
  "safeOffset",
  "container, content",
  `return Math.max(0,(container-content)/2);`,
  [
    [[300, 100], 100],
    [[300, 500], 0],
    [[200, 200], 0],
  ],
  "几何居中但不返回负顶部偏移，超高内容顶部对齐；仅为模型计算。",
  "真实居中弹窗还要处理 max-height、overflow、焦点和软键盘，数值函数不渲染 CSS。",
  "差值一半，再夹到非负范围。",
);
quick(
  "mini-setdata",
  "applyPatch",
  "data, patch",
  `return {...data,...patch};`,
  [
    [[{ count: 0, title: "A" }, { count: 2 }], { count: 2, title: "A" }],
    [[{ x: 1 }, {}], { x: 1 }],
  ],
  "返回合并 patch 后的新对象，保留未更新字段，不改变原对象。只处理一层普通键，不是微信 setData。",
  "展开按后者覆盖同名键，路径更新和异步视图由宿主实现，不能从这个对象合并推导完整 setData 行为。",
  "先展开 data，再展开 patch。",
);
quick(
  "mini-routing",
  "replaceTop",
  "stack, page",
  `return stack.length?[...stack.slice(0,-1),page]:[page];`,
  [
    [
      [["首页", "A"], "B"],
      ["首页", "B"],
    ],
    [[[], "首页"], ["首页"]],
  ],
  "用新数组模拟替换当前页面，不修改输入栈。此题不处理 tabBar 与生命周期。",
  "替换不增加已有栈层数；真实 redirectTo 还受微信路由规则限制。",
  "保留前 length-1 项，再加新页。",
);
quick(
  "mini-login",
  "consumeCode",
  "codes, code",
  `const remaining=new Set(codes);const accepted=remaining.delete(code);return {accepted,remaining:[...remaining]};`,
  [
    [[["A", "B"], "A"], { accepted: true, remaining: ["B"] }],
    [[["B"], "A"], { accepted: false, remaining: ["B"] }],
  ],
  "模拟消费一次性 code，返回是否接受与剩余列表；不修改输入。",
  "一次性凭证不应重放。真实交换必须在服务端，不能用前端 Set 证明平台身份。",
  "Set.delete 同时删除并返回是否原本存在。",
);
quick(
  "mini-privacy",
  "canBrowse",
  "phoneAllowed",
  `return true;`,
  [
    [[false], true],
    [[true], true],
  ],
  "本题场景明确浏览商品不依赖手机号，因此无论手机号是否授权，都允许浏览。",
  "按必要性拆权限，拒绝非必要采集不该阻断无关核心功能。真实支付/履约步骤仍需按业务独立判断。",
  "不要把浏览权限等同手机号授权。",
);
quick(
  "mini-longlist",
  "visibleStart",
  "scrollTop, itemHeight, overscan",
  `return Math.max(0,Math.floor(scrollTop/itemHeight)-overscan);`,
  [
    [[200, 50, 2], 2],
    [[0, 50, 2], 0],
    [[75, 50, 0], 1],
  ],
  "计算定高虚拟列表包含上方 overscan 后的起始索引，不能为负。",
  "floor 定位首个可见项，overscan 扩展窗口。动态高度不能直接用固定除法。",
  "先向下取整，再减 overscan，并夹到 0。",
);
quick(
  "mini-memory",
  "imageBytes",
  "width, height",
  `return width*height*4;`,
  [
    [[100, 100], 40000],
    [[2048, 2048], 16777216],
    [[0, 100], 0],
  ],
  "按 RGBA 每像素四字节估算解码字节数。",
  "这是像素数据估计，真实宿主纹理、缓存与不同格式有额外差异，不能作为严格内存上限。",
  "宽 × 高 × 4。",
);
quick(
  "mini-request",
  "isHttpSuccess",
  "statusCode",
  `return statusCode>=200&&statusCode<300;`,
  [
    [[200], true],
    [[299], true],
    [[300], false],
    [[503], false],
  ],
  "HTTP 层只接受 2xx；调用层 success 不代表 HTTP 或业务成功。",
  "重定向是否被自动跟随是另一层行为；业务码还要在成功响应中继续检查。",
  "左闭右开：200 ≤ code < 300。",
);
quick(
  "vue-render",
  "stableKeys",
  "items",
  `return items.map(item=>item.id);`,
  [
    [[[{ id: "A" }, { id: "B" }]], ["A", "B"]],
    [[[{ id: "B" }, { id: "A" }]], ["B", "A"]],
  ],
  "返回每项稳定业务 ID，不能用索引或随机数当身份。",
  "重排时 key 仍属于原项目，帮助复用正确状态。模型不运行真实 Vue diff。",
  "map 读取 item.id。",
);
quick(
  "vue-state",
  "createIsolated",
  "start",
  `const make=()=>({count:start});const a=make(),b=make();a.count++;return [a.count,b.count,a===b];`,
  [
    [[0], [1, 0, false]],
    [[5], [6, 5, false]],
  ],
  "每次 make 创建独立对象，修改 a 后返回 a.count、b.count 和身份比较。",
  "局部创建保证实例隔离；共享需求应使用明确 store。SSR 用户状态还需按请求隔离。",
  "让 make 每次返回新的对象字面量。",
);
quick(
  "react-hooks",
  "applyUpdates",
  "initial, updates",
  `return updates.reduce((value,delta)=>value+delta,initial);`,
  [
    [[0, [1, 1]], 2],
    [[5, [-1, 2]], 6],
  ],
  "模拟按前值依次更新：updates 是一组增量，返回最终状态。",
  "函数式更新按前一个待处理值计算，不把所有更新都绑定到初始快照。这里不模拟 React 调度。",
  "reduce 的累积值是上一次更新结果。",
);
quick(
  "eng-tree-shaking",
  "retained",
  "modules",
  `return modules.filter(item=>item.used||item.sideEffect).map(item=>item.name);`,
  [
    [
      [
        [
          { name: "A", used: true, sideEffect: false },
          { name: "B", used: false, sideEffect: true },
          { name: "C", used: false, sideEffect: false },
        ],
      ],
      ["A", "B"],
    ],
  ],
  "保留被使用或有必要副作用的模块名。只是教学决策模型，不是打包器。",
  "误把 CSS/初始化标成无副作用，可能让构建错误删除必要内容。",
  "条件为 used 或 sideEffect。",
);
quick(
  "eng-quality",
  "validUser",
  "input",
  `return Boolean(input)&&typeof input.id==='string'&&Number.isInteger(input.age);`,
  [
    [[{ id: "A", age: 2 }], true],
    [[{ id: "A", age: null }], false],
    [[null], false],
  ],
  "运行时判断用户数据是否含字符串 id 和整数 age；只验证此题声明的字段类型。",
  "TS 类型不会验证真实 JSON；复杂边界宜用 schema，年龄业务范围也需另加约束。",
  "先防 null，再用 typeof 与 Number.isInteger。",
);
quick(
  "eng-hmr",
  "nextVersion",
  "activeVersions, next",
  `return [next];`,
  [
    [[[1, 2], 3], [3]],
    [[[], 1], [1]],
  ],
  "题目模型要求旧版本资源全部清理，仅保留当前版本；返回新的活跃版本数组。",
  "真正 HMR 的 dispose 要释放旧监听和连接，返回数组本身不能清理真实宿主资源。",
  "本题返回只含 next 的数组。",
);
quick(
  "node-buffer",
  "utf8Bytes",
  "text",
  `return new TextEncoder().encode(text).length;`,
  [
    [["你好"], 6],
    [["ABC"], 3],
    [["😀"], 4],
  ],
  "使用 TextEncoder 返回 UTF-8 字节长度，不使用字符串 length 猜字节数。",
  "中文和表情占的 UTF-8 字节数不同，传输切块可能落在字符中间。",
  "encode(text) 后读取 length。",
);
quick(
  "node-api",
  "sameOperation",
  "previous, incoming",
  `return previous.key===incoming.key&&previous.amount===incoming.amount;`,
  [
    [
      [
        { key: "A", amount: 10 },
        { key: "A", amount: 10 },
      ],
      true,
    ],
    [
      [
        { key: "A", amount: 10 },
        { key: "A", amount: 20 },
      ],
      false,
    ],
  ],
  "只有幂等键和业务金额都一致才视作同一请求；这里只验证演示字段。",
  "相同键不同参数是冲突，不可直接返回旧结果。真实服务端还应绑定身份、事务与唯一约束。",
  "两个字段分别比较，再逻辑与。",
);
quick(
  "perf-vitals",
  "p75",
  "values",
  `const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*0.75)-1];`,
  [
    [[[1, 2, 3, 100]], 3],
    [[[9, 1, 3, 7]], 7],
  ],
  "输入非空，按 nearest-rank 定义计算 p75，保持源数组不变。",
  "分位数需要先明确算法、样本与分组；不能用平均数代替。",
  "排序后取 ceil(n×0.75)-1。",
);
quick(
  "perf-weaknetwork",
  "retryable",
  "status",
  `return status===429||status>=500;`,
  [
    [[503], true],
    [[429], true],
    [[403], false],
    [[200], false],
  ],
  "这个教学策略仅允许 429/5xx 重试，其他 HTTP 状态不重试。假定请求本身可幂等重放。",
  "真实重试还需 Retry-After、总预算、幂等、退避抖动和取消；状态码只是一部分资格判断。",
  "429 或 status >= 500。",
);
quick(
  "perf-sdk",
  "deduplicate",
  "events",
  `return [...new Map(events.map(event=>[event.id,event])).values()].map(event=>event.id);`,
  [
    [[[{ id: "A" }, { id: "A" }, { id: "B" }]], ["A", "B"]],
    [[[]], []],
  ],
  "按事件 ID 去重，保留首次出现的 ID 顺序。重复记录内容相同。",
  "至少一次传输需要稳定事件 ID，真实服务端去重要有持久化和保留期。",
  "Map 的 key 用 event.id。",
);
quick(
  "algo-window",
  "uniqueCount",
  "text",
  `return new Set(Array.from(text)).size;`,
  [
    [["abca"], 3],
    [["😀a😀"], 2],
    [[""], 0],
  ],
  "先做一个窗口基础练习：按码点统计字符串不同元素数量；不是最长无重复子串。",
  "Array.from 逐码点遍历，Set 去重。最长连续窗口还要维护左右边界，不能直接用这个总数替代。",
  "Array.from(text) 再放入 Set。",
);
quick(
  "algo-interval",
  "overlapClosed",
  "a, b",
  `return Math.max(a[0],b[0])<=Math.min(a[1],b[1]);`,
  [
    [
      [
        [1, 2],
        [2, 3],
      ],
      true,
    ],
    [
      [
        [1, 2],
        [3, 4],
      ],
      false,
    ],
    [
      [
        [1, 5],
        [2, 3],
      ],
      true,
    ],
  ],
  "判断两个合法闭区间是否相交，端点相接算相交。",
  "共同部分起点不大于终点才有闭区间交集；半开区间通常用严格小于。",
  "较大起点 ≤ 较小终点。",
);
quick(
  "algo-tree",
  "levelValues",
  "root",
  `if(!root)return [];const result=[],queue=[root];let head=0;while(head<queue.length){const end=queue.length,level=[];while(head<end){const node=queue[head++];level.push(node.val);if(node.left)queue.push(node.left);if(node.right)queue.push(node.right);}result.push(level);}return result;`,
  [
    [[{ val: 1, left: { val: 2 }, right: { val: 3 } }], [[1], [2, 3]]],
    [[null], []],
  ],
  "补全小型层序遍历：每层输出一组值，空树返回 []。",
  "每层起点固定队尾，避免把新入队的下一层也当本层。",
  "数组队列加 head 游标，先记 end=queue.length。",
);
quick(
  "algo-stack",
  "bracketPair",
  "left, right",
  `return ({'(':')','[':']','{':'}'})[left]===right;`,
  [
    [["(", ")"], true],
    [["(", "]"], false],
    [["[", "]"], true],
  ],
  "检查一对左右括号类型是否匹配，输入保证左侧是三种左括号之一。",
  "类型匹配是有效括号的基础，全串验证还需要栈和顺序，不是只检查数量。",
  "用左括号到右括号的映射。",
);
quick(
  "design-upload",
  "missingChunks",
  "count, confirmed",
  `const seen=new Set(confirmed);return Array.from({length:count},(_,i)=>i).filter(i=>!seen.has(i));`,
  [
    [
      [5, [0, 2, 4]],
      [1, 3],
    ],
    [[3, [0, 1, 2]], []],
    [[0, []], []],
  ],
  "总片数 count，已确认片序号 confirmed，返回升序缺片号。",
  "只重传缺片能节省网络，但真实协议还需 uploadId、内容校验、权限和幂等合并。",
  "生成 0..count-1，再过滤 Set 中不存在的项。",
);
quick(
  "design-list",
  "prefixHeights",
  "heights",
  `const prefix=[0];for(const height of heights)prefix.push(prefix.at(-1)+height);return prefix;`,
  [
    [[[40, 60, 50]], [0, 40, 100, 150]],
    [[[]], [0]],
  ],
  "输入项目高度，返回包含起点 0 的前缀和数组。",
  "前缀和能将索引映射到偏移；动态高度更新和随机定位还要缓存、二分或其他结构。",
  "每项加到上一个累计值。",
);
quick(
  "project-metrics",
  "improvement",
  "before, after",
  `return (before-after)/before*100;`,
  [
    [[100, 80], 20],
    [[100, 120], -20],
  ],
  "输入正基线，返回耗时下降百分比；变慢时结果为负数。",
  "公式计算不证明优化因果，真实结果要固定口径和条件，不能套示例数字写简历。",
  "(before-after)/before × 100。",
);
quick(
  "ai-multimodal",
  "base64Length",
  "bytes",
  `return 4*Math.ceil(bytes/3);`,
  [
    [[3], 4],
    [[4], 8],
    [[0], 0],
  ],
  "额外练习：估算字节编码为 base64 的字符数，输入非负整数，不包含 data URL 前缀。",
  "base64 有额外体积；字符数量和 JS 字符串内存占用也不同，二进制上传通常更合适。",
  "每三字节一组，每组四字符，不足向上取整。",
);
quick(
  "ai-gateway",
  "withinBudget",
  "used, estimate, limit",
  `return used+estimate<=limit;`,
  [
    [[80, 20, 100], true],
    [[80, 21, 100], false],
    [[0, 0, 0], true],
  ],
  "已使用加本次估算不能超过预算上限；只作确定性额度模型。",
  "真实网关还需要并发原子扣减、实际结算和身份配额，前端检查不是最终边界。",
  "把预估也加入已使用，再与上限比较。",
);
quick(
  "ai-injection",
  "allowedTool",
  "name",
  `return ['readDocument','search'].includes(name);`,
  [
    [["readDocument"], true],
    [["shell"], false],
    [["search"], true],
  ],
  "只接受工具白名单 readDocument/search，不接受模型随意生成的新工具。",
  "白名单只是第一层，还要检查 schema、身份和资源权限；合法工具也可能访问越权资源。",
  "固定列表 includes(name)。",
);
quick(
  "ai-render",
  "shouldFollow",
  "distance, threshold",
  `return distance<=threshold;`,
  [
    [[10, 40], true],
    [[100, 40], false],
    [[40, 40], true],
  ],
  "距离底部不超过阈值才自动跟随；用户远离底部时保留阅读位置。",
  "真实对话界面还要追踪主动滚动、锚点和流式高度变化，避免每个 token 强制滚到底。",
  "边界包含等于阈值。",
);
quick(
  "ai-agent",
  "confirmationMatches",
  "confirmed, operation",
  `return confirmed.id===operation.id&&confirmed.version===operation.version;`,
  [
    [
      [
        { id: "A", version: 1 },
        { id: "A", version: 1 },
      ],
      true,
    ],
    [
      [
        { id: "A", version: 1 },
        { id: "A", version: 2 },
      ],
      false,
    ],
  ],
  "确认绑定 operationId 和最终参数版本，版本变化必须重新确认。",
  "真实确认还要校验最终参数摘要、当前身份与权限，这个模型不提供服务端执行安全保证。",
  "两个字段都要完全一致。",
);
quick(
  "arch-scale",
  "estimatedQps",
  "users, seconds, attempts",
  `return users/seconds*attempts;`,
  [
    [[10000, 10, 1], 1000],
    [[10000, 1, 3], 30000],
  ],
  "估算固定轮询平均 QPS：活跃用户除间隔，再乘平均尝试次数。输入 seconds 为正数。",
  "均值不覆盖突发和重连洪峰，真实容量还要考虑分布、缓存与下游能力。",
  "users / seconds * attempts。",
);
quick(
  "study-plan",
  "fitsDay",
  "tasks, budget",
  `return tasks.reduce((sum,value)=>sum+value,0)<=budget;`,
  [
    [[[8, 8], 16], true],
    [[[8, 8, 8], 16], false],
    [[[], 0], true],
  ],
  "判断演示任务总分钟是否放得进当天剩余预算。",
  "预算不足时应该留待续排，不将全部内容强塞最后一天；真实估时有不确定性。",
  "reduce 求和，再与 budget 比较。",
);

fills.get("js-prototype").tests = [
  {
    name: "匹配直接原型",
    code: "function A(){};const value=new A();assert(fn(value,A.prototype));",
  },
  {
    name: "不是间接祖先判断",
    code: "function A(){};const value=new A();assert(!fn(value,Object.prototype));",
  },
];
fills
  .get("js-clone")
  .tests.push({
    name: "新对象与共享内层引用",
    code: "const child={x:1},source={child};const result=fn(source);assert(result!==source&&result.child===child);",
  });
