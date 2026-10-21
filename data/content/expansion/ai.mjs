import { unit as u } from "./common.mjs";
u("llmapp", {
  id: "llm-foundations",
  title: "模型、推理、采样与应用系统边界",
  summary:
    "大模型根据上下文生成 token 分布，应用系统负责数据、工具、状态、权限和交付。预训练、微调、推理与检索增强解决不同问题，不能把模型能生成一句话当作可靠业务系统。",
  mechanism:
    "Transformer 的注意力机制组织上下文信息，语言模型训练得到条件分布。temperature、top-p 等影响采样但不构成事实正确性保证；同样提示和配置也未必在不同服务版本下完全复现。工程上应将模型输出视为需要验证的候选。",
  steps: [
    "先写业务任务、输入输出和失败后果，明确哪些步骤由确定性代码完成。",
    "用代表性数据建立基线，区分模型能力不足、上下文缺失与系统集成错误。",
    "记录模型标识、提示版本、检索版本和采样配置，通过评估决定变更。",
  ],
  pitfalls: [
    "低 temperature 不等于无幻觉，也不是所有提供商都支持相同参数。",
    "演示几个成功问题不能证明泛化能力，尤其不能代替权限和业务校验。",
  ],
  question: "大模型与 AI 应用系统的职责如何划分？",
  scenario: "模型能回答样例，但上线后常编造数据，应该先微调吗？",
  answer:
    "先把失败分成无证据、检索未命中、指令歧义、格式错误和推理错误。业务事实优先由数据库或检索提供并要求引用，格式与动作由代码验证。建立失败集和基线后再比较提示、检索或微调方案，避免用训练掩盖数据与系统问题。",
  refs: ["llm-evals", "rag-paper"],
  model: true,
  code: String.raw`import math
logits=[0.0,1.0,2.0]
weights=[math.exp(x-max(logits)) for x in logits]
probabilities=[round(x/sum(weights),3) for x in weights]
show(probabilities)
show(round(sum(probabilities),3))`,
  logs: [[0.09, 0.245, 0.665], 1],
  explain:
    "softmax 示例把三个教学 logits 转成概率分布，不是调用语言模型或训练 Transformer。概率高表示在当前分布下更可能生成，不表示该词对应事实一定正确；实际应用还需证据、校验与任务级评估。",
  choice: [
    "降低 temperature 能否保证事实正确？",
    [
      "能，设为零就不会错",
      "不能，需要证据与任务评估",
      "只对中文能",
      "等同于数据库事务",
    ],
    1,
    "采样参数不提供事实或业务正确性保证。",
  ],
});
u("llmapp", {
  id: "llm-tokens",
  title: "Token、上下文窗口与预算分配",
  summary:
    "token 是模型处理文本的基本单位，不等于字符、单词或 UTF-8 字节。上下文预算包含指令、历史、工具定义、检索内容和预留输出，具体计数与上限应按模型和接口核对。",
  mechanism:
    "不同 tokenizer 对中文、代码、空格和特殊符号的切分不同。窗口可容纳并不代表模型能同样有效使用所有位置的信息；长上下文还带来费用、延迟和噪声。估算用于预检，服务端 usage 用于结算与观察。",
  steps: [
    "为系统指令、历史、检索和输出分别分配预算，超限时采用明确裁剪顺序。",
    "用目标模型 tokenizer 或提供商计数接口校验，保留工具 schema 等隐藏开销余量。",
    "记录输入输出 usage、上下文长度与质量，评估裁剪和摘要造成的信息损失。",
  ],
  pitfalls: [
    "len(text) 或汉字数不能作为精确 token 数。",
    "把全部历史无限追加会挤掉最新问题和证据，也可能放大提示注入。",
  ],
  question: "如何给多轮 RAG 请求分配上下文预算？",
  scenario: "用户对话越长费用越高且答案变差，怎样改？",
  answer:
    "拆开指令、历史、检索和输出占用，确认无重复拼接。保留最近关键轮次，对旧历史做有版本且可追溯的摘要，并按问题重新检索而不是一直携带旧证据。建立长对话评估集比较质量、费用与延迟，不能只看是否不再超限。",
  refs: ["llm-evals", "llm-tools"],
  model: true,
  code: String.raw`window=8000
allocations={'instructions':800,'history':1800,'retrieval':2400,'output':1500}
show(window-sum(allocations.values()))
show(sum(allocations.values())<=window)`,
  logs: [1500, true],
  explain:
    "数值是教学预算，不对应任何真实模型上下文规格，也没有执行 tokenization。实际计数必须使用目标模型工具，并为接口包装、工具定义和输出预留空间；裁剪策略还要通过任务质量评估。",
  choice: [
    "len(text) 能作为通用精确 token 数吗？",
    ["能", "不能，取决于 tokenizer 与接口", "只要 UTF-8 就能", "等于字节长度"],
    1,
    "字符、字节、token 是不同计量。",
  ],
  fill: {
    prompt: "返回 max(0, window-used-reserved_output)，输入均为非负整数。",
    signature: "def remaining_budget(window, used, reserved_output):",
    solution:
      'def remaining_budget(window, used, reserved_output):\n    if min(window,used,reserved_output)<0:\n        raise ValueError("negative")\n    return max(0,window-used-reserved_output)',
    tests: [
      ["有剩余", "assert remaining_budget(100,40,20)==40"],
      ["超额归零", "assert remaining_budget(100,90,20)==0"],
      ["刚好", "assert remaining_budget(100,80,20)==0"],
    ],
    hint: "先扣掉输入与预留输出，再把负值夹到零。",
  },
});
u("llmapp", {
  id: "llm-adapters",
  title: "模型接入、SDK 适配层与确定性替身",
  summary:
    "模型接入应封装供应商差异，统一超时、错误、usage 和结果结构。学习和测试先使用确定性替身验证业务链路，再用受控评估接入真实模型，避免每次单元测试依赖网络与费用。",
  mechanism:
    "统一的应用请求不必等于供应商原始 schema。适配层转换消息、工具和输出，并保留请求标识及错误类别；兼容接口也可能有流事件、工具并行和参数支持差异，不能只修改 base_url 就假设全部行为一致。",
  steps: [
    "定义窄接口和输出模型，包含内容、工具请求、usage、结束原因与 request_id。",
    "把密钥放服务端配置，区分认证、限流、暂态和不可恢复错误，设置总预算。",
    "测试替身返回固定成功与故障序列，真实模型只在明确评估或集成测试中调用。",
  ],
  pitfalls: [
    "不要把 API Key 放进浏览器或学习资料代码常量。",
    "本项目 Python 模拟示例不请求真实模型，假输出不能用作模型质量成绩。",
  ],
  question: "为什么需要模型适配层，而不在每个业务函数直接调用 SDK？",
  scenario: "切换供应商后流式解析与工具调用失败，怎样降低迁移风险？",
  answer:
    "用适配层隔离供应商事件和结果，先跑接口契约样本覆盖流、拒绝、工具请求和 usage。再在同一任务评估集比较质量、成本和延迟，按流量灰度迁移。保留供应商原始 request_id 方便定位，但不泄露提示或密钥。",
  refs: ["llm-tools", "llm-structured", "llm-evals"],
  model: true,
  code: String.raw`class FakeModel:
    def complete(self,prompt):
        return {'text':'fixed:'+prompt,'usage':{'input':3,'output':2}}
result=FakeModel().complete('hello')
show(result['text'])
show(sum(result['usage'].values()))`,
  logs: ["fixed:hello", 5],
  explain:
    "FakeModel 是确定性测试替身，不是 AI 推理。它让状态、日志和结果转换可重复验证；真实 SDK 适配器需要凭据、网络、超时和供应商契约测试，模型质量必须由真实任务评估判断。",
  choice: [
    "确定性模型替身主要用来？",
    [
      "证明模型无幻觉",
      "稳定测试业务链路和失败分支",
      "免费得到真实模型质量",
      "替代全部上线评估",
    ],
    1,
    "替身验证集成逻辑，不代表真实模型能力。",
  ],
});
u("llmapp", {
  id: "llm-prompts",
  title: "提示词结构、任务契约与版本管理",
  summary:
    "有效提示先明确任务、输入边界、输出契约和失败行为，再提供有代表性的例子。提示是系统的一部分，应有版本和评估，不靠不断追加互相冲突的指令堆积。",
  mechanism:
    "任务指令与用户数据、检索文本应明确分隔，但分隔符本身不提供安全隔离。few-shot 样本覆盖边界比重复口号更有价值；输出格式和业务限制需要代码验证，不只靠模型承诺。",
  steps: [
    "将任务目标、允许来源、输出 schema 和证据不足时行为写成清晰契约。",
    "选择正常、模糊、恶意和缺证据样本，提示版本与评估结果一起保存。",
    "避免把用户输入拼成更高权限指令，权限、预算和工具白名单由服务端执行。",
  ],
  pitfalls: [
    "更长提示不一定更好，互相冲突和重复规则会增加噪声。",
    "要求模型“绝不出错”不能替代验证，few-shot 样本也可能泄露敏感数据。",
  ],
  question: "提示词如何作为可测试、可回滚的软件资产管理？",
  scenario: "某次提示改动让一种问题更好却让其他问题变差，怎样验证？",
  answer:
    "固定基线提示与评估集，按任务类别分别比较成功率、拒答和误动作，检查样本是否偏向新问题。提示改动和检索、模型配置分开实验，保留版本与回滚。不要把单个演示成功当成整体提升。",
  refs: ["llm-evals", "owasp-llm"],
  model: true,
  code: String.raw`template={'version':'v2','task':'extract title','output':'JSON object','on_missing':'return null'}
show(template)
show(template['on_missing'])`,
  logs: [
    {
      version: "v2",
      task: "extract title",
      output: "JSON object",
      on_missing: "return null",
    },
    "return null",
  ],
  explain:
    "模板只展示提示资产应有的可追溯元素，没有发起推理。真实提示应与数据、schema 和评估一起管理；缺失时返回 null 的指令仍需在服务端验证，模型输出不符合时要进入明确错误分支。",
  choice: [
    "提示优化的可靠判断依据是？",
    [
      "某一个例子看起来更好",
      "固定评估集的分组比较与回归",
      "提示字数更多",
      "更强烈的语气",
    ],
    1,
    "需要代表性评估和回归，防止局部优化损害其他场景。",
  ],
});
u("llmapp", {
  id: "llm-structured",
  title: "结构化输出、Schema 与业务验证",
  summary:
    "结构化输出约束 JSON 形状，不能保证字段事实真实或业务规则满足。有效 schema、模型支持范围、拒绝和截断都需要处理，解析成功只是进入业务验证的起点。",
  mechanism:
    "提供商的结构化输出能力通常支持特定 JSON Schema 子集，参数与模型兼容性应按官方文档确认。类型合法的日期可能不存在，合法字符串也可能不是允许的资源 ID；业务验证与权限检查仍由服务器执行。",
  steps: [
    "尽量使用小而明确的 schema，限定必填、枚举、长度和额外字段。",
    "处理拒绝、未完成、截断和无效输出，限制修复重试并保留失败样本。",
    "把事实核对、业务不变量和授权放在执行动作之前，不能让 schema 代替这些步骤。",
  ],
  pitfalls: [
    "JSON 模式、schema 约束和工具调用是不同能力，不能混用名称和保证。",
    "字段类型正确也可能指向不存在或越权的对象。",
  ],
  question: "结构化输出相比“请返回 JSON”改善什么，仍然不能保证什么？",
  scenario: "模型返回合法 JSON，但金额为负或订单不属于用户，该怎么处理？",
  answer:
    "先按结构校验，再按金额范围和订单归属进行确定性验证。拒绝越权与非法业务值，不直接执行；格式修复只处理允许修复的问题并限制次数。把失败样本加入评估，明确 schema 一致性与任务正确性两个指标。",
  refs: ["llm-structured", "json-schema"],
  code: String.raw`def validate_order(data):
    return set(data)=={'item','quantity'} and isinstance(data['item'],str) and type(data['quantity']) is int and data['quantity']>0
show(validate_order({'item':'a','quantity':2}))
show(validate_order({'item':'a','quantity':-1}))`,
  logs: [true, false],
  explain:
    "代码只验证一个小型结构与数量规则，没有证明 item 对应真实商品或当前用户有权购买。真实模型的 schema 参数应以供应商文档为准；应用收到结构正确的候选后仍需查业务数据和授权。",
  choice: [
    "Schema 合法能保证？",
    [
      "所有事实正确",
      "符合被验证的结构规则，业务仍需检查",
      "用户一定有权限",
      "工具调用可以跳过校验",
    ],
    1,
    "结构正确与事实、权限、业务正确性是不同层次。",
  ],
  fill: {
    prompt:
      "仅当 data 是包含且仅包含 title(str) 和 tags(list[str]) 的字典时返回 True，空 tags 允许。",
    signature: "def valid_document(data):",
    solution:
      "def valid_document(data):\n    return isinstance(data,dict) and set(data)=={'title','tags'} and isinstance(data['title'],str) and isinstance(data['tags'],list) and all(isinstance(x,str) for x in data['tags'])",
    tests: [
      ["合法", "assert valid_document({'title':'A','tags':[]})"],
      ["元素错误", "assert not valid_document({'title':'A','tags':[1]})"],
      [
        "额外字段",
        "assert not valid_document({'title':'A','tags':[],'role':'admin'})",
      ],
    ],
    hint: "先检查对象与字段集合，再检查每个字段和数组元素。",
  },
});
u("llmapp", {
  id: "llm-streaming",
  title: "流式响应、事件聚合与断线恢复",
  summary:
    "流式输出降低首字等待，但增量片段不等于完整答案。文本、工具参数、结束事件和 usage 可能分开到达，必须依据供应商事件协议聚合，支持取消、错误与不完整结束。",
  mechanism:
    "HTTP 字节块、UTF-8 字符、SSE 消息和模型内容事件并不对齐。增量解码器保留未完成字符，SSE 解析器按消息边界处理；工具参数需要聚合后校验，不能看到半个 JSON 就执行工具。",
  steps: [
    "分层解析字节、传输消息和业务事件，保存任务状态与已显示片段。",
    "终态区分成功、拒绝、失败和取消，只有完成协议后才提交最终答案。",
    "重连按事件 ID 或任务资源恢复，去重已处理事件并控制缓冲区。",
  ],
  pitfalls: [
    "split 每个网络块的换行会破坏跨块消息和多字节字符。",
    "用户停止显示不表示服务端模型调用已停止计费，应传递取消并核对最终 usage。",
  ],
  question: "为什么流式工具参数必须聚合完成后再执行？",
  scenario: "模型工具参数分三段到达，客户端第一段就解析 JSON 报错，怎样改？",
  answer:
    "按事件 ID 收集同一工具调用的参数片段，直到供应商结束事件再解析和 schema 校验。协议失败、拒绝和截断进入独立分支，不自动执行残缺动作。日志保留事件类型与关联 ID，参数脱敏并限制累计大小。",
  refs: ["sse", "llm-tools"],
  model: true,
  code: String.raw`parts=['{"city":','"上海"','}']
complete=''.join(parts)
show(json.loads(complete))
show(len(parts))`,
  logs: [{ city: "上海" }, 3],
  explain:
    "模型只演示参数片段合并，不是完整 SSE 或供应商事件解析器。真实流需要区分多个工具调用、文本增量与终态，处理跨块 UTF-8 和失败；合并后仍要校验参数与授权，不能仅因 JSON 可解析就执行。",
  choice: [
    "工具参数流应何时执行？",
    [
      "第一段到达立刻执行",
      "完整聚合、校验并授权后",
      "页面显示 loading 时",
      "只要包含左花括号",
    ],
    1,
    "残缺参数和未授权候选都不能直接触发动作。",
  ],
});
u("llmapp", {
  id: "llm-embeddings",
  title: "Embedding、相似度与向量空间契约",
  summary:
    "Embedding 将输入映射为向量，相似度用于候选检索，不代表逻辑等价或事实正确。模型、维度、归一化和距离度量必须配套，升级 embedding 通常需要重建或双索引迁移。",
  mechanism:
    "余弦相似度比较方向，点积还受向量长度影响；归一化后点积与余弦相关。零向量需特殊处理，不同模型的向量不能随意混放比较。语义相近内容也可能来自无权访问的文档，权限过滤仍是独立要求。",
  steps: [
    "固定 embedding 模型、维度、预处理与索引版本，记录文档和块 ID。",
    "按检索任务选择距离度量，验证归一化和零向量处理。",
    "模型升级用标注查询比较召回、成本与延迟，迁移期间避免新旧向量混用。",
  ],
  pitfalls: [
    "相似度阈值不能跨模型和数据集直接照搬。",
    "相似内容不一定回答当前问题，更不意味着允许用户访问；必须结合可信身份检查文档权限，防止高相关但越权的内容进入回答。",
  ],
  question: "为什么 embedding 升级后不能继续直接使用旧向量索引？",
  scenario: "换了更大 embedding 模型但召回明显下降，如何定位？",
  answer:
    "检查查询和文档是否用同模型、同预处理和同维度，距离度量是否匹配归一化。对固定评估集比较 top-k 召回和失败查询，再决定重建索引或双索引迁移。保留版本字段，不能因为维度恰好相同就假设向量空间一致。",
  refs: ["rag-paper", "llm-evals"],
  model: true,
  code: String.raw`import math
def cosine(a,b):
    norm=math.sqrt(sum(x*x for x in a)*sum(y*y for y in b))
    return sum(x*y for x,y in zip(a,b))/norm if norm else 0.0
show(round(cosine([1,0],[1,1]),3))
show(cosine([0,0],[1,0]))`,
  logs: [0.707, 0],
  explain:
    "向量由人工固定样本提供，余弦计算是真实算法，但没有调用 embedding 模型。函数还假设维度一致，完整实现应先校验长度与有限数值；零向量返回零是本课契约，不是所有向量数据库的统一行为。",
  choice: [
    "同维度的不同 embedding 模型向量能否直接混比？",
    [
      "总能",
      "不能仅凭维度相同推断兼容",
      "只要都归一化就保证语义兼容",
      "取前几维即可",
    ],
    1,
    "不同模型的向量空间不同，必须使用匹配的编码与索引版本。",
  ],
  fill: {
    prompt:
      "实现维度相同向量的余弦相似度，零向量返回 0.0，维度不等抛 ValueError。",
    signature: "def cosine_similarity(a, b):",
    solution:
      'def cosine_similarity(a, b):\n    import math\n    if len(a)!=len(b):\n        raise ValueError("dimension")\n    norm=math.sqrt(sum(x*x for x in a)*sum(x*x for x in b))\n    return sum(x*y for x,y in zip(a,b))/norm if norm else 0.0',
    tests: [
      ["相同方向", "assert abs(cosine_similarity([1,2],[2,4])-1)<1e-9"],
      [
        "正交与零",
        "assert cosine_similarity([1,0],[0,1])==0 and cosine_similarity([0,0],[1,1])==0",
      ],
      ["反向", "assert abs(cosine_similarity([1,0],[-1,0])+1)<1e-9"],
    ],
    hint: "点积除以两边 L2 范数乘积，先检查维度。",
  },
});
u("llmapp", {
  id: "llm-chunking",
  title: "文档清洗、分块、重叠与来源追踪",
  summary:
    "分块决定检索单元与证据上下文。固定长度、段落、标题和语义分块各有适用范围；块过小可能丢关系，过大可能稀释相关信息并占用上下文预算。",
  mechanism:
    "块应保存 document_id、chunk_id、原文范围、标题与权限元数据。重叠缓解边界断句，但增加重复、索引成本和上下文噪声。字符数分块只是教学简化，不等于模型 token 预算；表格、代码和 OCR 需专门处理结构。",
  steps: [
    "先清洗重复导航和页脚，保留标题层级与原始来源位置。",
    "选择可解释的块大小与 overlap，确保每轮起点向前推进避免无限循环。",
    "用真实查询评估召回和引用粒度，更新分块策略时记录版本并重建受影响索引。",
  ],
  pitfalls: [
    "overlap>=size 会导致简单滑窗不前进，参数必须验证。",
    "删除所有换行可能破坏代码、列表和表格语义。",
  ],
  question: "分块大小和重叠如何影响检索与生成？",
  scenario: "答案相关段落总被截在两个块之间，应该无限增大 overlap 吗？",
  answer:
    "先检查文档结构与切分边界，优先按标题、段落或句子保持语义完整，再用适量重叠补边界。用跨边界问题评估召回与重复上下文成本，必要时检索块后扩展邻居。不要只看召回率而忽略重复、权限和 token 预算。",
  refs: ["rag-paper", "llm-evals"],
  code: String.raw`def chunks(text,size,overlap):
    if not 0<=overlap<size: raise ValueError('overlap')
    return [text[i:i+size] for i in range(0,len(text),size-overlap)]
show(chunks('abcdefgh',4,1))`,
  logs: [["abcd", "defg", "gh"]],
  explain:
    "这是按 Python 字符切片的滑窗，未执行 tokenizer，也未处理段落和句子边界。size-overlap 保证推进，最后一块可能短于 size。生产管道应记录原文偏移、权限和版本，并用任务评估选择策略。",
  choice: [
    "固定滑窗中为什么要求 overlap<size？",
    [
      "为了美观",
      "确保步长为正、每轮推进",
      "让 JSON 更短",
      "固定所有模型相同 tokenizer",
    ],
    1,
    "步长为 size-overlap，非正值会破坏推进或导致错误。",
  ],
  fill: {
    prompt:
      "按字符滑窗切块，size>0、0<=overlap<size；空文本返回 []，不丢尾块。",
    signature: "def chunk_text(text, size, overlap):",
    solution:
      'def chunk_text(text, size, overlap):\n    if size<=0 or overlap<0 or overlap>=size:\n        raise ValueError("parameters")\n    return [text[i:i+size] for i in range(0,len(text),size-overlap)]',
    tests: [
      ["重叠与尾块", "assert chunk_text('abcdefgh',4,1)==['abcd','defg','gh']"],
      [
        "空与短文本",
        "assert chunk_text('',4,1)==[] and chunk_text('ab',4,1)==['ab']",
      ],
    ],
    hint: "步长 size-overlap，range 控制起点，切片保留尾部。",
  },
});
u("llmapp", {
  id: "llm-vector-index",
  title: "向量索引、ANN、元数据过滤与删除",
  summary:
    "向量数据库提供相似度搜索与索引管理，不能自动完成文档清洗、权限授权和 RAG 质量保证。近似最近邻用速度与召回做权衡，过滤和删除语义需要按具体实现验证。",
  mechanism:
    "精确扫描适合小数据基线，ANN 索引如 HNSW 有构建、内存与搜索参数成本。租户过滤在召回前后可能影响可见集合和召回率，检索返回前必须满足授权。删除文档要传播到块、索引、缓存和引用。",
  steps: [
    "先用精确小规模基线校验距离与排序，再评估 ANN 的召回与延迟。",
    "索引记录模型版本、文档版本、租户与权限，查询带可信过滤条件。",
    "为更新删除定义一致性窗口与对账，验证已撤权内容不会继续出现在缓存答案中。",
  ],
  pitfalls: [
    "top-k 返回多少条不代表其中有相关证据。",
    "先返回给客户端再隐藏越权文本太晚，服务器必须在输出前完成授权。",
  ],
  question: "ANN 速度提升的代价是什么，权限过滤应在哪处理？",
  scenario: "删除文档后仍能从问答中看到原文，应该查哪些层？",
  answer:
    "沿文档、分块、向量索引、检索缓存与答案缓存逐层检查 ID 和版本。确认删除事件可靠传播，查询层权限过滤立即生效，对异步删除窗口明确处理。用撤权后的查询回归测试，而不仅检查数据库文档行是否已删除。",
  refs: ["rag-paper", "llm-evals", "http-semantics"],
  model: true,
  code: String.raw`docs=[{'id':'a','tenant':'t1','score':0.8},{'id':'b','tenant':'t2','score':0.99}]
visible=[d for d in docs if d['tenant']=='t1']
show([d['id'] for d in sorted(visible,key=lambda d:-d['score'])])`,
  logs: [["a"]],
  explain:
    "样本强调高相似度不越过权限边界，没有实现 ANN 索引。真实系统中可信 tenant 来自认证上下文，过滤与索引参数要联合评估；不能接受用户自行提交的租户字段就直接扩大检索范围。",
  choice: [
    "向量数据库能自动解决？",
    [
      "所有权限问题",
      "索引与搜索的一部分，权限和质量仍需应用设计",
      "幻觉全部消失",
      "所有文档无需分块",
    ],
    1,
    "索引是系统组件，不能替代业务与安全边界。",
  ],
});
u("llmapp", {
  id: "llm-hybrid",
  title: "关键词、语义召回与 RRF 混合检索",
  summary:
    "关键词检索擅长精确术语、编号和稀有词，语义检索擅长表达变化。混合召回将不同候选信号组合，融合前应处理去重、权限和评分不可直接比较的问题。",
  mechanism:
    "不同检索器分数尺度常不同，直接相加可能被某一通道支配。Reciprocal Rank Fusion 按排名贡献 1/(k+rank)，不依赖原始分数同尺度；常数和通道权重仍需在任务集评估。",
  steps: [
    "建立关键词与语义两条可独立评估的召回基线。",
    "合并时按稳定块 ID 去重，采用排名融合或经过标定的分数。",
    "分别查看编号问题、同义表达和无答案问题的召回，再调整权重和候选预算。",
  ],
  pitfalls: [
    "RRF 常数不是通用最优值，不能照抄后不做评估。",
    "两条通道都返回同一无关片段，融合后仍可能错误。",
  ],
  question: "为什么混合检索通常不能直接把两个原始分数相加？",
  scenario: "产品型号查询向量召回很差，但自然语言问题很好，如何改进？",
  answer:
    "增加关键词或精确字段通道，型号和编号使用规范化后精确匹配或分词策略。与语义候选按 ID 合并，用排名融合降低分数尺度差异，再用分组评估验证。保持权限过滤，并观察新通道是否把泛词噪声排到前面。",
  refs: ["rag-paper", "llm-evals"],
  model: true,
  code: String.raw`def rrf(lists,k=10):
    scores={}
    for ranking in lists:
        for rank,key in enumerate(ranking,1): scores[key]=scores.get(key,0)+1/(k+rank)
    return sorted(scores,key=lambda key:(-scores[key],key))
show(rrf([['a','b'],['b','c']]))`,
  logs: [["b", "a", "c"]],
  explain:
    "b 在两个通道都出现，按排名贡献相加后靠前。样例是人工排名，没有执行真实 embedding 或关键词索引；生产应确保每通道内 ID 唯一、过滤正确，并对常数和候选预算做评估。",
  choice: [
    "RRF 融合主要依赖？",
    ["原始分数完全同尺度", "候选排名", "模型温度", "JSON 属性顺序"],
    1,
    "排名融合降低对不同检索器分数尺度的依赖。",
  ],
  fill: {
    prompt:
      "将多个排名列表按 1/(k+rank) 融合，rank 从 1 开始；同分按 ID 字典序，假设每通道无重复 ID。",
    signature: "def fuse_ranks(rankings, k=10):",
    solution:
      "def fuse_ranks(rankings, k=10):\n    scores={}\n    for ranking in rankings:\n        for rank,key in enumerate(ranking,1):\n            scores[key]=scores.get(key,0)+1/(k+rank)\n    return sorted(scores,key=lambda key:(-scores[key],key))",
    tests: [
      ["双通道", "assert fuse_ranks([['a','b'],['b','c']])==['b','a','c']"],
      ["空结果", "assert fuse_ranks([])==[]"],
      ["稳定同分", "assert fuse_ranks([['b'],['a']])==['a','b']"],
    ],
    hint: "累加每个 ID 的排名贡献，再按负分数和 ID 排序。",
  },
});
u("llmapp", {
  id: "llm-reranking",
  title: "重排、上下文选择与多样性",
  summary:
    "重排对有限候选做更精细相关性判断，通常比初筛贵。候选顺序还需考虑重复、文档覆盖和上下文预算，最高分列表不一定是最佳证据组合。",
  mechanism:
    "cross-encoder 等重排模型联合处理问题与候选，相比独立 embedding 更细但计算更重。MMR 等策略折中相关性和多样性；同一段的重叠块可能挤占上下文，导致答案缺少其他必要证据。",
  steps: [
    "先保证召回池覆盖正确证据，再调重排，避免期望重排找回未召回内容。",
    "限制候选数和单块长度，观察重排增加的延迟与费用。",
    "按文档与内容去重，选择互补证据，保留最终输入上下文用于评估。",
  ],
  pitfalls: [
    "重排只能重排已有候选，不能凭空恢复漏召回文档。",
    "模型高分不等于引用支持答案，仍需证据相关性与覆盖验证。",
  ],
  question: "为什么要把召回评估与重排评估分开？",
  scenario: "top-5 全是同一段的重叠块，回答缺少另一份文档的信息，怎么办？",
  answer:
    "检查候选去重和分块重叠，按文档或相似内容做多样性约束，给互补来源预留预算。比较重排前后证据覆盖而不只看最高分。若另一份文档没进候选池，应修召回与过滤，不能只调重排权重。",
  refs: ["rag-paper", "llm-evals"],
  model: true,
  code: String.raw`ranked=[('d1:a',0.9),('d1:b',0.89),('d2:a',0.8)]
seen=set(); selected=[]
for key,score in ranked:
    doc=key.split(':')[0]
    if doc not in seen: seen.add(doc); selected.append(key)
show(selected)`,
  logs: [["d1:a", "d2:a"]],
  explain:
    "示例用每文档选一块的简单规则演示多样性，并非通用最优重排算法。某些问题需要同文档多段证据，因此配额和多样性应按任务调整；实际模型分数与延迟需要测量。",
  choice: [
    "正确文档从未进入召回池，重排可以保证找回吗？",
    [
      "可以",
      "不能，它处理已有候选",
      "只要 temperature 低就能",
      "只要增加输出长度",
    ],
    1,
    "应先排查召回覆盖、过滤和分块，再调重排。",
  ],
});
u("llmapp", {
  id: "llm-rag",
  title: "RAG 全链路、证据预算与无答案行为",
  summary:
    "RAG 将检索证据交给生成阶段，效果取决于数据质量、检索、上下文构造和回答约束。它不会自动消除幻觉，需要明确证据不足、冲突和过期时的行为。",
  mechanism:
    "离线链路做清洗、分块、编码和索引；在线链路做查询理解、授权过滤、召回、重排、上下文和生成。不同故障归属不同阶段：命中相关文档但答案错误，与完全漏召回应分开诊断。",
  steps: [
    "固定文档版本、查询样本与期望证据，分别测召回和最终回答。",
    "上下文包含来源 ID、日期和必要文本，按预算选择而不盲目塞满。",
    "证据不足时返回明确限制或请求补充，冲突时展示来源差异，不伪造引用。",
  ],
  pitfalls: [
    "“只根据以下内容回答”是指令，不是可证明的输出约束。",
    "更大的 top-k 可能增加噪声和费用，不保证更高质量。",
  ],
  question: "如何定位 RAG 的答案错误发生在检索还是生成阶段？",
  scenario: "用户问文档中没有的规则，系统仍给出自信答案，如何改？",
  answer:
    "加入无答案与冲突样本评估，设定证据充分性判断和保守回答策略。记录实际检索上下文与引用，再检查答案陈述是否可被证据支持。用真实模型验证拒答误伤与漏拒答，阈值不能只在几个成功样例上选择。",
  refs: ["rag-paper", "llm-evals"],
  model: true,
  code: String.raw`docs=[{'id':'a','text':'python crawler'},{'id':'b','text':'vue renderer'}]
query={'python'}
hits=[d for d in docs if query & set(d['text'].split())]
show([d['id'] for d in hits])
show('evidence available' if hits else 'insufficient evidence')`,
  logs: [["a"], "evidence available"],
  explain:
    "这是确定性的词项召回与证据存在性示例，没有调用生成模型，也不能证明候选足以回答具体问题。完整 RAG 应把命中、证据支持与最终回答正确性分开评估，失败时保留来源和版本。",
  choice: [
    "增大 top-k 一定提高回答质量吗？",
    ["一定", "不一定，可能增加噪声与预算压力", "与检索无关", "等同于微调"],
    1,
    "需要结合候选相关性、覆盖与上下文预算评估。",
  ],
});
u("llmapp", {
  id: "llm-citations",
  title: "引用、证据支持与冲突处理",
  summary:
    "引用需要指向实际被检索和授权的证据，不能只让模型输出看起来可信的链接。引用存在、来源可访问、片段相关和陈述被支持是不同检查层次。",
  mechanism:
    "上下文为每个片段分配稳定 ID，生成结果引用该 ID，服务端再检查 ID 是否在本次允许证据集中。存在性校验仍不能证明陈述被支持；需要片段级评估、事实核对与冲突处理，保留来源日期和版本。",
  steps: [
    "引用回链使用服务器维护的 ID 到来源映射，避免模型任意生成 URL。",
    "检查每条引用属于本轮授权证据集，再验证答案陈述与证据的支持关系。",
    "证据冲突或过期时展示来源差异与限制，不能通过多数投票掩盖版本不一致。",
  ],
  pitfalls: [
    "链接真实不代表支持当前陈述，不能只统计引用数量。",
    "用户撤权或文档删除后，历史缓存和引用展示也需要重新检查可见性。",
  ],
  question: "引用存在性与答案 groundedness 有什么区别？",
  scenario: "回答给出真实文档链接，但文档并没有说那句话，怎么发现？",
  answer:
    "先核对本轮证据与引用映射，再逐陈述检查相关片段是否支持答案。把引用正确性与答案事实正确性分开评估，包含冲突、过期和无答案样本。生成失败时提示限制或重新检索，不能仅用合法 URL 正则验收。",
  refs: ["rag-paper", "llm-evals"],
  model: true,
  code: String.raw`allowed={'c1','c2'}
citations=['c1','invented']
show([x for x in citations if x not in allowed])
show(all(x in allowed for x in ['c1']))`,
  logs: [["invented"], true],
  explain:
    "集合校验能发现虚构 ID，但不能证明 c1 的内容支持回答。完整验收还要检查片段与陈述关系、来源版本和用户权限；这一步是确定性验证，可在任何模型生成后执行。",
  choice: [
    "引用 ID 合法是否证明答案有证据支持？",
    [
      "证明",
      "不能，还需检查陈述与片段关系",
      "只要链接是 HTTPS 就证明",
      "引用越多越正确",
    ],
    1,
    "存在性与支持性是不同指标，需要分别验证。",
  ],
  fill: {
    prompt: "按出现顺序返回引用列表里不在 allowed 集合的 ID，保留重复项。",
    signature: "def invalid_citations(citations, allowed):",
    solution:
      "def invalid_citations(citations, allowed):\n    return [value for value in citations if value not in allowed]",
    tests: [
      ["发现虚构", "assert invalid_citations(['a','x','x'],{'a'})==['x','x']"],
      ["无引用", "assert invalid_citations([],{'a'})==[]"],
    ],
    hint: "只过滤非法 ID，保留输入顺序与重复。",
  },
});
u("llmapp", {
  id: "llm-evaluation",
  title: "评估集、Recall@k、答案质量与回归",
  summary:
    "AI 评估需要代表性任务、明确标签和稳定版本。检索召回、结构合法、答案正确、证据支持、拒答与工具动作不能混成一个模糊评分，平均数也不能掩盖关键失败。",
  mechanism:
    "Recall@k 衡量标注相关项被前 k 个候选覆盖的比例，标注不完整会影响解释。模型裁判可能偏置并受提示影响，需要人工校准与抽样审计；线上指标还包括延迟、费用和实际业务完成情况。",
  steps: [
    "把正常、长尾、无答案、越权、冲突和恶意输入纳入分组评估集。",
    "固定模型、提示、数据与索引版本，对变更做同题对比并检查回归。",
    "分别报告各指标分母与关键失败，人工复核高影响动作和裁判分歧。",
  ],
  pitfalls: [
    "只看总体平均会掩盖权限或无答案场景的严重退化。",
    "用测试集反复挑提示会过拟合，应保留独立验证和持续更新样本。",
  ],
  question: "如何评价一个 RAG 系统，为什么不能只看回答“像不像”？",
  scenario: "总体准确率提高，但越权回答增加，能上线吗？",
  answer:
    "按风险分组检查，权限和高影响动作应作为独立门禁而不是被平均分抵消。分析召回、上下文与工具授权的失败位置，修复后跑完整回归并人工复核。记录数据分布与置信程度，不能只用总体提升宣布成功。",
  refs: ["llm-evals"],
  code: String.raw`def recall(retrieved,relevant):
    return len(set(retrieved)&set(relevant))/len(set(relevant)) if relevant else 0.0
show(recall(['a','b'],['a','c']))
show(recall(['a','a'],['a']))`,
  logs: [0.5, 1],
  explain:
    "集合消除重复，相关项分母固定，避免重复命中抬高召回。本课将没有相关标注的情况定义为 0，但真实评估应单独标记无答案样本或未定义指标；答案质量和权限需要其他测试。",
  choice: [
    "评估中关键安全失败能否被高平均分抵消？",
    [
      "可以",
      "不应，应设独立门禁和分组报告",
      "只要样本少就忽略",
      "由输出字数决定",
    ],
    1,
    "高影响失败需要独立门禁，不能被其他普通题平均掉。",
  ],
  fill: {
    prompt:
      "计算去重后的 Recall@k，先取 retrieved 前 k 项；relevant 为空时按本题契约返回 0.0。",
    signature: "def recall_at_k(retrieved, relevant, k):",
    solution:
      'def recall_at_k(retrieved, relevant, k):\n    if k<0:\n        raise ValueError("k")\n    relevant=set(relevant)\n    return len(set(retrieved[:k]) & relevant)/len(relevant) if relevant else 0.0',
    tests: [
      ["截断", "assert recall_at_k(['x','a','b'],{'a','b'},2)==0.5"],
      ["重复不抬高", "assert recall_at_k(['a','a'],{'a','b'},2)==0.5"],
      ["空相关集", "assert recall_at_k(['a'],set(),1)==0.0"],
    ],
    hint: "先按 k 截断，再用集合计算交集与相关项总数。",
  },
});
u("llmapp", {
  id: "llm-tools",
  title: "工具调用、参数验证与权限执行",
  summary:
    "模型提出工具调用只是候选计划，实际动作由应用服务器验证并执行。工具 schema 描述输入形状，不赋予用户权限；工具结果也可能是不可信文本，应重新进入数据边界。",
  mechanism:
    "典型循环是模型返回工具请求、应用校验名称参数与授权、执行并返回结果、模型继续生成。工具可能并行或多轮调用，需要调用 ID、超时、幂等和预算；高影响动作需按业务规则确认，模型不能自行提升权限。",
  steps: [
    "工具采用窄能力和字段白名单，不暴露任意 shell、SQL 或无约束 URL 代请求。",
    "执行前验证身份、对象归属、参数范围和调用预算，写操作带幂等键。",
    "结果限制大小与敏感字段，记录调用 ID、审批与最终状态，支持失败和取消。",
  ],
  pitfalls: [
    "模型输出合法 JSON 不等于动作已经获得授权。",
    "工具返回的网页文字可能包含提示注入，不能升级为系统指令。",
  ],
  question: "Function calling 中模型和应用各负责什么？",
  scenario: "模型要求删除别人的文档，参数格式正确，应该执行吗？",
  answer:
    "服务器先用可信身份检查文档归属和删除权限，拒绝越权调用并记录审计。高影响动作按规则请求用户确认或审批，执行带幂等和状态查询。不要把模型的自然语言理由当作授权，也不要由请求参数指定执行身份。",
  refs: ["llm-tools", "owasp-llm"],
  model: true,
  code: String.raw`tools={'read_article'}
request={'name':'delete_article','id':'other'}
show(request['name'] in tools)
show('rejected' if request['name'] not in tools else 'validate args')`,
  logs: [false, "rejected"],
  explain:
    "工具名白名单阻止未知动作，但允许的工具仍需参数和资源授权。这个模型没有执行删除或任何网络请求；真正执行器应该将检查、确认和结果审计放在受控服务端。",
  choice: [
    "模型请求调用工具时，最终授权由谁决定？",
    [
      "模型自己",
      "应用服务器的可信身份与权限规则",
      "提示词语气",
      "客户端隐藏按钮",
    ],
    1,
    "模型和用户输入都是候选数据，权限由服务器边界执行。",
  ],
});
u("llmapp", {
  id: "llm-agents",
  title: "Agent、工作流、状态机与停止条件",
  summary:
    "Agent 适合步骤存在不确定性且需要工具反馈的任务；固定规则明确的流程通常先用可解释工作流。自主循环必须有步数、时间、费用、权限和结果验证边界。",
  mechanism:
    "Agent 循环包含观察、决策、工具执行与状态更新。持久化状态使断点恢复可解释，工具副作用需幂等；规划、反思等额外轮次增加成本，不自动提升质量。成功条件应由任务验证器判断，而非模型自称完成。",
  steps: [
    "把确定步骤写成工作流，只让模型决定真正需要语言判断的分支。",
    "设置最大步骤、重复动作检测、总 deadline 和费用预算，失败时进入可恢复状态。",
    "保存执行轨迹和状态版本，写操作采用幂等与必要确认，退出后验证产物。",
  ],
  pitfalls: [
    "多 Agent 或多轮反思并非默认更好，可能增加传播错误和调试难度。",
    "循环里重复工具返回相同结果时，应停止或升级处理，不能无限“再试一次”。",
  ],
  question: "什么时候应选择工作流，什么时候值得使用 Agent？",
  scenario: "Agent 不断搜索同一问题且没有产出，怎样限制与诊断？",
  answer:
    "检查停止条件、重复调用摘要和工具反馈是否实际推进状态。设置步骤与总预算，重复状态触发停止并返回缺失信息；对产物设置独立验证器。用轨迹评估定位规划、工具还是输入问题，不直接增加更多反思轮数。",
  refs: ["llm-tools", "llm-evals"],
  model: true,
  code: String.raw`actions=['search:a','read:1','search:a']
seen=set(); status='running'
for action in actions:
    if action in seen: status='stopped: repeated action'; break
    seen.add(action)
show(status)
show(len(seen))`,
  logs: ["stopped: repeated action", 2],
  explain:
    "重复动作检测是简单护栏，真实任务可能需要带不同状态重复同一工具，因此摘要应包含有效状态与参数。示例没有自主模型决策，最终成功还需由业务产物验证，而不是只要循环结束就算成功。",
  choice: [
    "Agent 任务成功应优先由什么判断？",
    [
      "模型说完成",
      "独立任务与产物验证器",
      "循环次数越多越成功",
      "有一条日志即可",
    ],
    1,
    "停止与成功不同，产物需要可验证契约。",
  ],
});
u("llmapp", {
  id: "llm-mcp",
  title: "MCP、工具协议与连接权限",
  summary:
    "MCP 为模型应用连接工具和上下文提供标准协议，但不代替身份授权、业务审批或网络隔离。协议协商、能力发现、工具契约与会话生命周期都需要按选定版本实现。",
  mechanism:
    "客户端与服务端协商能力并通过协议调用工具、读取资源。工具描述供模型理解，参数 schema 供验证；它们不是授权凭据。远程传输与本地进程的信任边界不同，凭据应绑定适当受众，避免 token passthrough 等混淆。",
  steps: [
    "固定协议版本与传输方式，验证初始化、能力发现、错误与取消行为。",
    "工具最小化权限，身份与授权在服务端完成，结果按不可信数据处理。",
    "管理连接、请求 ID、超时和审计，升级时用契约测试核对兼容性。",
  ],
  pitfalls: [
    "连上 MCP server 不意味着该 server 的所有动作都已获用户同意。",
    "工具名称或描述可能误导模型，实际授权不能只依赖自然语言说明。",
  ],
  question: "MCP 解决哪些互操作问题，又不解决哪些安全问题？",
  scenario: "接入第三方 MCP 工具后它请求高权限凭据，应该如何评估？",
  answer:
    "核对服务来源、所需能力与凭据受众，按最小权限分配访问，避免传递无关会话令牌。先在隔离环境验证工具契约和副作用，建立明确的写操作确认与审计。协议兼容只是连接条件，不是对第三方行为的信任保证。",
  refs: ["mcp-spec", "llm-tools"],
  model: true,
  code: String.raw`tool={'name':'search_docs','inputSchema':{'type':'object','required':['query']}}
show(tool['name'])
show(tool['inputSchema']['required'])`,
  logs: ["search_docs", ["query"]],
  explain:
    "对象展示工具契约的一个片段，不是完整 MCP 初始化或传输实现。协议版本和 schema 支持范围应跟随官方规范与 SDK；服务器仍必须验证真实身份、参数和资源权限，不能因工具被发现就允许执行全部能力。",
  choice: [
    "MCP 主要提供？",
    [
      "所有工具的自动授权",
      "连接工具和上下文的互操作协议",
      "模型事实正确保证",
      "免费模型额度",
    ],
    1,
    "协议统一交互形式，授权与业务规则仍由应用负责。",
  ],
});
u("llmapp", {
  id: "llm-memory",
  title: "会话状态、摘要、长期记忆与删除",
  summary:
    "上下文历史、任务状态和长期记忆应分开管理。什么信息值得长期保存、谁能读取、何时更新和删除都需要明确策略，不能把模型生成的用户推断无条件写成事实。",
  mechanism:
    "短期历史服务当前对话，摘要压缩信息但可能丢失或引入错误，长期记忆常作为可检索记录保存。记忆应有来源、置信度、版本、用户归属和保留期；跨租户检索与缓存隔离尤其重要。",
  steps: [
    "区分用户明确提供的事实、模型推断和临时任务状态，保存来源与更新时间。",
    "摘要与记忆写入经过验证，敏感信息最小化，并提供纠正删除路径。",
    "检索只返回当前身份允许的记忆，删除同步到索引、缓存与备份策略。",
  ],
  pitfalls: [
    "模型反复复述某推断并不会让它变成用户确认事实。",
    "删掉一条聊天记录不等于删除向量索引、摘要和长期记忆中的所有副本。",
  ],
  question: "为什么会话摘要不能直接当成可信用户档案？",
  scenario: "模型误记用户偏好并持续影响后续回答，怎样纠正？",
  answer:
    "定位记忆来源和写入规则，让用户确认或修正可持久信息，区分事实与推断。更新版本并使旧摘要、检索索引和缓存失效，测试修正后不再回流旧值。对敏感数据限制保留并支持明确删除，不把无限历史当记忆系统。",
  refs: ["llm-evals", "owasp-llm"],
  model: true,
  code: String.raw`memory=[{'user':'a','value':'python','confirmed':True},{'user':'a','value':'expert','confirmed':False},{'user':'b','value':'vue','confirmed':True}]
show([x['value'] for x in memory if x['user']=='a' and x['confirmed']])`,
  logs: [["python"]],
  explain:
    "示例只展示确认状态与用户隔离的过滤逻辑，没有自动从对话提取长期事实。真实系统需要验证写入、来源追溯与删除传播，可信 user 也应来自服务器认证上下文而不是模型参数。",
  choice: [
    "长期记忆应优先保存？",
    [
      "任何模型猜测",
      "有来源、归属和明确保存依据的信息",
      "所有原始凭据",
      "别的租户的相关信息",
    ],
    1,
    "可追溯和权限边界是记忆设计的基础。",
  ],
});
u("llmapp", {
  id: "llm-injection",
  title: "提示注入、数据投毒与最小权限",
  summary:
    "提示注入来自用户、网页、文档或工具结果中的恶意指令。仅过滤关键词或写“忽略恶意内容”不足以提供安全边界，应从身份、工具、数据和高影响操作执行层约束能力。",
  mechanism:
    "模型读取的不可信内容可能尝试改变任务或泄露信息。系统需要把外部内容作为数据，限制可见秘密、工具权限和输出流向；检索数据投毒还会污染回答证据。服务端鉴权与参数校验不因模型理由而绕过。",
  steps: [
    "区分可信指令与不可信数据，检索和工具结果保留来源与权限标签。",
    "工具只提供任务必要能力，敏感写操作设置业务确认与审计，避免任意执行。",
    "构建间接注入、跨租户泄露和恶意工具结果评估，监控真实失败并限制损害范围。",
  ],
  pitfalls: [
    "分隔符、关键词黑名单与低 temperature 都不是安全隔离机制。",
    "模型裁判也可能被输入影响，高影响授权不能只由另一个模型决定。",
  ],
  question: "为什么提示注入不能只通过 prompt 或前端过滤解决？",
  scenario: "检索到的网页要求模型发送密钥到某地址，系统应如何阻断？",
  answer:
    "从根本上不把密钥放进模型可见上下文，工具拒绝任意目标外发并按身份与允许来源校验。外部网页只作数据，服务端执行器不接受其权限声明。保留攻击样本加入评估，确认没有通过日志、引用或工具参数泄漏。",
  refs: ["owasp-llm", "llm-tools"],
  model: true,
  code: String.raw`task={'allowed_tools':{'search_docs'},'allow_external_send':False}
proposed={'tool':'send_secret','destination':'unknown'}
show(proposed['tool'] in task['allowed_tools'])
show(task['allow_external_send'])`,
  logs: [false, false],
  explain:
    "这是确定性能力边界模型，没有声称能检测所有恶意自然语言。真正防护在于根本不赋予不必要的秘密和动作权限，并在执行器与网络出口验证，而不是要求模型自己识别并拒绝每一次注入。",
  choice: [
    "提示注入防护最可靠的方向是？",
    [
      "只加黑名单",
      "最小权限、服务端鉴权与执行边界",
      "要求模型承诺安全",
      "隐藏按钮",
    ],
    1,
    "输入过滤只能辅助，实际能力与数据边界必须由系统约束。",
  ],
});
u("llmapp", {
  id: "llm-cost",
  title: "成本、延迟、缓存与模型路由",
  summary:
    "AI 成本来自输入输出、检索、重排、工具与重试等全链路。优化需要质量约束，不能只挑最便宜模型；缓存和路由还要考虑身份、数据版本与错误传播。",
  mechanism:
    "首字延迟、完整延迟和吞吐反映不同体验。缓存键应绑定模型、提示、检索版本和权限；相似问题缓存不一定安全复用。模型路由按任务难度或预算选择，但升级和回退都需要评估，失败重试共享总预算。",
  steps: [
    "记录每请求 usage、阶段延迟和费用估算，价格从运行配置读取并注明单位。",
    "先减少重复上下文和无效工具轮次，再评估缓存、批处理和模型分流。",
    "建立质量门禁和租户预算，缓存失效随数据更新与权限变更传播。",
  ],
  pitfalls: [
    "本页价格是教学假设，不是供应商报价；真实价格与计费口径需实时核对。",
    "跨用户共享答案缓存可能泄露数据，语义相似不代表权限相同。",
  ],
  question: "如何优化 AI 应用成本而不只靠换便宜模型？",
  scenario: "缓存命中率很高但回答旧信息且串用户，怎样调整？",
  answer:
    "重建缓存键维度，包含可信租户、权限、模型和知识版本，对撤权与更新主动失效。区分可共享公共答案与私有任务结果，并增加过期和来源日期。用质量、延迟与费用一起评估，不以命中率单一指标优化。",
  refs: ["llm-evals", "llm-tools"],
  model: true,
  code: String.raw`def cost(input_tokens,output_tokens,input_per_million,output_per_million):
    return (input_tokens*input_per_million+output_tokens*output_per_million)/1_000_000
show(round(cost(1000,500,2,8),6))`,
  logs: [0.006],
  explain:
    "2 和 8 是自行设定的每百万 token 教学价格，不对应任何真实模型，也未包含缓存、工具和税费。生产估算应使用当前配置、调用实际 usage 与供应商结算规则，并在并发调用前预留预算。",
  choice: [
    "安全答案缓存键通常需要包含？",
    [
      "只含用户问题文本",
      "身份/权限范围与知识、提示、模型版本",
      "只含日期",
      "只含输出字数",
    ],
    1,
    "相同文本问题在不同身份与版本下可能需要完全不同结果。",
  ],
  fill: {
    prompt:
      "按每百万 token 的输入与输出单价计算总成本；参数非负，不进行币种转换。",
    signature:
      "def estimate_cost(input_tokens, output_tokens, input_rate, output_rate):",
    solution:
      'def estimate_cost(input_tokens, output_tokens, input_rate, output_rate):\n    if min(input_tokens,output_tokens,input_rate,output_rate)<0:\n        raise ValueError("negative")\n    return (input_tokens*input_rate+output_tokens*output_rate)/1_000_000',
    tests: [
      ["输入输出", "assert abs(estimate_cost(1000,500,2,8)-0.006)<1e-12"],
      ["零用量", "assert estimate_cost(0,0,2,8)==0"],
    ],
    hint: "先统一每百万单位，不要把输入和输出都用同一个单价。",
  },
});
u("llmapp", {
  id: "llm-finetuning",
  title: "Prompt、RAG、微调与训练数据治理",
  summary:
    "提示、检索和微调是不同干预手段。新事实通常需要可靠数据与检索，稳定格式与任务行为可能受益于训练；应先有基线、错误分类和验证集，再决定是否微调。",
  mechanism:
    "预训练学习广泛分布，监督微调学习给定样例的任务映射，偏好优化使用偏好信号改变行为；具体算法和托管能力因平台而异。微调不会自动更新知识、修复越权或保证事实正确，训练数据质量与泄漏影响评估。",
  steps: [
    "收集真实失败并分类，先修输入、检索和确定性验证中可直接解决的问题。",
    "训练、验证和测试分离，去重近似样本并检查敏感信息、权限和来源。",
    "用独立任务集比较质量、鲁棒性、延迟与成本，版本化数据与模型并保留回滚。",
  ],
  pitfalls: [
    "把测试答案混入训练集会产生虚假提升。",
    "拿几条精挑示例的训练损失下降作为上线依据不充分；还要验证独立任务集、长尾场景和高影响失败，确认收益不是训练样本记忆。",
  ],
  question: "什么时候选择 RAG，什么时候考虑微调？",
  scenario: "知识库频繁更新，团队打算每天微调来同步事实，这样合理吗？",
  answer:
    "先评估可更新检索与结构化查询能否提供事实，频繁事实变化通常更适合数据与索引更新。微调用来改善稳定任务行为前仍需代表性训练数据和独立评估。将更新成本、延迟和引用要求一起比较，不把微调当数据库同步。",
  refs: ["llm-evals", "rag-paper"],
  model: true,
  code: String.raw`train={'a','b','c'}; validation={'c','d'}
show(sorted(train & validation))
show(not bool(train & {'e','f'}))`,
  logs: [["c"], true],
  explain:
    "精确 ID 交集检查能发现明显泄漏，真实数据还需要近似去重、同源文档和时间划分策略。示例没有训练模型，训练收益必须在独立真实任务集验证，不能用此集合操作替代数据治理。",
  choice: [
    "训练测试集重叠会造成？",
    ["更可信泛化", "评估泄漏与虚假提升", "自动提高安全性", "节省无需验证"],
    1,
    "需要独立评估与近似去重，防止记忆训练样本被误认为泛化。",
  ],
});
u("llmapp", {
  id: "llm-multimodal",
  title: "图像、文档、OCR、音频与多模态链路",
  summary:
    "多模态应用要处理采样、识别、上下文与来源，而不只是把文件转 Base64。图像分辨率、PDF 页面、音频分段和时间戳影响费用、延迟与答案可追溯性。",
  mechanism:
    "OCR 可能丢失表格、列顺序与字符，视觉模型也可能误读。文档处理应保存页码和区域，音频保存时间戳和说话人边界；超大文件需要有界分段。外部媒体仍是不可信输入，权限、格式与大小验证不能省略。",
  steps: [
    "按任务确定媒体预处理、页面或片段范围，保留原始来源与定位信息。",
    "验证文件大小与内容，区分识别置信、结构提取和最终回答质量。",
    "以低清、旋转、噪声、多列和跨页表格样本评估，关键业务结果人工复核。",
  ],
  pitfalls: [
    "Base64 会膨胀数据，不是压缩，也不代表文件有效或安全。",
    "OCR 文本可包含提示注入，不能因为来自图片就升级为可信指令。",
  ],
  question: "多模态问答如何保持引用到具体页面或时间段？",
  scenario: "PDF 表格识别把两列价格串行，模型回答错误，怎样定位？",
  answer:
    "保留页图、OCR 框和结构提取版本，先检查布局恢复而非直接责怪生成模型。对多列表格建立专门样本，必要时使用视觉或表格解析并核对单位。答案引用页码与区域，关键金额进入确定性校验和人工复核。",
  refs: ["llm-evals", "owasp-llm"],
  model: true,
  code: String.raw`segments=[{'page':1,'text':'A'},{'page':2,'text':'B'}]
show([{'source':'report.pdf','page':s['page'],'text':s['text']} for s in segments])
show(4*((5+2)//3))`,
  logs: [
    [
      { source: "report.pdf", page: 1, text: "A" },
      { source: "report.pdf", page: 2, text: "B" },
    ],
    8,
  ],
  explain:
    "页面映射保留引用定位，最后计算 5 字节数据的 Base64 长度为 8；未做真实 OCR 或模型识别。实际输入限制与计费依模型能力而异，需要验证完整文件和转换链，不应只看编码成功。",
  choice: [
    "Base64 编码通常意味着？",
    ["文件被压缩", "传输表示转换，通常增加体积", "保证图片无害", "自动 OCR"],
    1,
    "编码不负责压缩、内容验证或识别。",
  ],
});
u("llmapp", {
  id: "llm-deployment",
  title: "AI 服务上线、Trace、灰度与故障回退",
  summary:
    "AI 上线需要观察整条任务轨迹，而不只是模型响应。模型、提示、数据、索引、工具与配置共同构成版本；灰度、回滚、限额和事故回放要覆盖这些维度。",
  mechanism:
    "trace 关联检索、重排、模型和工具 span，usage 与延迟在同一请求下聚合。回退到其他模型可能改变能力与隐私边界，不应在失败时无条件把敏感数据发给任意供应商。线上监控与离线评估共同发现质量漂移。",
  steps: [
    "每次请求保存脱敏版本清单、阶段状态、延迟、usage 与工具动作结果。",
    "灰度按任务和租户分组，设置质量、安全、错误与费用门禁，失败可回滚。",
    "依赖故障时限流、熔断或返回可解释降级，保留未完成状态避免伪造成功。",
  ],
  pitfalls: [
    "只按 HTTP 200 统计 AI 成功率会漏掉无效答案和工具失败。",
    "完整 prompt 日志可能含个人与商业数据，需分级、脱敏和保留期。",
  ],
  question: "AI 应用一次发布应如何记录可回滚版本？",
  scenario: "换模型后投诉增加但错误率不变，应检查什么？",
  answer:
    "查看任务级成功、证据支持、拒答与工具结果，而不只看 HTTP 状态。按模型、提示、索引和租户分组回放代表性请求，比较发布前后评估。必要时回滚模型与相关配置，确保隐私与权限规则在降级路径同样生效。",
  refs: ["llm-evals", "llm-tools"],
  model: true,
  code: String.raw`release={'model':'configured-model','prompt':'p3','index':'docs-v7','tools':'t2'}
trace={'release':release,'retrieval_ms':40,'model_ms':500,'validated':True}
show(trace['release'])
show(trace['retrieval_ms']+trace['model_ms'])`,
  logs: [
    { model: "configured-model", prompt: "p3", index: "docs-v7", tools: "t2" },
    540,
  ],
  explain:
    "版本清单是示意值，不是模型推荐或真实测量。阶段求和只适用于本例顺序执行；实际 trace 要区分并行与关键路径，日志只保存需要的脱敏信息，并支持按同版本回放评估。",
  choice: [
    "HTTP 200 是否足以判断 AI 请求成功？",
    [
      "足够",
      "不足，还需任务结果、验证与工具状态",
      "只对流式足够",
      "输出非空就足够",
    ],
    1,
    "协议成功和任务成功是不同指标。",
  ],
});
u("llmapp", {
  id: "llm-capstone",
  title: "知识助手实战：采集、API、检索、回答与验收",
  summary:
    "一个完整 AI 知识助手作品应展示数据到答案的全过程、可恢复失败路径和可量化评估。先用确定性检索与替身验证管道，再接真实模型，能让问题定位更清晰。",
  mechanism:
    "本地站点提供受控样本，爬虫做范围限制、解析与 SQLite 幂等落库，REST API 提供分页与查询，检索返回带来源候选。生成适配器只接收授权证据，返回结果再做结构与引用校验；无证据时明确返回限制。",
  steps: [
    "运行配套本地项目，重复采集验证不重复入库，检查分页和来源字段。",
    "用固定查询测试命中与空结果，模拟拒绝、超时和无效引用，保持测试可复现。",
    "接入真实模型前配置密钥、预算与协议适配，建立独立评估集并记录完整版本。",
  ],
  pitfalls: [
    "确定性摘要或检索结果不能宣称是真实模型回答质量。",
    "作品只有正常演示而没有失败、越权和更新删除用例，不足以证明工程完整性。",
  ],
  question: "怎样为 Python + API + RAG 项目写可检验的验收标准？",
  scenario: "项目现场模型接口不可用，如何仍证明工程链路正确？",
  answer:
    "切换明确标记的确定性替身，展示本地采集、幂等存储、API 契约、检索和引用校验的独立测试。说明真实模型质量尚需在线评估，提供已记录的版本和测试集。把依赖不可用与业务逻辑失败分开，不能伪装替身为真实模型。",
  refs: ["py-test", "openapi", "llm-evals"],
  model: true,
  code: String.raw`checks={'ingest_idempotent':True,'api_contract':True,'retrieval_sources':True,'real_model_evaluated':False}
show(checks)
show(all(v for k,v in checks.items() if k!='real_model_evaluated'))`,
  logs: [
    {
      ingest_idempotent: true,
      api_contract: true,
      retrieval_sources: true,
      real_model_evaluated: false,
    },
    true,
  ],
  explain:
    "显式列出真实模型尚未评估，防止把离线样本成功等同于模型效果。配套项目可在本机运行采集、SQLite、HTTP API 和确定性查询；它是可扩展的工程练习起点，不会自动请求外部服务或消耗模型额度。",
  choice: [
    "演示模型接口不可用时，应如何展示？",
    [
      "把固定字符串冒充模型输出",
      "明确标记替身并展示独立链路验证",
      "删除所有失败日志",
      "宣称无需真实评估",
    ],
    1,
    "替身与真实能力必须区分，工程逻辑和模型质量分别验证。",
  ],
});
