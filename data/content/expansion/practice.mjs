import { fills } from "../examples/helpers.mjs";
function add(id, prompt, signature, body, tests, hint) {
  if (fills.has(id)) throw new Error("重复补全 " + id);
  fills.set(id, {
    id: "fill-" + id,
    type: "fill",
    language: "python",
    title: "补全 Python 代码",
    prompt,
    signature,
    starter: signature + "\n    # TODO\n    pass",
    solution: signature + "\n" + body,
    tests: tests.map(([name, code]) => ({ name, code })),
    hint,
    explanation:
      prompt +
      " 参考解把约定写成确定性逻辑，测试覆盖正常与边界输入；这些用例不证明网络、数据库或模型环境本身正确。",
  });
}
add(
  "py-scope",
  "返回 n 个零参函数，第 i 个调用返回 i，i 从 0 开始；n 为非负整数。",
  "def make_callbacks(n):",
  "    return [lambda i=i: i for i in range(n)]",
  [
    ["晚绑定隔离", "assert [f() for f in make_callbacks(3)]==[0,1,2]"],
    ["空", "assert make_callbacks(0)==[]"],
  ],
  "用默认参数绑定当轮的值。",
);
add(
  "py-exceptions",
  "把十进制整数字符串转换为 int，ValueError 时返回 default，不吞掉其他异常。",
  "def parse_integer(text, default=None):",
  "    try:\n        return int(text)\n    except ValueError:\n        return default",
  [
    ["合法零", "assert parse_integer('0',99)==0"],
    ["非法输入", "assert parse_integer('x',7)==7"],
    ["缺省", "assert parse_integer('') is None"],
  ],
  "精确捕获 ValueError。",
);
add(
  "py-unicode",
  "返回文本的 UTF-8 字节数，不是字符数量。",
  "def utf8_size(text):",
  "    return len(text.encode('utf-8'))",
  [
    ["汉字", "assert utf8_size('中文')==6"],
    ["ASCII 和空", "assert utf8_size('abc')==3 and utf8_size('')==0"],
    ["emoji", "assert utf8_size('😀')==4"],
  ],
  "先编码，再统计字节。",
);
add(
  "py-serialization",
  "把 JSON 字符串解析成对象，且只接受顶层字典，否则抛 ValueError。",
  "def json_object(text):",
  "    import json\n    value=json.loads(text)\n    if not isinstance(value,dict):\n        raise ValueError('object required')\n    return value",
  [
    ["对象", "assert json_object('{\"n\":2}')=={'n':2}"],
    [
      "拒绝数组",
      "try:\n    json_object('[]')\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('object only')",
    ],
  ],
  "语法解析后继续验证顶层类型。",
);
add(
  "py-testing",
  "返回非空数字列表的平均数；空列表抛 ValueError，不修改输入。",
  "def mean(values):",
  "    if not values:\n        raise ValueError('empty')\n    return sum(values)/len(values)",
  [
    ["平均与不修改", "x=[1,2,3]; assert mean(x)==2 and x==[1,2,3]"],
    [
      "空值异常",
      "try:\n    mean([])\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('empty')",
    ],
  ],
  "分别验证计算、输入所有权和空值契约。",
);
add(
  "py-performance",
  "统计可哈希值出现次数，返回字典，空输入返回空字典。",
  "def frequencies(values):",
  "    result={}\n    for value in values:\n        result[value]=result.get(value,0)+1\n    return result",
  [
    ["重复", "assert frequencies(['a','b','a'])=={'a':2,'b':1}"],
    ["空和零", "assert frequencies([])=={} and frequencies([0,0])=={0:2}"],
  ],
  "使用字典按键累计，避免每次全列表 count。",
);
add(
  "crawl-pagination",
  "将多页列表按页顺序合并并对可哈希记录保序去重。",
  "def merge_pages(pages):",
  "    seen=set(); result=[]\n    for page in pages:\n        for item in page:\n            if item not in seen:\n                seen.add(item); result.append(item)\n    return result",
  [
    ["重复页", "assert merge_pages([[1,2],[2,3]])==[1,2,3]"],
    ["空页", "assert merge_pages([[],[1],[]])==[1]"],
  ],
  "记录首次出现顺序，seen 只用于判断。",
);
add(
  "crawl-encoding",
  "返回 Content-Type 中小写媒体类型，忽略分号后的参数与首尾空格。",
  "def media_type(header):",
  "    return header.split(';',1)[0].strip().lower()",
  [
    [
      "带参数",
      "assert media_type(' Application/JSON; charset=utf-8 ' )=='application/json'",
    ],
    [
      "无参数与空",
      "assert media_type('text/html')=='text/html' and media_type('')==''",
    ],
  ],
  "参数与媒体类型分开处理。",
);
add(
  "crawl-quality",
  "返回指定字段不是 None 的记录比例，空列表按本题契约返回 0.0；缺字段也算无效。",
  "def valid_ratio(records, field):",
  "    return sum(row.get(field) is not None for row in records)/len(records) if records else 0.0",
  [
    ["零值合法", "assert valid_ratio([{'n':0},{'n':None},{}],'n')==1/3"],
    ["空", "assert valid_ratio([],'n')==0.0"],
  ],
  "不要把合法的 0 和空字符串一律当成 None。",
);
add(
  "crawl-storage",
  "按 id 对字典记录去重，后出现的记录覆盖值，结果保留 ID 首次出现顺序；不修改输入。",
  "def upsert_records(records):",
  "    result={}\n    for row in records:\n        result[row['id']]=dict(row)\n    return list(result.values())",
  [
    [
      "覆盖但保序",
      "assert upsert_records([{'id':'a','n':1},{'id':'b','n':2},{'id':'a','n':3}])==[{'id':'a','n':3},{'id':'b','n':2}]",
    ],
    ["空", "assert upsert_records([])==[]"],
  ],
  "字典保留首次插入顺序，覆盖值不会移动键。",
);
add(
  "crawl-incremental",
  "输入 rows 为 (timestamp,id) 元组，返回严格大于 watermark 的记录，保留输入顺序。",
  "def after_watermark(rows, watermark):",
  "    return [row for row in rows if row>watermark]",
  [
    [
      "相同时间 ID",
      "assert after_watermark([(10,'a'),(10,'b'),(11,'a')],(10,'a'))==[(10,'b'),(11,'a')]",
    ],
    ["空", "assert after_watermark([],(0,''))==[]"],
  ],
  "元组按时间再按 ID 比较。",
);
add(
  "rest-resources",
  "根据 transitions 中的集合判断 old 到 new 是否允许；未知 old 返回 False。",
  "def can_transition(transitions, old, new):",
  "    return new in transitions.get(old,set())",
  [
    [
      "合法与非法",
      "assert can_transition({'draft':{'published'}},'draft','published') and not can_transition({'draft':{'published'}},'draft','paid')",
    ],
    ["未知状态", "assert not can_transition({},'x','y')"],
  ],
  "仅按允许集合判断，不推断额外状态。",
);
add(
  "rest-methods",
  "按本题 HTTP 安全方法集合 GET/HEAD/OPTIONS/TRACE 判断，输入方法大小写不敏感。",
  "def is_safe_method(method):",
  "    return method.upper() in {'GET','HEAD','OPTIONS','TRACE'}",
  [
    ["读取方法", "assert is_safe_method('get') and is_safe_method('HEAD')"],
    [
      "写入方法",
      "assert not is_safe_method('POST') and not is_safe_method('DELETE')",
    ],
  ],
  "安全意图与是否支持该方法是两回事。",
);
add(
  "rest-status",
  "HEAD、1xx、204、304 响应按本题规则不应有内容体；其他状态返回 True。",
  "def body_allowed(method, status):",
  "    return method.upper()!='HEAD' and not (100<=status<200 or status in {204,304})",
  [
    [
      "无 body",
      "assert not body_allowed('HEAD',200) and not body_allowed('GET',204) and not body_allowed('GET',304)",
    ],
    ["正常", "assert body_allowed('GET',200) and body_allowed('POST',400)"],
  ],
  "先排除 HEAD，再排除无内容状态。",
);
add(
  "rest-pagination",
  "已排序元组 rows 中返回严格大于 after 的前 limit 项；limit 非负。",
  "def cursor_page(rows, after, limit):",
  "    if limit<0:\n        raise ValueError('limit')\n    return [row for row in rows if row>after][:limit]",
  [
    [
      "稳定边界",
      "assert cursor_page([(1,'a'),(1,'b'),(2,'a')],(1,'a'),1)==[(1,'b')]",
    ],
    ["零", "assert cursor_page([(1,'a')],(0,''),0)==[]"],
  ],
  "过滤排序边界后按 limit 截取。",
);
add(
  "rest-auth",
  "actor 与 resource 租户相同且 actor.id 等于 resource.owner 才允许访问；字典字段已验证存在。",
  "def can_access(actor, resource):",
  "    return actor['tenant']==resource['tenant'] and actor['id']==resource['owner']",
  [
    [
      "自己的",
      "assert can_access({'id':'a','tenant':'t'},{'owner':'a','tenant':'t'})",
    ],
    [
      "跨用户和租户",
      "assert not can_access({'id':'a','tenant':'t'},{'owner':'b','tenant':'t'}) and not can_access({'id':'a','tenant':'t'},{'owner':'a','tenant':'other'})",
    ],
  ],
  "身份必须来自可信服务器上下文，本题只验证归属谓词。",
);
add(
  "llm-agents",
  "只要步骤达到 max_steps、花费达到 budget 或重复状态 repeated 为真就应停止。",
  "def should_stop(steps, max_steps, spent, budget, repeated):",
  "    return steps>=max_steps or spent>=budget or repeated",
  [
    [
      "步骤与预算",
      "assert should_stop(5,5,1,10,False) and should_stop(1,5,10,10,False)",
    ],
    [
      "重复与正常",
      "assert should_stop(1,5,1,10,True) and not should_stop(1,5,1,10,False)",
    ],
  ],
  "任一停止条件满足就终止，不使用 all。",
);
add(
  "llm-memory",
  "只返回属于 user 且 confirmed 为 True 的记忆 value，保留顺序。",
  "def confirmed_memory(records, user):",
  "    return [r['value'] for r in records if r['user']==user and r['confirmed'] is True]",
  [
    [
      "隔离与确认",
      "assert confirmed_memory([{'user':'a','confirmed':True,'value':1},{'user':'b','confirmed':True,'value':2},{'user':'a','confirmed':False,'value':3}],'a')==[1]",
    ],
    ["空", "assert confirmed_memory([],'a')==[]"],
  ],
  "同时满足用户与确认条件才可返回。",
);
add(
  "llm-finetuning",
  "返回训练 ID 与测试 ID 的交集，去重后按字典序排序。",
  "def leaked_ids(train_ids, test_ids):",
  "    return sorted(set(train_ids)&set(test_ids))",
  [
    ["泄漏", "assert leaked_ids(['a','c','c'],['b','c'])==['c']"],
    ["无交集", "assert leaked_ids(['a'],['b'])==[]"],
  ],
  "集合交集检查精确重复，近似去重另需设计。",
);
add(
  "llm-deployment",
  "按 model/prompt/index/tools 顺序生成版本元组，缺任一字段时保留 KeyError。",
  "def release_key(release):",
  "    return tuple(release[key] for key in ['model','prompt','index','tools'])",
  [
    [
      "固定顺序",
      "assert release_key({'tools':'t','index':'i','prompt':'p','model':'m'})==('m','p','i','t')",
    ],
    [
      "缺字段",
      "try:\n    release_key({})\nexcept KeyError:\n    pass\nelse:\n    raise AssertionError('missing')",
    ],
  ],
  "不要依赖输入字典的字段插入顺序。",
);
