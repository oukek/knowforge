import { fill } from "../examples/helpers.mjs";

fill(
  "node-deadline-context",
  "实现 remaining(deadline, now, perCallLimit)：下游预算是总剩余时间与单次上限的较小值，已过期为 0。时间均为毫秒，不能让重试重置总预算。",
  "function remaining(deadline, now, perCallLimit) {\n  // 计算可用预算\n}",
  "function remaining(deadline, now, perCallLimit) {\n  return Math.max(0, Math.min(deadline - now, perCallLimit));\n}",
  "function remaining(deadline, now, perCallLimit)",
  [
    ["排队已经消费预算", "equal(fn(1000, 850, 500), 150);"],
    ["单调用上限", "equal(fn(1000, 100, 200), 200);"],
    [
      "截止和超期均不可启动",
      "equal(fn(1000,1000,50),0); equal(fn(1000,1200,50),0);",
    ],
  ],
  "deadline 是入口确定的绝对截止时刻。计算预算不负责中断 I/O，还需传递 AbortSignal。",
  "先计算 deadline-now，取单次上限，再截断到非负数。",
);

fill(
  "node-queue-leases",
  "实现 mayComplete(job, worker, token, now)。必须是 running、同一 owner、同一 fencing token 且 now < leaseUntil 才能提交。返回布尔值。",
  "function mayComplete(job, worker, token, now) {\n  // 拒绝旧 worker 提交\n}",
  'function mayComplete(job, worker, token, now) {\n  return (\n    job.status === "running" &&\n    job.owner === worker &&\n    job.token === token &&\n    now < job.leaseUntil\n  );\n}',
  "function mayComplete(job, worker, token, now)",
  [
    [
      "当前领取者",
      "assert(fn({status:'running',owner:'a',token:2,leaseUntil:20},'a',2,19));",
    ],
    [
      "旧 token 或过期",
      "const j={status:'running',owner:'a',token:3,leaseUntil:20}; equal(fn(j,'a',2,10),false); equal(fn(j,'a',3,20),false);",
    ],
    [
      "其他 worker 或重复完成",
      "equal(fn({status:'done',owner:'a',token:2,leaseUntil:20},'a',2,10),false); equal(fn({status:'running',owner:'b',token:2,leaseUntil:20},'a',2,10),false);",
    ],
  ],
  "真实数据库要将条件放入同一条 UPDATE 并检查影响行数。先读后写的检查仍有竞态；这里仅验证提交谓词。",
  "owner 识别执行者，token 识别领取代次，两者都需要。",
);

fill(
  "langgraph-state",
  "实现 Python merge_events(old, updates)。事件为含 id 的字典列表，按首次出现顺序合并。相同 ID 内容相同的重投递忽略，不同内容抛 ValueError。不修改输入。",
  "def merge_events(old, updates):\n    pass",
  "def merge_events(old, updates):\n    merged = {}\n    for event in [*old, *updates]:\n        key = event['id']\n        if key in merged and merged[key] != event:\n            raise ValueError('conflicting event')\n        merged[key] = dict(event)\n    return list(merged.values())",
  "def merge_events(old, updates)",
  [
    [
      "重试不重复",
      "assert merge_events([{'id':'a','v':1}], [{'id':'a','v':1}]) == [{'id':'a','v':1}]",
    ],
    [
      "稳定顺序与输入隔离",
      "a=[{'id':'a','v':1}]; r=merge_events(a,[{'id':'b','v':2}]); assert [e['id'] for e in r]==['a','b']; r[0]['v']=9; assert a[0]['v']==1",
    ],
    [
      "冲突不能静默覆盖",
      "try:\n    merge_events([{'id':'a','v':1}],[{'id':'a','v':2}])\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('must reject conflict')",
    ],
  ],
  "列表相加在重试时会重复。稳定 ID 支持幂等合并，同 ID 不同事实必须暴露冲突。此处浅复制一层，嵌套对象仍需不可变策略。",
  "字典保存首次插入位置，先比较冲突，再保存副本。",
);

fill(
  "openai-agents-tools",
  "实现 Python visible_ticket(records, tenant, ticket_id)。records 的键是 (tenant, ticket_id)，tenant 来自服务端认证上下文；未找到返回 None，不得跨租户兜底。",
  "def visible_ticket(records, tenant, ticket_id):\n    pass",
  "def visible_ticket(records, tenant, ticket_id):\n    return records.get((tenant, ticket_id))",
  "def visible_ticket(records, tenant, ticket_id)",
  [
    [
      "同 ID 不同租户",
      "r={('a','7'):'A',('b','7'):'B'}; assert visible_ticket(r,'a','7')=='A'; assert visible_ticket(r,'b','7')=='B'",
    ],
    [
      "猜中其他租户 ID 仍不可读",
      "r={('b','8'):'secret'}; assert visible_ticket(r,'a','8') is None; assert len(r)==1",
    ],
    ["不存在的资源", "assert visible_ticket({},'a','x') is None"],
  ],
  "模型只提供业务 ID，认证 tenant 从服务端注入。schema 形状合法不等于有资源权限；数据库查询也要带 tenant 条件。",
  "查询键必须同时包含 tenant 和 ticket_id。",
);

fill(
  "agent-human-review",
  "实现 Python valid_approval(approval, request, now)。两者都是完整字典：tenant、action_hash、resource_version 相等，approved 为 True、used 为 False，now < expires_at 才返回 True。这只判断快照，真正消费还需原子条件更新。",
  "def valid_approval(approval, request, now):\n    pass",
  "def valid_approval(approval, request, now):\n    return (approval['approved'] is True and approval['used'] is False\n        and now < approval['expires_at']\n        and all(approval[k] == request[k] for k in ('tenant','action_hash','resource_version')))",
  "def valid_approval(approval, request, now)",
  [
    [
      "原动作有效",
      "a={'tenant':'a','action_hash':'h','resource_version':2,'approved':True,'used':False,'expires_at':10}; r={k:a[k] for k in ('tenant','action_hash','resource_version')}; assert valid_approval(a,r,9) is True",
    ],
    [
      "改动作、版本或租户即失效",
      "a={'tenant':'a','action_hash':'h','resource_version':2,'approved':True,'used':False,'expires_at':10}; r={k:a[k] for k in ('tenant','action_hash','resource_version')}; assert all(not valid_approval(a,{**r,k:v},1) for k,v in [('tenant','b'),('action_hash','other'),('resource_version',3)])",
    ],
    [
      "过期、已消费、被拒绝",
      "a={'tenant':'a','action_hash':'h','resource_version':2,'approved':True,'used':False,'expires_at':10}; r={k:a[k] for k in ('tenant','action_hash','resource_version')}; assert not valid_approval(a,r,10); assert not valid_approval({**a,'used':True},r,1); assert not valid_approval({**a,'approved':False},r,1)",
    ],
  ],
  "审批批准的是某一版本的具体动作。只检查 approved 或 approval_id 无法防止修改金额、重复消费和跨租户复用。",
  "身份、动作摘要、版本、决定、消费状态和有效期分别约束。",
);

fill(
  "agent-evaluation",
  "实现 summarize(runs)。每项含 ok、cost、unauthorized、duplicates。返回 successRate、costPerSuccess（无成功时 null）、release。样本非空、成功率>=0.8 且越权和重复副作用均为 0 才能 release。失败成本也计入总成本。",
  "function summarize(runs) {\n  // 统计与发布门槛\n}",
  "function summarize(runs) {\n  const success = runs.filter((r) => r.ok).length;\n  const rate = runs.length ? success / runs.length : 0;\n  return {\n    successRate: rate,\n    costPerSuccess: success\n      ? runs.reduce((n, r) => n + r.cost, 0) / success\n      : null,\n    release:\n      runs.length > 0 &&\n      rate >= 0.8 &&\n      runs.every((r) => r.unauthorized === 0 && r.duplicates === 0),\n  };\n}",
  "function summarize(runs)",
  [
    [
      "失败成本不能省略",
      "equal(fn([{ok:true,cost:2,unauthorized:0,duplicates:0},{ok:false,cost:4,unauthorized:0,duplicates:0}]),{successRate:0.5,costPerSuccess:6,release:false});",
    ],
    [
      "高成功率仍阻断违规",
      "for(const flag of ['unauthorized','duplicates']) {const r={ok:true,cost:1,unauthorized:0,duplicates:0};r[flag]=1;equal(fn([r]).release,false);}",
    ],
    [
      "空集和零成功",
      "equal(fn([]),{successRate:0,costPerSuccess:null,release:false});equal(fn([{ok:false,cost:1,unauthorized:0,duplicates:0}]).costPerSuccess,null);",
    ],
    [
      "满足所有条件",
      "equal(fn([{ok:true,cost:2,unauthorized:0,duplicates:0}]).release,true);",
    ],
  ],
  "0.8 是本题明确约定，不是所有 Agent 的发布标准。安全门槛不能被平均分抵消，无成功时也不能把除数伪设为 1。",
  "统计全部成本，单独计算成功数；安全门槛使用 every。",
);
