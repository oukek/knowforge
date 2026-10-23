import { fill } from "../examples/helpers.mjs";
fill(
  "ai-tokenization-primer",
  "实现 mergePair(tokens,left,right)：从左到右把相邻 left、right 合成 left+right，单次不重叠，不修改原字符串数组。输入片段及规则均为字符串。",
  "function mergePair(tokens, left, right) {\n  // 单轮合并\n}",
  `function mergePair(tokens,left,right) {const out=[];for(let i=0;i<tokens.length;i++){if(tokens[i]===left&&tokens[i+1]===right){out.push(left+right);i++;}else out.push(tokens[i]);}return out;}`,
  "function mergePair(tokens, left, right)",
  [
    ["重复出现", `equal(fn(['l','o','l','o'],'l','o'),['lo','lo']);`],
    ["不重叠", `equal(fn(['a','a','a'],'a','a'),['aa','a']);`],
    [
      "空数组及不修改",
      `const x=['x','l','o'];equal(fn(x,'l','o'),['x','lo']);equal(x,['x','l','o']);equal(fn([],'l','o'),[]);`,
    ],
  ],
  "仅实现给定规则的一轮应用，不学习词表，不等于完整真实 BPE。",
  "匹配后 i 多前进一步，避免同一片段参与两次。",
);
fill(
  "ai-embedding-primer",
  "实现 cosine(a,b)。非空等长数值列表，元素为有限实数；维度不符或任一零向量抛 ValueError。返回余弦相似度，不修改输入。",
  "def cosine(a,b):\n    pass",
  `def cosine(a,b):
    import math
    if not a or len(a)!=len(b): raise ValueError('dimension mismatch')
    na=math.sqrt(sum(x*x for x in a)); nb=math.sqrt(sum(x*x for x in b))
    if not na or not nb: raise ValueError('zero vector')
    return sum(x*y for x,y in zip(a,b))/(na*nb)`,
  "def cosine(a,b)",
  [
    [
      "同向、垂直、反向",
      `assert abs(cosine([1,0],[2,0])-1)<1e-9; assert abs(cosine([1,0],[0,1]))<1e-9; assert abs(cosine([1],[-2])+1)<1e-9`,
    ],
    [
      "维度和零向量",
      `for a,b in [([],[]),([1],[1,2]),([0,0],[1,1])]:\n    try: cosine(a,b)\n    except ValueError: pass\n    else: raise AssertionError('must reject')`,
    ],
    [
      "不修改",
      `a=[3,4]; b=[6,8]; assert abs(cosine(a,b)-1)<1e-9; assert a==[3,4] and b==[6,8]`,
    ],
  ],
  "真实 embedding 比较还需模型空间、归一化与版本一致，函数正确不保证语义检索质量。",
  "点积除以两者二范数乘积，先处理零范数。",
);
fill(
  "ai-training-inference",
  "实现 logistic_step(xs,ys,w,b,rate)：一维二分类样本，xs 和 ys 非空等长，y 为 0/1；计算均值二元交叉熵对应的一次梯度下降，返回 (new_w,new_b)。使用稳定 Sigmoid，长度无效抛 ValueError；不修改输入。",
  "def logistic_step(xs,ys,w,b,rate):\n    pass",
  `def logistic_step(xs,ys,w,b,rate):
    import math
    if not xs or len(xs)!=len(ys): raise ValueError('invalid samples')
    dw=db=0.0
    for x,y in zip(xs,ys):
        z=w*x+b
        if z>=0: p=1/(1+math.exp(-z))
        else:
            ez=math.exp(z); p=ez/(1+ez)
        error=p-y; dw+=error*x; db+=error
    n=len(xs)
    return w-rate*dw/n,b-rate*db/n`,
  "def logistic_step(xs,ys,w,b,rate)",
  [
    [
      "手算一步",
      `w,b=logistic_step([0,2],[0,1],0,0,0.1); assert abs(w-0.05)<1e-9 and abs(b)<1e-9`,
    ],
    [
      "重复批次均值不变",
      `a=logistic_step([0,2],[0,1],0,0,0.1); b=logistic_step([0,2,0,2],[0,1,0,1],0,0,0.1); assert all(abs(x-y)<1e-9 for x,y in zip(a,b))`,
    ],
    [
      "极端 logits 稳定",
      `import math\nw,b=logistic_step([1,-1],[1,0],1000,0,0.1); assert math.isfinite(w) and math.isfinite(b)`,
    ],
    [
      "非法长度",
      `for x,y in [([],[]),([1],[])]:\n    try: logistic_step(x,y,0,0,0.1)\n    except ValueError: pass\n    else: raise AssertionError('must reject')`,
    ],
  ],
  "这是原始逻辑回归考点的标准库教学扩展，不声称复现原笔试的 NumPy 约束和隐藏评分。均值损失梯度也须除样本数。",
  "每样本误差 p-y；dw 累加 error*x，db 累加 error，最后一起除 n。",
);
fill(
  "ai-decoding-primer",
  "实现 nucleusIds(probs,p)。probs 为非空有效概率数组且总和为 1；按概率降序、同分按原索引升序，返回累计首次达到 p 的最小索引前缀。p 必须在 (0,1]，否则抛 Error；不修改输入。",
  "function nucleusIds(probs, p) {\n  // 注意阈值边界\n}",
  `function nucleusIds(probs,p){if(!(p>0&&p<=1))throw Error('invalid p');const ranked=probs.map((prob,id)=>({prob,id})).sort((a,b)=>b.prob-a.prob||a.id-b.id);let sum=0;const ids=[];for(const x of ranked){ids.push(x.id);sum+=x.prob;if(sum>=p)break;}return ids;}`,
  "function nucleusIds(probs, p)",
  [
    [
      "累计阈值",
      `equal(fn([0.6,0.25,0.15],0.8),[0,1]);equal(fn([0.9,0.1],0.8),[0]);`,
    ],
    ["稳定同分与完整概率", `equal(fn([0.25,0.25,0.5],1),[2,0,1]);`],
    ["输入不变", `const a=[0.1,0.9];equal(fn(a,0.5),[1]);equal(a,[0.1,0.9]);`],
    [
      "非法 p",
      `for(const p of [0,-1,2,NaN]){let thrown=false;try{fn([1],p)}catch{thrown=true}assert(thrown);}`,
    ],
  ],
  "函数只选择候选 ID；实际采样还要对保留概率归一化，并按所用服务确认温度与截断顺序。",
  "先生成新对象排序，再累计，达到阈值立即停止。",
);
fill(
  "ai-knowledge-indexing",
  "实现 chunk_ranges(length,size,overlap)。length 为非负整数，size>0，0<=overlap<size。返回覆盖 [0,length) 的半开区间列表，末尾已覆盖后停止；非法 size/overlap 抛 ValueError。",
  "def chunk_ranges(length,size,overlap):\n    pass",
  `def chunk_ranges(length,size,overlap):
    if size<=0 or overlap<0 or overlap>=size: raise ValueError('invalid settings')
    result=[]; start=0
    while start<length:
        end=min(start+size,length); result.append((start,end))
        if end==length: break
        start+=size-overlap
    return result`,
  "def chunk_ranges(length,size,overlap)",
  [
    ["有重叠与短尾", `assert chunk_ranges(8,4,1)==[(0,4),(3,7),(6,8)]`],
    [
      "已覆盖不重复尾",
      `assert chunk_ranges(7,4,1)==[(0,4),(3,7)]; assert chunk_ranges(2,4,0)==[(0,2)]; assert chunk_ranges(0,4,1)==[]`,
    ],
    [
      "步长合法",
      `for size,overlap in [(0,0),(2,2),(2,-1)]:\n    try: chunk_ranges(3,size,overlap)\n    except ValueError: pass\n    else: raise AssertionError('must reject')`,
    ],
  ],
  "这只是窗口索引，不是语义分块；真实块还要保留标题、表头、来源、版本和权限。",
  "步长 size-overlap 必须为正，碰到 length 就结束。",
);
fill(
  "ai-tools-primer",
  "实现 validStockCall(call)。只允许 name=get_stock，args 必须是非空对象且仅有 sku 一个自有可枚举字段，sku 为非空字符串（trim 后非空）。其他类型或额外 tenant 字段返回 false，不转换类型。",
  "function validStockCall(call) {\n  // 工具参数形状检查\n}",
  `function validStockCall(call){const a=call?.args;return Boolean(call?.name==='get_stock'&&a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===1&&Object.hasOwn(a,'sku')&&typeof a.sku==='string'&&a.sku.trim().length>0);}`,
  "function validStockCall(call)",
  [
    [
      "正常与空白",
      `assert(fn({name:'get_stock',args:{sku:'x'}}));equal(fn({name:'get_stock',args:{sku:'  '}}),false);`,
    ],
    [
      "额外身份字段拒绝",
      `equal(fn({name:'get_stock',args:{sku:'x',tenant:'b'}}),false);`,
    ],
    [
      "工具与类型",
      `for(const c of [null,{}, {name:'delete',args:{sku:'x'}},{name:'get_stock',args:null},{name:'get_stock',args:[]},{name:'get_stock',args:{sku:1}}])equal(fn(c),false);`,
    ],
  ],
  "形状通过仍需宿主从可信上下文读取身份并验证资源权限，此函数不能完成业务授权。",
  "先确认对象和字段，再校验 sku，不能从参数读取 tenant 作为授权事实。",
);
fill(
  "ai-evaluation-primer",
  "实现 classification_metrics(tp,fp,fn,tn)。计数均为非负整数。返回 accuracy、precision、recall、f1 字典，不四舍五入；任一指标分母为 0 返回 None。",
  "def classification_metrics(tp,fp,fn,tn):\n    pass",
  `def classification_metrics(tp,fp,fn,tn):
    def div(a,b): return a/b if b else None
    return dict(accuracy=div(tp+tn,tp+fp+fn+tn),precision=div(tp,tp+fp),recall=div(tp,tp+fn),f1=div(2*tp,2*tp+fp+fn))`,
  "def classification_metrics(tp,fp,fn,tn)",
  [
    [
      "手算混淆矩阵",
      `r=classification_metrics(2,1,2,5); assert abs(r['accuracy']-0.7)<1e-9 and abs(r['precision']-2/3)<1e-9 and r['recall']==0.5 and abs(r['f1']-4/7)<1e-9`,
    ],
    [
      "零分母",
      `r=classification_metrics(0,0,0,0); assert all(v is None for v in r.values()); r=classification_metrics(0,0,1,9); assert r['precision'] is None and r['recall']==0 and r['f1']==0`,
    ],
    [
      "TN 不改变 P/R",
      `a=classification_metrics(2,1,2,5); b=classification_metrics(2,1,2,500); assert a['precision']==b['precision'] and a['recall']==b['recall'] and b['accuracy']>a['accuracy']`,
    ],
  ],
  "指标口径与零分母处理须在报告里明确。分类分数不能直接替代检索覆盖、答案支持或任务风险。",
  "F1 可以直接使用 2TP/(2TP+FP+FN)，单独处理每个分母。",
);
fill(
  "ai-multimodal-primer",
  "实现 overlappingIds(segments,start,end)。segments 的 id 唯一，各自 start<end，时间均为有限数。返回与查询半开区间 [start,end) 实际重叠的 ID，按片段 start 升序；start>=end 抛 Error，不修改输入。",
  "function overlappingIds(segments, start, end) {\n  // 半开区间\n}",
  `function overlappingIds(segments,start,end){if(!(start<end))throw Error('invalid window');return segments.filter(s=>s.start<end&&s.end>start).sort((a,b)=>a.start-b.start).map(s=>s.id);}`,
  "function overlappingIds(segments, start, end)",
  [
    [
      "边界相接不重叠",
      `const s=[{id:'a',start:0,end:10},{id:'b',start:10,end:20}];equal(fn(s,10,20),['b']);`,
    ],
    [
      "时间排序与输入隔离",
      `const s=[{id:'b',start:10,end:20},{id:'a',start:0,end:10}];equal(fn(s,9,11),['a','b']);equal(s.map(x=>x.id),['b','a']);`,
    ],
    [
      "空与非法窗口",
      `equal(fn([],0,1),[]);let fail=false;try{fn([],1,1)}catch{fail=true}assert(fail);`,
    ],
  ],
  "片段重叠只是证据时间装配，不实现真实音视频理解；来源、说话人和解析质量仍需验证。",
  "s.start < end 且 s.end > start，先 filter 得到新数组再排序。",
);
fill(
  "js-number-bigint",
  "实现 packEndpoint(ip,port)，按高 32 位 IPv4、低 16 位端口编码并返回十进制字符串。ip 必须四段标准十进制 0–255（拒绝前导零、空白、符号），port 必须 Number 整数 0–65535，非法抛 Error。",
  "function packEndpoint(ip, port) {\n  // 严格输入，使用整数运算\n}",
  `function packEndpoint(ip,port){if(typeof ip!=='string')throw Error('invalid IPv4');const p=ip.split('.');if(p.length!==4||p.some(s=>!/^(0|[1-9]\\d{0,2})$/.test(s)||String(Number(s))!==s||Number(s)>255))throw Error('invalid IPv4');if(!Number.isInteger(port)||port<0||port>65535)throw Error('invalid port');const address=p.reduce((n,s)=>(n<<8n)|BigInt(s),0n);return ((address<<16n)|BigInt(port)).toString();}`,
  "function packEndpoint(ip, port)",
  [
    [
      "最小与最大",
      `equal(fn('0.0.0.0',0),'0');equal(fn('255.255.255.255',65535),'281474976710655');`,
    ],
    [
      "独立字节参考",
      `equal(fn('0.0.0.1',1),'65537');equal(fn('1.0.0.0',0),'1099511627776');`,
    ],
    [
      "IPv4 非标准形式",
      `for(const ip of ['256.0.0.1','01.0.0.1','1.2.3','1.2.3.4'+String.fromCharCode(10),' 1.2.3.4','1.2.3.-1']){let fail=false;try{fn(ip,1)}catch{fail=true}assert(fail,ip)}`,
    ],
    [
      "端口类型范围",
      `for(const p of [-1,65536,1.5,'80',NaN]){let fail=false;try{fn('1.2.3.4',p)}catch{fail=true}assert(fail)}`,
    ],
  ],
  "本题明确新增 48 位布局与严格格式，不能据原面经的简略主题推断原题细节。BigInt 以字符串跨 JSON 传输。",
  "逐段用 BigInt 左移 8 位，地址左移 16 位，最后与端口组合。",
);
