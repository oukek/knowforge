import { fill } from "../examples/helpers.mjs";

fill(
  "llm-context-engineering",
  "实现 chooseContext(items, budget)。items 含 id、tokens、required、priority，tokens 是非负整数。先保留必要项，再按 priority 降序、同分保持原顺序选择能放入的可选项；必要项超预算抛 Error。返回选中 ID 数组，不修改输入。",
  "function chooseContext(items, budget) {\n  // 显式处理必要项超预算\n}",
  `function chooseContext(items, budget) {
    const required=items.filter(x=>x.required);
    let used=required.reduce((n,x)=>n+x.tokens,0);
    if(used>budget) throw Error('required exceeds budget');
    const ids=required.map(x=>x.id);
    const optional=items.filter(x=>!x.required).sort((a,b)=>b.priority-a.priority);
    for(const x of optional) if(used+x.tokens<=budget) {ids.push(x.id);used+=x.tokens;}
    return ids;
  }`,
  "function chooseContext(items, budget)",
  [
    [
      "必留、优先级及不修改输入",
      `const items=[{id:'low',tokens:2,priority:1},{id:'must',tokens:3,required:true},{id:'high',tokens:4,priority:9}];const before=JSON.stringify(items);equal(fn(items,7),['must','high']);equal(JSON.stringify(items),before);`,
    ],
    [
      "放不下的可选项跳过，同分稳定",
      `equal(fn([{id:'a',tokens:5,priority:9},{id:'b',tokens:2,priority:2},{id:'c',tokens:2,priority:2}],4),['b','c']);`,
    ],
    [
      "必要项超出抛错",
      `let thrown=false;try{fn([{id:'x',tokens:3,required:true}],2)}catch{thrown=true}assert(thrown);`,
    ],
    [
      "零预算和空集",
      `equal(fn([],0),[]);equal(fn([{id:'z',tokens:0,required:true}],0),['z']);`,
    ],
  ],
  "预算选择是明确的贪心策略，不是最大信息量背包最优解。真实 tokenizer 与权限过滤应在进入此函数前完成。",
  "先算 required 总量并检查，再复制可选项排序，不能直接对原数组 sort。",
);

fill(
  "llm-rag-diagnostics",
  "实现 recall_at_k(relevant, ranked, k)。relevant 是相关 ID 集合，ranked 是排名列表，k 是非负整数。前 k 个位置的重复 ID 只计一次命中，无相关文档返回 None。",
  "def recall_at_k(relevant, ranked, k):\n    pass",
  `def recall_at_k(relevant, ranked, k):
    if not relevant:
        return None
    return len(set(ranked[:k]) & relevant) / len(relevant)`,
  "def recall_at_k(relevant, ranked, k)",
  [
    ["重复不刷分", "assert recall_at_k({'a','b'},['a','a','b'],2)==0.5"],
    [
      "k 边界",
      "assert recall_at_k({'a'},['a'],0)==0; assert recall_at_k({'a'},['a'],10)==1",
    ],
    [
      "无正例与未命中",
      "assert recall_at_k(set(),['a'],1) is None; assert recall_at_k({'b'},['a'],1)==0",
    ],
  ],
  "先按位置截取再去重。先去重再取 k 会扩大实际检索窗口；无正例时单独评价拒答，不把 Recall 伪设为 1。",
  "集合交集计算唯一命中，分母是完整 relevant 的大小。",
);

fill(
  "llm-output-contracts",
  "实现 validRefund(data, maxCents)。data 必须是非空普通数据对象（不为数组），且仅有 schemaVersion 和 amountCents 两字段，版本为 1，金额为非负安全整数且 <= maxCents。返回布尔值，不隐式转换类型。",
  "function validRefund(data, maxCents) {\n  // 结构与简化业务约束\n}",
  `function validRefund(data, maxCents) {
    return Boolean(data && typeof data==='object' && !Array.isArray(data)
      && Object.keys(data).sort().join(',')==='amountCents,schemaVersion'
      && data.schemaVersion===1 && Number.isSafeInteger(data.amountCents)
      && data.amountCents>=0 && data.amountCents<=maxCents);
  }`,
  "function validRefund(data, maxCents)",
  [
    [
      "合法及边界",
      `assert(fn({schemaVersion:1,amountCents:0},0));assert(fn({schemaVersion:1,amountCents:500},500));equal(fn({schemaVersion:1,amountCents:501},500),false);`,
    ],
    [
      "拒绝隐式类型转换",
      `for(const v of ['500',true,null,NaN,Infinity,1.5,-1,Number.MAX_SAFE_INTEGER+1])equal(fn({schemaVersion:1,amountCents:v},500),false);`,
    ],
    [
      "拒绝额外字段及版本",
      `equal(fn({schemaVersion:1,amountCents:1,approved:true},10),false);equal(fn({schemaVersion:2,amountCents:1},10),false);`,
    ],
    [
      "空值和非对象",
      `for(const v of [null,undefined,[],1,'x',{}])equal(fn(v,10),false);`,
    ],
  ],
  "这里只校验简化金额契约。授权、订单剩余额度与并发版本需要在真实业务提交中再次校验。",
  "Number.isSafeInteger 不会像 Number() 那样接受字符串或布尔值。",
);

fill(
  "agent-tool-scheduler",
  "实现 readyIds(jobs, succeeded, limit)。jobs 的 id 唯一，deps 均为已知 ID；succeeded 是已成功 ID 数组。返回未完成且所有依赖已成功的前 limit 个 ID，保持 jobs 顺序。limit 为 0 返回 []。不修改输入。",
  "function readyIds(jobs, succeeded, limit) {\n  // 依赖成功才能调度\n}",
  `function readyIds(jobs, succeeded, limit) {
    const done=new Set(succeeded);
    return jobs.filter(j=>!done.has(j.id)&&j.deps.every(d=>done.has(d))).slice(0,limit).map(j=>j.id);
  }`,
  "function readyIds(jobs, succeeded, limit)",
  [
    [
      "所有依赖都要成功",
      `equal(fn([{id:'a',deps:[]},{id:'b',deps:['a']},{id:'c',deps:['a','b']}],['a'],3),['b']);`,
    ],
    [
      "有界及稳定顺序",
      `const j=[{id:'b',deps:[]},{id:'a',deps:[]},{id:'c',deps:[]}];equal(fn(j,[],2),['b','a']);equal(j.map(x=>x.id),['b','a','c']);`,
    ],
    [
      "零上限、已全部完成和环",
      `equal(fn([{id:'a',deps:[]}],[],0),[]);equal(fn([{id:'a',deps:[]}],['a'],1),[]);equal(fn([{id:'a',deps:['b']},{id:'b',deps:['a']}],[],2),[]);`,
    ],
  ],
  "就绪选择函数不负责图验证、运行槽位或环诊断。调度器发现未完成且无运行/就绪节点时，应额外报告无进展。",
  "先排除 succeeded，再对 deps 使用 every，最后截取上限。",
);

fill(
  "agent-memory-lifecycle",
  "实现 active_values(records, tenant, key, now)。只返回同租户同 key、confirmed 为 True、revoked 为 False 且 now < expires_at 的 value，去重后按字符串升序。value 都是字符串，输入字段完整，不修改输入。",
  "def active_values(records, tenant, key, now):\n    pass",
  `def active_values(records, tenant, key, now):
    return sorted({r['value'] for r in records if r['tenant']==tenant and r['key']==key
        and r['confirmed'] is True and r['revoked'] is False and now<r['expires_at']})`,
  "def active_values(records, tenant, key, now)",
  [
    [
      "同值去重及冲突保留",
      "b=dict(tenant='a',key='k',confirmed=True,revoked=False,expires_at=10); r=[dict(b,value='z'),dict(b,value='a'),dict(b,value='z')]; assert active_values(r,'a','k',9)==['a','z']; assert len(r)==3",
    ],
    [
      "授权、确认与撤回",
      "b=dict(tenant='a',key='k',value='v',confirmed=True,revoked=False,expires_at=10); r=[dict(b,tenant='b'),dict(b,key='other'),dict(b,confirmed=False),dict(b,revoked=True)]; assert active_values(r,'a','k',1)==[]",
    ],
    [
      "到期边界与空集",
      "b=dict(tenant='a',key='k',value='v',confirmed=True,revoked=False,expires_at=10); assert active_values([b],'a','k',10)==[]; assert active_values([],'a','k',0)==[]",
    ],
  ],
  "结果有多个值就意味着仍需冲突处理。仅过滤活动事实不能自行决定哪个值是真的。",
  "条件完整过滤后用集合去重，再 sorted；不要使用最后写入覆盖。",
);

fill(
  "ai-stream-consistency",
  "实现 classifyEvent(state, event)。含 generation、seq，state 还含 status。先判断不同 generation 返回 stale；同运行 seq<=state.seq 返回 duplicate；seq>state.seq+1 返回 gap；非 running 状态返回 terminal；否则返回 apply。这只分类，不核验重复内容。",
  "function classifyEvent(state, event) {\n  // 顺序就是本题约定\n}",
  `function classifyEvent(state, event) {
    if(event.generation!==state.generation)return 'stale';
    if(event.seq<=state.seq)return 'duplicate';
    if(event.seq>state.seq+1)return 'gap';
    if(state.status!=='running')return 'terminal';
    return 'apply';
  }`,
  "function classifyEvent(state, event)",
  [
    [
      "旧运行优先拒绝",
      `equal(fn({generation:'b',seq:0,status:'running'},{generation:'a',seq:1}),'stale');`,
    ],
    [
      "重投递与缺口",
      `const s={generation:'a',seq:2,status:'running'};equal(fn(s,{generation:'a',seq:2}),'duplicate');equal(fn(s,{generation:'a',seq:4}),'gap');`,
    ],
    [
      "终态与合法下一条",
      `equal(fn({generation:'a',seq:2,status:'done'},{generation:'a',seq:3}),'terminal');equal(fn({generation:'a',seq:2,status:'running'},{generation:'a',seq:3}),'apply');`,
    ],
    [
      "不修改输入",
      `const s={generation:'a',seq:2,status:'running'},e={generation:'a',seq:3};fn(s,e);equal(s.seq,2);equal(e.seq,3);`,
    ],
  ],
  "分类器将重复事件交给下一层指纹检查，相同序号不同内容应报告冲突。真实恢复还需日志或快照。",
  "先隔离运行身份，再处理序号，最后看终态。",
);

fill(
  "fde-ai-rollout",
  "实现 release_decision(metrics)。字段 samples、success_rate、unauthorized、duplicates 完整。任何违规先返回 rollback；samples<100 返回 hold；成功率<0.9 返回 rollback；其余 expand。数字是本题约定。",
  "def release_decision(metrics):\n    pass",
  `def release_decision(metrics):
    if metrics['unauthorized'] or metrics['duplicates']:
        return 'rollback'
    if metrics['samples']<100:
        return 'hold'
    return 'rollback' if metrics['success_rate']<0.9 else 'expand'`,
  "def release_decision(metrics)",
  [
    [
      "少样本也不能忽略违规",
      "b=dict(samples=1,success_rate=1,unauthorized=0,duplicates=0); assert release_decision(dict(b,unauthorized=1))=='rollback'; assert release_decision(dict(b,duplicates=1))=='rollback'",
    ],
    [
      "样本边界",
      "b=dict(samples=99,success_rate=1,unauthorized=0,duplicates=0); assert release_decision(b)=='hold'; assert release_decision(dict(b,samples=100))=='expand'",
    ],
    [
      "成功率边界",
      "b=dict(samples=100,success_rate=0.9,unauthorized=0,duplicates=0); assert release_decision(b)=='expand'; assert release_decision(dict(b,success_rate=0.89))=='rollback'",
    ],
  ],
  "硬性违规不能被平均成功率抵消，最少样本量也不能成为继续容忍已发生越权的理由。",
  "把违规检查放在样本量检查之前。",
);

fill(
  "fde-ai-capstone",
  "实现 sameIntent(a,b)。两个完整动作含 tenant、orderId、amountCents、currency、expectedVersion、operationId。前五项严格相等才表示相同业务内容；operationId 不参与内容比较，不能隐式转换金额类型。",
  "function sameIntent(a, b) {\n  // 确认绑定具体业务内容\n}",
  `function sameIntent(a,b) {
    return ['tenant','orderId','amountCents','currency','expectedVersion'].every(k=>a[k]===b[k]);
  }`,
  "function sameIntent(a, b)",
  [
    [
      "不同传输身份但内容相同",
      `const a={tenant:'a',orderId:'o',amountCents:10,currency:'CNY',expectedVersion:1,operationId:'x'};assert(fn(a,{...a,operationId:'y'}));`,
    ],
    [
      "任何业务字段变化都失败",
      `const a={tenant:'a',orderId:'o',amountCents:10,currency:'CNY',expectedVersion:1};for(const [k,v] of [['tenant','b'],['orderId','p'],['amountCents',11],['currency','USD'],['expectedVersion',2]])equal(fn(a,{...a,[k]:v}),false);`,
    ],
    [
      "拒绝金额隐式转换",
      `const a={tenant:'a',orderId:'o',amountCents:10,currency:'CNY',expectedVersion:1};equal(fn(a,{...a,amountCents:'10'}),false);assert(fn(a,{...a}));`,
    ],
  ],
  "内容相同不表示可以任意生成新幂等键；传输重试必须复用同一操作身份。此函数只定义内容比较，不完成授权、确认消费和提交。",
  "显式列出业务字段逐项比较，避免 JSON 键顺序影响语义。",
);
