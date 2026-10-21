import { unit as u } from "./common.mjs";
u("python", {
  id: "py-environment",
  title: "解释器、虚拟环境与依赖可复现",
  summary:
    "Python 项目的可复现单位是解释器版本、依赖解析结果和系统环境，不是把 requirements.txt 发给同事就完成了交付。浏览器运行器使用独立的 CPython WebAssembly 环境。",
  mechanism:
    "venv 隔离第三方包安装路径，不隔离操作系统和 CPU 指令集。pip 安装目标由所用解释器决定，用 python -m pip 可以降低 pip 指向另一环境的风险；锁文件还需配合解释器、平台和安装索引。",
  steps: [
    "开发时创建 .venv，记录最低 Python 版本，优先用 python -m pip 调用当前环境的安装器。",
    "区分项目直接依赖、开发依赖和锁定后的完整解析结果，持续集成从干净环境重装。",
    "记录系统库与环境变量名称，密钥只从运行环境读取；发布时固定构建产物并执行启动检查。",
  ],
  pitfalls: [
    "虚拟环境目录不可跨机器直接复制，路径和二进制轮子可能失效；应该重建环境。",
    "本页 sys.platform 在浏览器中是 emscripten，不能把它当作本机操作系统或网络运行环境。",
  ],
  question: "venv、pip、pyproject.toml 和锁文件分别解决什么问题？",
  scenario: "本地脚本正常，部署后提示模块找不到或二进制不兼容，怎么定位？",
  answer:
    "先输出解释器路径与版本、包搜索路径和目标包版本，确认启动命令使用同一虚拟环境。再核对 wheel 的 Python ABI、系统架构和系统库，避免盲目反复 pip install。用全新环境重建并运行最小导入测试，把安装步骤和配置纳入持续集成。",
  refs: ["py-packaging", "pyodide"],
  code: String.raw`import sys
from pathlib import PurePosixPath
show(sys.version_info >= (3, 11))
show(PurePosixPath('src/app/main.py').suffix)
show({'requires_python': '>=3.11', 'isolated_dependencies': True})`,
  logs: [
    true,
    ".py",
    { requires_python: ">=3.11", isolated_dependencies: true },
  ],
  explain:
    "版本比较验证了这份资料的语言基线，PurePosixPath 仅做路径运算，没有读取你的硬盘。浏览器解释器与系统 python3 是两个环境；安装 requests 等第三方包应在本地项目虚拟环境进行，不能因这里能 import 标准库就推断部署依赖齐全。",
  choice: [
    "哪条命令能明确使用当前 Python 对应的 pip？",
    [
      "pip3 install x",
      "python -m pip install x",
      "复制别人 .venv",
      "只改 PATH 不检查版本",
    ],
    1,
    "python -m pip 明确把 pip 作为当前解释器模块执行，仍需确认当前解释器就是项目虚拟环境。",
  ],
});
u("python", {
  id: "py-objects",
  title: "对象、绑定、可变性与深浅拷贝",
  summary:
    "变量名绑定对象，赋值通常不复制对象。is 比较身份，== 比较值；容器浅拷贝只创建外层结构，内部可变元素仍可能共享。",
  mechanism:
    "函数参数也是对象引用的绑定。修改列表内容能被外部观察，重新给局部参数赋值则不会替换调用者的名字。不可变元组仍可包含可变列表；深拷贝的 memo 用于处理循环和共享引用，不等于可以复制任意资源。",
  steps: [
    "画出变量到对象的引用关系，再判断操作是在修改对象还是创建并重新绑定。",
    "为缓存、默认配置和返回值明确所有权，避免把内部可变状态直接暴露出去。",
    "按业务选择浅拷贝、深拷贝或不可变数据，加入嵌套修改与引用别名用例。",
  ],
  pitfalls: [
    "不要用 is 比较字符串或整数的业务值，小整数缓存和字符串驻留是实现细节。",
    "复制文件句柄、连接与锁不等于获得独立资源；不要以 deepcopy 代替资源生命周期设计。",
  ],
  question: "为什么修改参数列表生效，但重新给参数赋值不改变外部变量？",
  scenario: "多个用户的默认配置互相污染，怎么确认是引用共享问题？",
  answer:
    "用两个独立用户请求复现，分别观察配置外层和内部列表的身份以及写入位置。确认是否复用了模块级字典或只做了外层 copy。用工厂创建新对象或对必要层级复制，添加一个用户修改后另一个用户不变的回归测试。",
  refs: ["py-types", "py-classes"],
  code: String.raw`import copy
original = {'tags': ['a']}
shallow = original.copy()
deep = copy.deepcopy(original)
shallow['tags'].append('b')
show(original)
show(deep)
show(original is shallow)`,
  logs: [{ tags: ["a", "b"] }, { tags: ["a"] }, false],
  explain:
    "外层字典是新对象，所以身份不同；浅拷贝内的 tags 仍指向同一个列表，原对象随之变化。深拷贝在本例中隔离了列表。把值相等和对象身份分别打印，能避免用一个比较运算符解释所有复制行为。",
  choice: [
    "dict.copy() 对嵌套列表的行为是？",
    ["递归复制所有对象", "共享内部列表引用", "自动冻结列表", "转成不可变元组"],
    1,
    "dict.copy() 只复制外层字典；嵌套元素引用仍然共享。",
  ],
  fill: {
    prompt:
      "实现 shallow_list_copy：返回新列表，但列表内元素保持原引用；不要用 deepcopy。",
    signature: "def shallow_list_copy(values):",
    solution: "def shallow_list_copy(values):\n    return list(values)",
    tests: [
      ["内容相等", "assert shallow_list_copy([1,2]) == [1,2]"],
      [
        "外层新对象、内部引用保留",
        "x=[[]]; y=shallow_list_copy(x); assert y is not x and y[0] is x[0]",
      ],
      ["空列表", "assert shallow_list_copy([]) == []"],
    ],
    hint: "list(...) 或切片可以创建新的外层列表。",
  },
});
u("python", {
  id: "py-containers",
  title: "列表、字典、集合与复杂度选择",
  summary:
    "列表适合有序序列，字典适合按键索引，集合适合去重与成员判断。选择结构时同时考虑顺序、可哈希性和复杂度，不能把常见的均摊开销说成最坏情况保证。",
  mechanism:
    "dict 保留插入顺序，set 不提供可依赖的业务排序。字典键和集合元素需要满足哈希与相等关系的契约；可变列表不能直接作为键。列表头部删除会移动元素，队列更适合 collections.deque。",
  steps: [
    "先明确查询、插入、删除和遍历的比例，以及结果是否必须稳定排序。",
    "保序去重可用字典或 seen 集合配合列表，复杂对象先提取业务键。",
    "压测真实数据规模，检查哈希碰撞、长键和内存占用；不要只比较几次微秒计时。",
  ],
  pitfalls: [
    "set 转 list 的顺序不应作为展示顺序或分页游标；排序需要显式规则。",
    "字典平均常数时间不代表没有扩容和冲突成本；可变对象的 hash 契约不能随内容破坏。",
  ],
  question: "如何实现保序去重，为什么不能简单返回 list(set(values))？",
  scenario: "任务队列用 list.pop(0) 后随着任务变多越来越慢，怎样改？",
  answer:
    "分析操作热点而非只看总耗时。list 头部删除需要移动后续元素，改用 deque.popleft 并限制队列容量。保留任务顺序与错误处理契约，记录不同队列长度下的吞吐和内存，同时处理生产速度大于消费速度时的背压。",
  refs: ["py-types"],
  code: String.raw`from collections import deque
values = ['b', 'a', 'b', 'c']
show(list(dict.fromkeys(values)))
queue = deque([1, 2, 3])
show(queue.popleft())
show(list(queue))`,
  logs: [["b", "a", "c"], 1, [2, 3]],
  explain:
    "字典记录首次插入顺序，因此保留 b、a、c 的顺序；deque 的头部删除适合队列。此方法要求元素可哈希，嵌套列表应转为业务键或改用明确的比较策略，不应为了去重随意把对象转字符串。",
  choice: [
    "需要保留首次出现顺序的字符串去重应选？",
    [
      "list(set(xs)) 并依赖顺序",
      "list(dict.fromkeys(xs))",
      "每次随机重排",
      "直接 sorted 会保留原始顺序",
    ],
    1,
    "dict 的插入顺序适合保序去重；排序会改变原始顺序。",
  ],
  fill: {
    prompt: "对可哈希值保序去重，返回首次出现顺序的列表。",
    signature: "def stable_unique(values):",
    solution:
      "def stable_unique(values):\n    return list(dict.fromkeys(values))",
    tests: [
      ["重复和顺序", "assert stable_unique(['b','a','b']) == ['b','a']"],
      ["空输入", "assert stable_unique([]) == []"],
      ["数字零", "assert stable_unique([0,2,0,1]) == [0,2,1]"],
    ],
    hint: "dict.fromkeys 按首次插入顺序建立键。",
  },
});
u("python", {
  id: "py-functions",
  title: "函数签名、默认参数与参数绑定",
  summary:
    "函数签名是输入契约。默认参数在定义函数时求值，可变默认值会跨调用共享；位置专用、关键字专用和可变参数用于明确 API 的调用方式。",
  mechanism:
    "def f(a, /, b, *, c) 让 a 只能按位置传、c 只能按关键字传。*args 收集额外位置参数，**kwargs 收集额外关键字参数。默认列表只创建一次，不是每次调用自动重建；用 None 哨兵再在函数内创建。",
  steps: [
    "给重要选项使用关键字专用参数，降低布尔实参位置混淆带来的维护成本。",
    "明确缺省、显式 None 和空容器是否不同，必要时创建独立的 sentinel 对象。",
    "验证重复绑定、缺参数和未知参数，装饰器或适配器不要悄悄吞掉参数错误。",
  ],
  pitfalls: [
    "kwargs 默认值为 {} 同样共享；不要只修 list 却忽略 dict、set。",
    "None 是否表示缺省由业务定义；需要区分 None 值时使用独立哨兵。",
  ],
  question: "Python 的默认参数为什么会导致跨调用数据泄漏？",
  scenario: "一个收集日志函数第二次调用包含第一次的结果，如何修复并验证？",
  answer:
    "检查函数定义里的默认列表，以及是否将模块级容器用作默认参数。把缺省设为 None，在调用时创建列表；如果调用者传入列表，要明确是否原地修改。分别测试两次缺省调用和一次显式传入容器，确保生命周期符合契约。",
  refs: ["py-functions"],
  code: String.raw`def add(value, items=None):
    items = [] if items is None else list(items)
    items.append(value)
    return items
show(add('a'))
show(add('b'))
show(add('c', ['x']))`,
  logs: [["a"], ["b"], ["x", "c"]],
  explain:
    "缺省分支每次创建列表，显式传入的列表也被外层复制，因此不会修改调用者容器。复制只解决本函数的外层追加，若修改内部嵌套元素，仍需重新分析所有权；不能把 None 哨兵误解为自动深拷贝。",
  choice: [
    "可变默认参数何时创建？",
    ["每次调用时", "函数定义执行时", "首次 return 时", "每个线程各一份"],
    1,
    "默认表达式在定义函数时求值，通常被所有缺省调用共享。",
  ],
  fill: {
    prompt:
      "append_item 返回追加 value 后的新列表；不修改传入列表，缺省调用互不共享。",
    signature: "def append_item(value, items=None):",
    solution:
      "def append_item(value, items=None):\n    return ([] if items is None else list(items)) + [value]",
    tests: [
      ["缺省隔离", "assert append_item(1)==[1] and append_item(2)==[2]"],
      ["不改原列表", "x=[1]; assert append_item(2,x)==[1,2] and x==[1]"],
    ],
    hint: "先建立新列表，再追加值。",
  },
});
u("python", {
  id: "py-scope",
  title: "LEGB、闭包与循环变量晚绑定",
  summary:
    "名字解析遵循局部、外层函数、模块全局和内置作用域。闭包通常保存变量绑定，而非创建函数时变量值的快照，因此循环中创建回调时要分析晚绑定。",
  mechanism:
    "函数内出现赋值会影响编译器对该名字的局部判定，先读后赋可能触发 UnboundLocalError。nonlocal 修改最近外层函数绑定，global 指向模块作用域；默认参数可以在回调构造时绑定当时的值。",
  steps: [
    "画出每层函数的自由变量与局部变量，不通过修改全局状态掩盖作用域错误。",
    "循环创建延迟回调时使用工厂函数或默认参数绑定当前值。",
    "用多个独立闭包测试状态是否互相隔离，对共享状态补并发访问约束。",
  ],
  pitfalls: [
    "闭包保持引用可能延长对象生命，不代表每个闭包都会泄漏内存。",
    "列表推导式在现代 Python 有自己的作用域，但其中 lambda 仍可能共享同一轮迭代变量绑定。",
  ],
  question: "为什么 [lambda: i for i in range(3)] 的结果经常都是 2？",
  scenario: "批量注册任务回调后所有任务都操作最后一个 ID，怎么改？",
  answer:
    "确认回调何时执行和自由变量在哪一层绑定。用 lambda item_id=item_id 或工厂函数捕获当时 ID，再让测试延迟执行全部回调。若回调还共享列表、连接等对象，需要分别处理可变状态和生命周期，不能只固定一个整数就宣称线程安全。",
  refs: ["py-classes", "py-functions"],
  code: String.raw`late = [lambda: i for i in range(3)]
bound = [lambda i=i: i for i in range(3)]
show([f() for f in late])
show([f() for f in bound])`,
  logs: [
    [2, 2, 2],
    [0, 1, 2],
  ],
  explain:
    "两组函数都延迟执行，差异在绑定位置。late 读取同一个循环变量最终值，bound 把当轮整数放入各自的默认参数。本例不依赖线程调度，适合先确认语义，再处理异步任务里的状态隔离。",
  choice: [
    "循环回调保存当前整数 i 的一种方法是？",
    ["lambda: i", "lambda i=i: i", "global i", "sleep 后再绑定"],
    1,
    "默认参数在创建函数时求值，从而固定当前整数值。",
  ],
});
u("python", {
  id: "py-iterators",
  title: "可迭代对象、迭代器、生成器与惰性消费",
  summary:
    "可迭代对象能生成迭代器，迭代器维护消费进度，生成器按需执行并保存暂停状态。惰性只减少同时物化的数据，不保证整条管道自动有界或可重复读取。",
  mechanism:
    "iter(obj) 获取迭代器，next 取下一项，结束以 StopIteration 表示。yield 暂停函数并保留局部状态；生成器常为一次性消费。列表推导式立即构造列表，生成器表达式按消费者需求产生值。",
  steps: [
    "在文件、游标和采集结果管道中明确数据源能否重新遍历。",
    "使用 itertools.islice 等工具限制消费范围，同时限制上游缓冲区和下游积压。",
    "有资源的生成器应通过上下文或 close 确保提前退出时释放，不依赖垃圾回收时机。",
  ],
  pitfalls: [
    "为了统计长度先 list(generator) 会消耗数据并可能占满内存。",
    "把文件打开写在生成器外部后提前关掉，后续迭代会访问已关闭资源。",
  ],
  question: "生成器和列表推导式在执行时机、内存与可重用性上有何区别？",
  scenario: "同一个采集结果生成器先统计再写文件，最终文件为空，为什么？",
  answer:
    "第一次统计已经消费了迭代器。根据数据量选择一次遍历同时计数与写入，或者以可重新打开的源创建两个迭代器。需要多路消费时评估缓存增长，而不是盲目 tee；给空源、部分消费和提前异常设计测试。",
  refs: ["py-types", "py-functions"],
  code: String.raw`from itertools import islice
values = (n * n for n in range(6))
show(list(islice(values, 3)))
show(list(values))
show(list(values))`,
  logs: [[0, 1, 4], [9, 16, 25], []],
  explain:
    "第一次只消费三个元素，第二次继续消费剩余值，第三次迭代器已经耗尽。这演示的是单个生成器的状态，不是 range 本身不能重复遍历；重新创建生成器就会得到新的消费进度。",
  choice: [
    "同一个生成器完全遍历后再次 list(g) 会？",
    ["从头再来", "返回空列表", "自动抛出网络错误", "复制旧结果"],
    1,
    "耗尽的生成器不会自动恢复，需要重新创建或缓存。",
  ],
  fill: {
    prompt: "返回输入 iterable 的前 n 个值，不消费后面的元素；n 需非负。",
    signature: "def take(iterable, n):",
    solution:
      'def take(iterable, n):\n    if n < 0:\n        raise ValueError("n")\n    from itertools import islice\n    return list(islice(iterable, n))',
    tests: [
      ["部分消费", "g=iter([1,2,3]); assert take(g,2)==[1,2] and next(g)==3"],
      ["零与短输入", "assert take([1],0)==[] and take([1],3)==[1]"],
    ],
    hint: "islice 支持对迭代器做有界消费。",
  },
});
u("python", {
  id: "py-decorators",
  title: "装饰器、wraps 与缓存键设计",
  summary:
    "装饰器接收对象并返回包装后的对象，函数装饰语法不是额外的运行魔法。包装器需要保留签名相关元信息，并明确同步、异步、异常与状态共享的行为。",
  mechanism:
    "@deco 大致等于 f = deco(f)，多个装饰器从内向外组合。functools.wraps 保存名称、文档及 __wrapped__，供检查工具追溯；lru_cache 按可哈希实参缓存，缓存键若漏掉租户或版本会返回错误数据。",
  steps: [
    "给日志、鉴权、重试装饰器明确进入、返回和异常路径，避免改变业务错误。",
    "异步函数要用 async 包装并 await，普通包装器返回协程不等于真正观测了执行完成。",
    "为缓存设置容量、失效规则和隔离键，检查参数可哈希性及缓存对象的生命周期。",
  ],
  pitfalls: [
    "wraps 不会自动修复错误的参数转发，也不会使包装器线程安全。",
    "缓存网络结果而不区分权限、配置版本和有效期，可能返回越权或过期数据。",
  ],
  question: "wraps 解决什么问题，它能自动让异步装饰器正确吗？",
  scenario: "加了重试装饰器以后日志显示调用成功但协程后来失败，怎样排查？",
  answer:
    "检查包装器是否只是调用 async 函数得到协程就返回，实际 await 是否发生在观测范围之外。把异常捕获和计时放在 await 周围，明确哪些失败可以重试，保留 cancellation。分别测试同步异常、异步拒绝、正常返回和取消。",
  refs: ["py-functions", "py-typing"],
  code: String.raw`from functools import wraps, lru_cache
def traced(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapped
@traced
def add(a, b): return a + b
show(add.__name__)
show(add(2, 3))`,
  logs: ["add", 5],
  explain:
    "被调用的是 wrapped，但 wraps 保留 add 的名称并建立 __wrapped__ 链。返回值由显式 return 转发；若遗漏 return，调用就会得到 None。缓存和重试同样是契约变换，应检查失效、异常和副作用，而不是只看装饰器语法是否短。",
  choice: [
    "functools.wraps 主要帮助？",
    ["自动重试", "保留被包装函数元信息", "自动 await 所有返回值", "禁止副作用"],
    1,
    "wraps 改善元信息和可追溯性，不自动改正业务逻辑。",
  ],
});
u("python", {
  id: "py-context",
  title: "with、上下文管理与资源释放",
  summary:
    "上下文管理把资源获取和清理绑定到一个词法范围。退出块时无论正常返回还是异常，都应按契约释放资源；是否吞掉异常必须由上下文管理器明确决定。",
  mechanism:
    "with 调用 __enter__ 和 __exit__，后者收到异常信息；返回真值可抑制异常。contextlib.contextmanager 用 yield 分隔进入与退出，finally 提供清理路径。异步资源对应 async with 和异步清理，不应混用同步阻塞 I/O。",
  steps: [
    "对连接、文件、锁和临时目录明确唯一拥有者和释放责任。",
    "清理放在 finally，事务的提交和回滚必须区别成功与失败路径。",
    "测试块内主动抛异常、提前 return 和部分初始化失败，确保资源不泄露。",
  ],
  pitfalls: [
    "__exit__ 返回 True 可能吞掉业务异常，不能为了日志漂亮统一返回 True。",
    "with 自动退出不表示数据库自动提交策略正确，需理解具体驱动的事务语义。",
  ],
  question: "with 为什么能在异常时清理资源，哪些情况会抑制异常？",
  scenario: "采集程序异常后连接池耗尽，如何定位资源生命周期？",
  answer:
    "沿创建连接到归还连接的路径检查每个退出分支，确认重试循环有没有持有旧连接。把资源范围缩小，用上下文包住一次请求或一次事务；加入获取后异常的测试，观测活跃连接与等待者数量，而不是只提高池大小。",
  refs: ["py-context"],
  code: String.raw`from contextlib import contextmanager
events=[]
@contextmanager
def resource():
    events.append('open')
    try: yield 'handle'
    finally: events.append('close')
try:
    with resource(): raise ValueError('bad')
except ValueError: events.append('caught')
show(events)`,
  logs: [["open", "close", "caught"]],
  explain:
    "异常从 with 块抛出后，finally 先执行 close，再由外层捕获。示例资源是事件列表，因此不会接触真实文件或连接；真实资源也应让清理发生在同样的结构位置，并防止清理异常覆盖原始故障证据。",
  choice: [
    "__exit__ 返回 True 通常意味着？",
    ["重新抛出异常", "抑制当前块异常", "强制关闭进程", "自动提交所有事务"],
    1,
    "返回真值会抑制传入的异常，必须谨慎使用。",
  ],
});
u("python", {
  id: "py-exceptions",
  title: "异常分类、异常链与可恢复边界",
  summary:
    "异常处理应按能否恢复来分层。输入错误、暂态依赖错误和编程错误需要不同策略；保留原始异常链，避免把所有故障都转换成空结果或无限重试。",
  mechanism:
    "except 按类型匹配，else 在 try 正常结束后执行，finally 无论结果如何执行。raise NewError(...) from exc 表达因果链；BaseException 还包含系统退出等控制信号，业务处理通常捕获 Exception 的具体子类。",
  steps: [
    "在边界把底层错误转换成稳定领域错误，内部保留类型、cause 和上下文。",
    "只对明确的暂态失败重试，为次数、总时间和非幂等副作用设置边界。",
    "对部分成功返回结构化结果，区分没有数据、无法访问与解析失败。",
  ],
  pitfalls: [
    "except: pass 会掩盖取消、退出和业务错误，让失败伪装成成功。",
    "finally 中 return 会覆盖原有返回值和异常，应把清理与业务决策分开。",
  ],
  question: "何时转换异常，为什么应该保留异常链？",
  scenario: "采集任务报表全部显示成功但结果都是空列表，怎么定位？",
  answer:
    "追踪空结果从哪个分支返回，重点检查宽泛 except 和统一默认值。用一个固定坏输入验证错误是否可见；把成功空集、请求失败和解析失败分开计数，保存可重放的脱敏样本，并为无法恢复的编程错误终止任务。",
  refs: ["py-context", "py-test"],
  code: String.raw`def parse(value):
    try: return int(value)
    except ValueError as exc:
        raise RuntimeError('invalid quantity') from exc
try: parse('x')
except RuntimeError as exc:
    show(type(exc.__cause__).__name__)
    show(str(exc))`,
  logs: ["ValueError", "invalid quantity"],
  explain:
    "RuntimeError 是外层稳定描述，__cause__ 保留底层 ValueError。没有把失败转换成 0，因此调用者还能区分非法输入和合法的零值。日志应补记录标识与阶段，不应为了完整上下文直接输出令牌或完整个人数据。",
  choice: [
    "哪种写法最容易掩盖真实故障？",
    [
      "捕获 ValueError 并抛领域异常",
      "except Exception: return [] 且无故障记录",
      "finally 释放句柄",
      "raise ... from exc",
    ],
    1,
    "统一空列表会让无法访问和业务空结果无法区分。",
  ],
});
u("python", {
  id: "py-oop",
  title: "类、组合、描述符与对象协议",
  summary:
    "Python 的面向对象不只依赖继承，还依赖协议和特殊方法。属性访问、迭代、比较和上下文可以由协议实现；业务设计通常先明确职责，再选择组合或继承。",
  mechanism:
    "实例方法通过描述符把实例绑定为第一个参数。property 把受控访问暴露为属性，类属性和实例属性的生命周期不同。多重继承按 MRO 查找，super 沿 MRO 协作，并不是简单指向文本上的父类。",
  steps: [
    "把领域规则放在拥有状态的对象或纯函数中，把网络和存储依赖以组合方式注入。",
    "限制 property 的副作用，避免一次普通属性读取隐式触发昂贵请求。",
    "实现 __eq__ 等协议时同时考虑 hash、一致性和可变性，保留合理的不支持比较行为。",
  ],
  pitfalls: [
    "把可变列表设为类属性会让所有实例共享，除非这正是明确设计。",
    "使用继承只为复用几行代码容易耦合生命周期；多重继承必须遵循协作式 super 契约。",
  ],
  question: "类属性和实例属性有什么区别，property 适用于什么场景？",
  scenario: "所有采集任务共享同一个 items 列表，但预期每个任务独立，怎么修复？",
  answer:
    "检查列表是否在类体定义，实例是否只修改列表却没有重新绑定实例属性。把独立容器放进 __init__，用两个实例分别追加和读取验证隔离。共享缓存另建有容量和并发控制的对象，不要混在实例业务状态里。",
  refs: ["py-classes"],
  code: String.raw`class Batch:
    def __init__(self): self.items=[]
    @property
    def size(self): return len(self.items)
a,b=Batch(),Batch()
a.items.append('x')
show([a.size,b.size])
show(a.items is b.items)`,
  logs: [[1, 0], false],
  explain:
    "构造器每次执行都建立新列表，因此两个实例状态隔离。size 只读当前列表长度，没有网络或磁盘副作用。把 items 移到类体再运行，会观察到共享容器，这有助于把名字查找机制和业务所有权联系起来。",
  choice: [
    "每实例独立的列表通常应创建在哪？",
    ["类体中", "__init__ 内", "模块全局", "所有实例共用的默认参数"],
    1,
    "在构造器内建立新列表能给每个实例独立容器。",
  ],
});
u("python", {
  id: "py-dataclass",
  title: "dataclass、default_factory 与不可变边界",
  summary:
    "dataclass 为数据容器生成初始化、比较等方法，但不会自动验证字段类型，也不会自动把嵌套对象变成不可变结构。可变字段应使用 default_factory 创建独立默认值。",
  mechanism:
    "field(default_factory=list) 在新实例初始化时创建列表。frozen=True 约束常规字段重新赋值，不能冻结列表内容；slots 可以改变属性存储方式，但不是性能万能开关，也影响扩展和继承细节。",
  steps: [
    "给数据记录明确字段、默认值与缺省语义，把运行时输入校验放在显式边界。",
    "可变字段用工厂创建，持久化之前决定日期、Decimal、枚举等如何序列化。",
    "需要不可变值对象时使用不可变成员并检查 hash 契约，避免把 frozen 当深冻结。",
  ],
  pitfalls: [
    "类型注解和 dataclass 不会阻止把字符串传入 int 字段。",
    "asdict 会递归转换字段，不应拿它随意序列化连接、密钥或无限对象图。",
  ],
  question: "frozen dataclass 是否等于所有内部数据都不可变？",
  scenario: "冻结的任务对象仍能被追加 tags，导致缓存结果变化，该怎么设计？",
  answer:
    "检查字段类型，frozen 只限制字段重绑定，内部 list 仍可变。按契约改用 tuple 等不可变成员，或者在构造边界复制并禁止向外泄露容器。增加对象作为缓存键后的稳定性测试，并确认可变输入不会间接修改记录。",
  refs: ["py-dataclass", "py-typing"],
  code: String.raw`from dataclasses import dataclass, field
@dataclass
class Job:
    tags: list[str] = field(default_factory=list)
a,b=Job(),Job()
a.tags.append('python')
show([a.tags,b.tags])`,
  logs: [[["python"], []]],
  explain:
    "default_factory 在每次构造时建立列表，避免默认值共享。这个类仍然接受其他类型输入，且 tags 可以修改；如业务要求只允许字符串列表，需要显式验证。数据类负责表示，不等于自动建立 API 信任边界。",
  choice: [
    "dataclass 中独立的列表默认值应使用？",
    [
      "tags=[]",
      "field(default_factory=list)",
      "同一个全局 list",
      "frozen=True 即可",
    ],
    1,
    "default_factory 在实例初始化时创建默认对象。",
  ],
});
u("python", {
  id: "py-typing",
  title: "类型注解、Protocol 与运行时校验",
  summary:
    "Python 类型注解服务于静态分析和工具协作，默认不执行运行时校验。Protocol 描述结构化接口；外部 JSON、环境变量和模型输出仍必须在边界转换与验证。",
  mechanism:
    "list[str]、联合类型和 TypedDict 描述预期形状，不会自动把输入字符串转整数。Protocol 关注对象具备什么行为，适合依赖注入与测试替身；运行时协议检查也不等价于完整验证类型参数和业务规则。",
  steps: [
    "给模块公共边界标注类型，配合静态检查发现遗漏返回值、可选值和不兼容调用。",
    "对外部输入验证必填、类型、取值范围和未知字段，再建立内部领域对象。",
    "用窄接口注入 HTTP 客户端、时钟和模型适配器，测试时用可控替身。",
  ],
  pitfalls: [
    "不要因为函数签名写了 int 就直接信任 HTTP 参数，它通常从文本或 JSON 到达。",
    "Any 会传播静态不确定性，过度使用 cast 只会压住检查器，不改变对象。",
  ],
  question: "类型提示与 Pydantic/手工验证的职责有什么区别？",
  scenario: "接口把 age 声明为 int 后仍收到字符串甚至负数，应怎样处理？",
  answer:
    "先确认验证实际发生在哪层，注解本身不会阻止传参。边界严格区分布尔值、整数与字符串，决定是否允许显式转换，并校验范围；内部函数只接收验证后的对象。静态检查作为另一条保障，不能替代恶意和错误输入测试。",
  refs: ["py-typing", "json-schema"],
  code: String.raw`def positive_int(value):
    if type(value) is not int or value <= 0:
        raise ValueError('positive integer required')
    return value
show(positive_int(3))
for value in ['3', True, -1]:
    try: positive_int(value)
    except ValueError: show('rejected')`,
  logs: [3, "rejected", "rejected", "rejected"],
  explain:
    'bool 是 int 的子类，因此本契约使用 type(value) is int 明确排除 True。是否接受 "3" 是接口转换策略，必须写清；示例选择严格验证。类型提示可以补全接口文档，但真正拒绝输入的是条件和异常。',
  choice: [
    "函数注解 value:int 默认会？",
    [
      "自动拒绝字符串",
      "供类型工具使用，不自动校验",
      "自动转型",
      "强制只能 CPython 运行",
    ],
    1,
    "注解通常不自动验证实参，需要运行时边界校验。",
  ],
  fill: {
    prompt:
      "要求 value 是非负整数且不接受 bool；合法时返回 value，非法抛 ValueError。",
    signature: "def nonnegative_int(value):",
    solution:
      'def nonnegative_int(value):\n    if type(value) is not int or value < 0:\n        raise ValueError("value")\n    return value',
    tests: [
      ["合法零", "assert nonnegative_int(0)==0"],
      ["合法正数", "assert nonnegative_int(4)==4"],
      [
        "拒绝布尔",
        "try:\n    nonnegative_int(True)\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('must reject bool')",
      ],
    ],
    hint: "注意 isinstance(True, int) 为真。",
  },
});
u("python", {
  id: "py-unicode",
  title: "str、bytes、编码与文本规范化",
  summary:
    "str 表示 Unicode 文本，bytes 表示字节序列。编码把文本变成字节，解码需要知道来源编码；字符长度、UTF-8 字节长度和用户感知字符数不能混为一谈。",
  mechanism:
    "UTF-8 中汉字通常占多个字节，组合字符可由多个码点组成。Unicode 规范化用于统一等价表示，不能任意用于密码或原始签名。错误处理策略 strict、replace 等会改变数据质量，应与业务容错策略一致。",
  steps: [
    "在网络与文件边界明确编码，在内部尽量统一使用 str 表示文本。",
    "对去重或检索字段设计一致的规范化过程，保留原文供追溯。",
    "截断字节、展示字符和限制请求大小使用不同口径，并用中文、emoji 与组合符号测试。",
  ],
  pitfalls: [
    "先按字节截断再解码可能截断多字节字符；ignore 会悄悄丢数据。",
    "签名和哈希需要精确字节约定，不能在校验前随意 strip 或 Unicode 规范化。",
  ],
  question: 'len("中文") 与 len("中文".encode("utf-8")) 为什么不同？',
  scenario: "抓取结果包含乱码并且相同商品名去重失败，怎么排查？",
  answer:
    "保存原始响应字节、Content-Type 和页面编码声明，比较不同解码结果。把解码错误率和替换字符数量纳入质量统计，再检查空白、大小写与 Unicode 规范化规则。去重基于规范字段，原始文本和字节保留用于重放。",
  refs: ["py-types"],
  code: String.raw`import unicodedata
text='中文'
show([len(text),len(text.encode('utf-8'))])
a='e\u0301'; b='é'
show(a==b)
show(unicodedata.normalize('NFC',a)==b)`,
  logs: [[2, 6], false, true],
  explain:
    "这里的两个长度分别是码点数与 UTF-8 字节数，不能当成显示宽度。组合形式 e 加重音与预组合 é 原始字符串不同，NFC 后相等。对业务展示字段可以明确规范化，对密码、签名或需要保持原貌的文本则应保留精确输入。",
  choice: [
    'bytes.decode("utf-8") 的作用是？',
    [
      "文本变成字节",
      "按 UTF-8 将字节解释为文本",
      "统计 token",
      "自动猜所有编码",
    ],
    1,
    "解码必须有明确编码约定，不是万能自动识别。",
  ],
});
u("python", {
  id: "py-files",
  title: "文件、pathlib、流式读写与原子替换",
  summary:
    "文件处理需要同时考虑路径、编码、资源关闭和失败后的完整性。大文件应按行或块流式处理；写临时文件再同文件系统替换能减少读者看到半成品的风险。",
  mechanism:
    "pathlib 把路径运算与 I/O 表达清楚，但 resolve 本身不是完整的安全目录隔离。写入可能部分完成，原子重命名只解决可见性的一部分；持久化还涉及 flush、fsync、文件系统与断电语义。浏览器文件是临时虚拟文件。",
  steps: [
    "使用 with 明确关闭责任，给文本指定 encoding，给大输入设置字节与行数上限。",
    "对用户提供的路径限制在允许目录内，避免路径穿越和符号链接竞态。",
    "需要替换时写同目录临时文件，校验内容后替换；清理失败残留并测试写入异常。",
  ],
  pitfalls: [
    "Path 不是自动沙箱，字符串包含 ../ 时不能仅凭拼接认为安全。",
    "本页内存文件不会自动落到你的硬盘或进入个人备份，重要结果需显式导出。",
  ],
  question: "为什么写配置文件时常采用临时文件加原子替换？",
  scenario: "采集任务中断后 JSON 文件只剩半行，怎样避免并恢复？",
  answer:
    "先保留损坏文件用于分析，检查是否整体覆盖且缺少事务边界。小型配置可写临时文件校验后替换，大规模结果用逐行 JSONL 加检查点或事务数据库。恢复时区分已提交批次和尾部残缺，不能简单忽略所有解析错误。",
  refs: ["py-context", "py-types"],
  code: String.raw`from io import StringIO
stream=StringIO('1\n2\n3\n')
with stream:
    total=sum(int(line) for line in stream if line.strip())
show(total)
show(stream.closed)`,
  logs: [6, true],
  explain:
    "StringIO 是内存文本流，保留了按行迭代和上下文关闭行为，适合验证流式处理契约。这里没有真实磁盘原子性实验；若要验证崩溃恢复，需要在本地文件系统中注入写入失败并检查临时文件和最终产物。",
  choice: [
    "大文本文件逐行处理的优势主要是？",
    [
      "保证所有算法零内存",
      "避免一次性读取全部内容",
      "免除关闭文件",
      "自动防止路径穿越",
    ],
    1,
    "逐行迭代减少同时物化的数据，但累积结果仍可能占用内存。",
  ],
});
u("python", {
  id: "py-serialization",
  title: "JSON、CSV、日期与不可信反序列化",
  summary:
    "序列化需要明确数据类型和跨语言契约。JSON 不是 Python 对象的完整备份格式；CSV 需要处理引号与换行。对不可信数据不能使用会恢复任意对象执行语义的反序列化方式。",
  mechanism:
    "JSON 键是字符串，日期、Decimal、集合和 bytes 需要显式转换。json.loads 只解析语法，不能证明字段合法；pickle 等格式可能在恢复对象时执行代码，不应接收外部不可信输入。金额和时间要规定精度及时区。",
  steps: [
    "给跨服务数据定义 schema，日期统一使用带时区的格式，金额用明确最小单位或十进制字符串。",
    "CSV 使用标准库 reader/writer 而非手写 split，分别处理逗号、双引号和内嵌换行。",
    "解析后校验大小、深度、必填字段和范围，对未知字段采用一致策略。",
  ],
  pitfalls: [
    "序列化成功不代表可无损往返，例如元组读回后通常变列表。",
    "不要把 pickle 当成 HTTP 输入格式，也不要让模型输出控制反序列化类型。",
  ],
  question: "json.loads 成功之后为什么仍然需要校验？",
  scenario: "不同语言服务传金额产生舍入差异，怎么统一契约？",
  answer:
    "先确认金额单位与舍入时机，不要把浮点二进制误差只归咎某种语言。约定最小货币单位整数或十进制字符串，明确币种、小数位和舍入规则。为边界金额、负值与溢出添加跨语言契约用例，再更新 OpenAPI 与客户端生成逻辑。",
  refs: ["py-types", "json-schema"],
  code: String.raw`from decimal import Decimal
from io import StringIO
import csv
show(str(Decimal('0.1')+Decimal('0.2')))
reader=csv.reader(StringIO('name,note\nA,"x,y"\n'))
show(list(reader))
show(json.loads('{"count":2}')['count'])`,
  logs: [
    "0.3",
    [
      ["name", "note"],
      ["A", "x,y"],
    ],
    2,
  ],
  explain:
    "Decimal 从字符串构造保留十进制意图，CSV reader 能识别引号包裹的逗号。JSON 解析得到 count=2 后仍需按业务要求排除负数、过大值或未知字段。解析、类型校验和业务验证是三个不同步骤。",
  choice: [
    "处理外部不可信对象数据应避免？",
    [
      "JSON 后加 schema 校验",
      "pickle.loads 外部输入",
      "CSV 标准 reader",
      "明确日期时区",
    ],
    1,
    "pickle 可能执行对象恢复逻辑，不适合不可信输入。",
  ],
});
u("python", {
  id: "py-regex",
  title: "正则、结构化解析与灾难性回溯",
  summary:
    "正则适合局部文本模式，不适合替代任意嵌套 HTML 或 JSON 解析器。区分 search、match、fullmatch，限制输入规模，避免复杂回溯表达式成为性能瓶颈。",
  mechanism:
    "原始字符串减少反斜杠在 Python 字面量层面的干扰；捕获组返回结构化片段，非贪婪并不能解决所有复杂度问题。fullmatch 要求整个文本匹配，适合格式校验，但格式正确不代表业务范围合法。",
  steps: [
    "先选数据结构解析器，只有局部文本字段才考虑正则抽取。",
    "为正常、空白、截断和超长输入建立样本，评估最坏输入的耗时。",
    "用户输入作为模式片段时用 re.escape，不能直接拼进表达式改变语义。",
  ],
  pitfalls: [
    "用 .*? 抓整个 HTML 页面仍会受嵌套、属性和脚本内容影响。",
    "格式验证与取值范围分开，例如 9999 虽是数字但不一定是合法端口或数量。",
  ],
  question: "re.match 与 re.fullmatch 在输入校验上有什么差异？",
  scenario: "某个超长标题让采集 CPU 飙高，如何分析正则是否回溯严重？",
  answer:
    "保留脱敏最坏输入，单独剖析匹配耗时并与输入长度对比，检查嵌套重复和模糊分支。优先改为简单、锚定、有界的模式或结构化解析，限制输入长度；不要只把贪婪换成非贪婪就宣布解决复杂度。",
  refs: ["py-types"],
  code: String.raw`import re
show(bool(re.fullmatch(r'[A-Z]{2}\d{3}','AB123')))
show(bool(re.fullmatch(r'[A-Z]{2}\d{3}','AB123x')))
show(re.findall(r'\d+', 'page=12&size=20'))`,
  logs: [true, false, ["12", "20"]],
  explain:
    "fullmatch 拒绝尾部多余字符，findall 用于提取数字片段而非直接验证 URL 参数。抓取参数仍应由 urllib.parse 处理键和值，避免误把不同字段的数字拼在一起；正则工具应服务于明确、局部且有界的输入契约。",
  choice: [
    "需要验证整个字符串符合格式，优先用？",
    ["re.search", "re.fullmatch", "str.find", "无限次替换直到不变"],
    1,
    "fullmatch 要求整个字符串都匹配表达式。",
  ],
  fill: {
    prompt: "仅接受两个大写字母加三个数字的完整编码，返回 bool。",
    signature: "def valid_code(text):",
    solution:
      "def valid_code(text):\n    import re\n    return re.fullmatch(r'[A-Z]{2}[0-9]{3}', text) is not None",
    tests: [
      ["合法", "assert valid_code('AB123') is True"],
      [
        "尾部和大小写",
        "assert not valid_code('AB123x') and not valid_code('ab123')",
      ],
      ["空字符串", "assert not valid_code('')"],
    ],
    hint: "fullmatch + 有界字符范围，注意 \d 也能匹配一些非 ASCII 数字。",
  },
});
u("python", {
  id: "py-modules",
  title: "模块导入、包结构与循环依赖",
  summary:
    "模块是命名空间和初始化单位，import 通常利用缓存避免重复执行同一模块。清晰的包边界和单向依赖比在报错后到处移动 import 更可靠。",
  mechanism:
    '导入会查找模块、创建模块对象并执行顶层语句，再把名字绑定到当前作用域。循环导入可能拿到部分初始化模块；__name__ == "__main__" 将脚本入口与可导入功能分离，但不能消除其他顶层副作用。',
  steps: [
    "把领域模型与纯函数放在低层模块，适配器依赖它们而不是反向导入入口。",
    "导入时避免联网、修改数据或创建后台任务，用显式启动函数管理副作用。",
    "用 python -m package.module 运行包内入口，测试从干净解释器导入公共模块。",
  ],
  pitfalls: [
    "同一文件以不同模块名导入可能形成两份状态，单例因此失效。",
    "局部 import 可以缓解启动成本，却不应掩盖不合理的双向架构依赖。",
  ],
  question:
    "import 执行了什么，循环导入为什么会出现 partially initialized module？",
  scenario: "工具模块导入 app，app 又导入工具模块，如何拆依赖？",
  answer:
    "先画出依赖图，把双方共同需要的数据结构或协议提到独立低层模块。入口负责组装依赖，工具接受参数而不读取全局 app。迁移后测试独立导入与启动，确认没有隐式连接数据库等导入副作用，再评估是否需要延迟导入。",
  refs: ["py-packaging", "py-classes"],
  code: String.raw`import math
import importlib
again=importlib.import_module('math')
show(math is again)
show(math.isqrt(81))
show(__name__)`,
  logs: [true, 9, "__main__"],
  explain:
    "重复导入 math 得到同一个缓存模块；入口作用域在运行器中显式设为 __main__。这并不意味着所有文件路径都天然唯一，实际包命名和启动路径仍需要统一，否则同一个源码可能以不同名称初始化。",
  choice: [
    "减少循环依赖的较好办法是？",
    [
      "把所有异常吞掉",
      "提取共同低层协议，让入口组装依赖",
      "修改 sys.modules 任意条目",
      "把每个模块都改成全局 app",
    ],
    1,
    "单向依赖和显式注入能从结构上减少循环导入。",
  ],
});
u("python", {
  id: "py-testing",
  title: "单元测试、参数化、替身与性质验证",
  summary:
    "测试要验证可观察行为与不变量，而不是逐行复制实现。把时钟、网络和随机源作为依赖隔离，让失败可以重现；普通输入之外还应覆盖边界与失败路径。",
  mechanism:
    "测试夹具控制准备与清理，mock 只替换边界而不应替代被测核心逻辑。例子测试检查具体输入，性质测试检查更广泛的不变量；集成测试补充协议和资源的真实交互，三者职责不同。",
  steps: [
    "从输入契约列出空值、重复、乱序、类型错误和部分失败的例子。",
    "对限流器、重试和超时注入时钟，不靠真实 sleep 等待几分钟。",
    "为纯函数检查不修改输入、结果顺序和幂等性，再给适配器写少量集成测试。",
  ],
  pitfalls: [
    "只断言调用次数可能在功能错误时仍通过；过度 mock 会隐藏协议不兼容。",
    "为了让测试通过降低断言或接受所有输出，不是在修复实现。",
  ],
  question: "如何测试重试逻辑而不让测试依赖真实网络和长时间等待？",
  scenario: "测试本地总通过，CI 偶发失败，怎么判断是竞态还是断言不稳？",
  answer:
    "固定随机种子、时钟和测试输入，检查共享资源、并发顺序与超时容差。先找最小可重现失败，再把真正的行为约束写成断言。对外部依赖用替身稳定单元测试，对协议兼容性保留集成测试，避免用任意增加 sleep 隐藏问题。",
  refs: ["py-test"],
  code: String.raw`def total(values): return sum(values)
cases=[([],0),([1,2],3),([-1,1],0)]
results=[]
for values, expected in cases:
    results.append(total(values)==expected)
show(results)
show(all(results))`,
  logs: [[true, true, true], true],
  explain:
    "这些小样本覆盖空输入、普通相加与抵消，但不能证明所有实现正确。还可加入不改变输入、拼接可加性等性质。本项目补全题的通过仅代表通过已有用例，阅读者仍应根据契约添加能区分错误实现的反例。",
  choice: [
    "测试一个不应修改输入的函数，应该额外检查？",
    ["源代码行数", "调用前后原输入不变", "变量名字", "运行日志颜色"],
    1,
    "不修改输入是可观察契约，需要显式断言。",
  ],
});
u("python", {
  id: "py-asyncio",
  title: "asyncio、协程调度与受控并发",
  summary:
    "async def 调用得到协程对象，不会自动并行执行。事件循环在 await 可等待对象时推进其他任务；同步阻塞调用会阻塞整个循环，限制并发需要额外的信号量或队列。",
  mechanism:
    "create_task 将协程安排到事件循环，gather 聚合结果并保留输入顺序，但不会自动限制任务数。asyncio.Semaphore 控制进入某段操作的数量；任务数量、连接池和等待队列仍需分别设置上限。",
  steps: [
    "区分 CPU 计算、同步 I/O 和原生异步 I/O，选择适配的执行方式。",
    "为访问外部服务设置并发闸门、超时和有界队列，避免一次创建百万协程。",
    "汇总结果时明确顺序与部分失败策略，保留取消传播并释放资源。",
  ],
  pitfalls: [
    "async 函数内调用 time.sleep 或同步 HTTP 库仍然会阻塞事件循环。",
    "提高并发不等于吞吐无限增长，连接池、对端限流和解析速度都会成为瓶颈。",
  ],
  question: "asyncio.gather 能限制并发吗，Semaphore 又限制了什么？",
  scenario: "爬虫改 async 后更慢而且内存暴涨，如何定位？",
  answer:
    "检查是否在循环中使用同步网络和 CPU 密集解析，统计待调度任务、连接池等待和响应大小。先用有界生产消费队列限制积压，再用 Semaphore 和客户端 limits 控制请求。以完成吞吐、错误率和延迟而非任务创建速度评价效果。",
  refs: ["py-asyncio", "httpx"],
  code: String.raw`import asyncio
async def main():
    gate=asyncio.Semaphore(2)
    async def work(n):
        async with gate:
            await asyncio.sleep(0)
            return n*n
    return await asyncio.gather(*(work(n) for n in range(4)))
show(await main())`,
  logs: [[0, 1, 4, 9]],
  explain:
    "顶层 await 由运行器支持，示例避免在已经运行的事件循环中再调用 asyncio.run。Semaphore 限制同时进入 work 临界段的任务，gather 保持返回顺序；这里只创建四个任务，超大输入应进一步使用有界队列，不能直接照搬展开式。",
  choice: [
    "gather 本身负责什么？",
    [
      "限制最大并发为 CPU 数",
      "聚合多个 awaitable 的结果",
      "自动把同步 I/O 改成异步",
      "自动按域名限速",
    ],
    1,
    "并发上限需由信号量、连接池或工作队列另行控制。",
  ],
});
u("python", {
  id: "py-cancellation",
  title: "结构化并发、TaskGroup、超时与取消",
  summary:
    "取消是一种协作式控制流，通常在下一次可取消等待处生效。TaskGroup 帮助管理子任务生命周期；超时、取消请求与外部副作用完成并不是同一件事。",
  mechanism:
    "Python 3.11 起提供 TaskGroup 和 asyncio.timeout。任务组中非取消异常会触发其他子任务取消，并在退出时汇总异常。finally 应清理资源，捕获 CancelledError 后通常重新抛出，避免破坏结构化并发的退出语义。",
  steps: [
    "把一起成功或失败的子任务放在明确的生命周期范围内。",
    "设置端到端 deadline，并把剩余预算传递到下游，而不是每层重新给满超时。",
    "在异常和取消路径检查资源释放，外部写入使用幂等键或事务确认最终状态。",
  ],
  pitfalls: [
    "取消本地等待不保证远端请求没执行，不能据此安全重发非幂等写操作。",
    "吞掉 CancelledError 可能让任务组退出变慢或行为异常。",
  ],
  question: "TaskGroup 相比随意 create_task 的优势是什么？",
  scenario: "用户取消批量采集后后台任务仍持续写数据，怎样收束生命周期？",
  answer:
    "记录父子任务关系，确认子任务是否被遗忘而未等待。用 TaskGroup 或显式任务集合在父范围退出时取消并 await，清理连接和队列。对已经提交的写入记录提交状态，取消不是回滚承诺，恢复时依赖检查点和幂等键。",
  refs: ["py-asyncio"],
  code: String.raw`import asyncio
async def main():
    events=[]
    async def job(n):
        await asyncio.sleep(0)
        events.append(n)
    async with asyncio.TaskGroup() as group:
        for n in range(3): group.create_task(job(n))
    return sorted(events)
show(await main())`,
  logs: [[0, 1, 2]],
  explain:
    "退出 TaskGroup 后，成功路径里的三个任务已经完成，不会遗留到下一轮运行。排序只为了稳定展示完成集合，不声称并发完成顺序固定。失败路径应结合异常组、取消和清理另做测试，不能由这一个正常样例推出所有故障行为。",
  choice: [
    "收到取消后在 finally 清理完资源，通常应该？",
    [
      "永久吞掉取消",
      "让取消继续传播",
      "立刻无条件重试所有写入",
      "返回伪造成功结果",
    ],
    1,
    "保留取消传播有助于父任务正确管理生命周期。",
  ],
});
u("python", {
  id: "py-concurrency",
  title: "线程、进程、GIL 与任务分类",
  summary:
    "并发选型应按瓶颈而非语法偏好。传统带 GIL 的 CPython 中，纯 Python CPU 任务通常不会因增加线程获得线性多核加速；I/O 等待、释放 GIL 的扩展和自由线程构建需要分别分析。",
  mechanism:
    "线程共享内存，进程通常隔离地址空间并引入序列化与进程管理成本。GIL 不等于业务线程安全；复合操作与资源约束仍需要锁和同步。自由线程构建的可用性、扩展兼容和性能要按目标解释器版本核对。",
  steps: [
    "先用剖析区分等待和计算时间，再选 asyncio、线程池、进程池或原生向量化。",
    "明确跨进程传输大小、启动方式与进程入口保护，避免复制巨大对象抵消收益。",
    "对共享状态建立锁或消息传递协议，设置池容量并验证异常退出。",
  ],
  pitfalls: [
    "GIL 不是数据库锁，也不能保证任意多步业务更新原子。",
    "浏览器 Pyodide 不提供与本机相同的线程和多进程能力，本例只验证任务分类模型。",
  ],
  question: "什么时候选线程池，什么时候选进程池，GIL 有哪些边界？",
  scenario: "给图像预处理加了 50 个线程没有变快，怎样找出原因？",
  answer:
    "先看实际热点是否是纯 Python 循环、释放 GIL 的扩展、磁盘等待或内存带宽。比较单任务和合理池容量，记录序列化、上下文切换与峰值内存。可改向量化或进程并行，但必须验证结果一致性和部署启动方式。",
  refs: ["py-asyncio", "py-classes"],
  model: true,
  code: String.raw`def execution_plan(kind, native_async=False):
    if kind=='io': return 'asyncio' if native_async else 'thread pool'
    if kind=='cpu': return 'profile, then process/native compute'
    raise ValueError('kind')
show(execution_plan('io',True))
show(execution_plan('io'))
show(execution_plan('cpu'))`,
  logs: ["asyncio", "thread pool", "profile, then process/native compute"],
  explain:
    "这是选型决策模型，没有实际创建线程或进程，也没有测量 GIL 性能。实际方案还需要结合 C 扩展、解释器构建、数据传输和部署资源做实验；不要把模型返回的一行字符串当成通用性能结论。",
  choice: [
    "GIL 能保证任意多步业务操作线程安全吗？",
    [
      "可以，不需要锁",
      "不能，需要分析共享状态与同步",
      "只要线程数小于 10 就可以",
      "只在 Windows 保证",
    ],
    1,
    "GIL 不代替业务同步；解释器和扩展行为也影响并发。",
  ],
});
u("python", {
  id: "py-sql",
  title: "SQLite、参数化查询、事务与批量写入",
  summary:
    "Python 数据访问应把 SQL 结构与参数分离，并让业务提交边界与事务一致。批量写入、唯一约束和检查点共同解决重复采集与中断恢复，不能只在内存里先查再插。",
  mechanism:
    "参数占位符用于数据值，表名和排序字段需要白名单而不是占位符。唯一索引防止并发重复写，事务把相关更新作为整体提交。SQLite 的并发写入、WAL 和连接线程约束需要按具体部署验证。",
  steps: [
    "为业务自然键建立唯一约束，并保存来源、抓取时间、解析版本和内容指纹。",
    "一次批次的数据和检查点在同一事务提交，失败回滚，重启可安全重放。",
    "使用参数化 SQL，控制事务长度和批量大小，观察锁等待与写入耗时。",
  ],
  pitfalls: [
    "先 SELECT 再 INSERT 仍可能竞态，约束应放在数据库层。",
    "本页只展示 SQL 与绑定参数的契约；真实 SQLite 事务演练在随附本地 Python 项目中完成。",
  ],
  question: "为什么参数化查询与唯一约束分别解决不同问题？",
  scenario: "爬虫重启后产生重复记录且检查点比数据库进度更靠前，如何修复？",
  answer:
    "先确认数据和检查点是否分别提交。把自然键或版本键放到唯一约束里，再将本批数据写入和检查点更新放在同一事务；失败后回滚并重放未提交批次。保留原始响应与解析版本，以便区分更新、重复和解析错误。",
  refs: ["py-context", "py-test"],
  model: true,
  code: String.raw`query='SELECT title FROM articles WHERE source_id = ?'
user_value="x' OR 1=1 --"
bound=(user_value,)
show(query)
show(list(bound))
show(query.count('?')==len(bound))`,
  logs: [
    "SELECT title FROM articles WHERE source_id = ?",
    ["x' OR 1=1 --"],
    true,
  ],
  explain:
    "可疑输入作为一个参数值单独保存，没有拼进 SQL 结构。占位符数量检查不是 SQL 安全验证器，也不能处理动态表名。示例不执行数据库；本地配套项目使用 sqlite3 的唯一约束、批次事务和重复运行测试验证真实存储行为。",
  choice: [
    "SQL 占位符可以直接替代任意表名吗？",
    [
      "可以",
      "不能，动态标识符需白名单",
      "只对 DELETE 可以",
      "只要转字符串即可",
    ],
    1,
    "参数化主要绑定数据值，表名等 SQL 结构需要可信构造和白名单。",
  ],
});
u("python", {
  id: "py-performance",
  title: "性能剖析、内存与算法成本",
  summary:
    "优化从可重现负载和瓶颈证据开始。总耗时可能来自算法、序列化、I/O、对象分配或外部服务；减少局部循环的一点开销不一定改变用户体验。",
  mechanism:
    "cProfile 可定位函数调用累计成本，tracemalloc 追踪 Python 分配，但不覆盖所有原生内存。timeit 适合受控微基准；端到端指标还要区分冷启动、缓存、输入规模和并发条件。",
  steps: [
    "固定输入分布、样本大小和运行条件，先建立端到端耗时与峰值内存基线。",
    "从最热路径判断复杂度和不必要物化，再选择集合索引、流处理或批量操作。",
    "优化后核对结果语义，用不同规模验证增长趋势并记录收益口径。",
  ],
  pitfalls: [
    "只测一次或只用小输入，容易把缓存和噪声当收益。",
    "生成器减少结果物化，不代表下游 append 到大列表后仍然低内存。",
  ],
  question: "怎样区分算法复杂度问题与 Python 循环常数开销？",
  scenario: "去重十万条数据很慢，能直接换成多进程吗？",
  answer:
    "先看是否每条都扫描已有列表，导致近似二次增长。若契约允许可哈希键，先用 set/dict 索引把查重改成均摊线性，再测内存和顺序。只有确认 CPU 热点且传输成本可接受时再考虑多进程，避免并行化低效算法。",
  refs: ["py-types", "py-test"],
  code: String.raw`def comparisons_for_linear_scan(n): return n*(n-1)//2
show([comparisons_for_linear_scan(n) for n in [10,100,1000]])
show(len(set(range(1000))))`,
  logs: [[45, 4950, 499500], 1000],
  explain:
    "计算比较次数能解释全量扫描去重为何随规模迅速变慢，这不是实际性能计时。set 的结果展示另一种结构选择；真实去重还要确认可哈希性、顺序和业务键冲突，不能只根据微基准更换语义。",
  choice: [
    "优化前最应该先做什么？",
    ["先并行", "建立可重现负载并测量瓶颈", "所有循环改推导式", "删除全部日志"],
    1,
    "先得到瓶颈证据和基线，才能判断改动是否有效。",
  ],
});
u("python", {
  id: "py-delivery",
  title: "配置、日志、CLI、容器与稳定交付",
  summary:
    "可维护 Python 工具需要清晰的配置优先级、可观测日志和可退出的生命周期。命令行参数、环境变量和配置文件应有可解释的覆盖规则，密钥不应进入日志和版本库。",
  mechanism:
    "argparse 把文本命令行转换为受约束选项，logging 提供级别与处理器。结构化日志应包含阶段、request_id、耗时和错误类别；部署健康检查要区分进程存活和依赖可用，SIGTERM 后应停止接收任务并完成或回滚批次。",
  steps: [
    "约定 CLI 大于环境变量大于默认值的优先级，启动时验证配置但只输出脱敏摘要。",
    "把业务日志写 stderr 或结构化通道，结果输出写 stdout，方便管道与自动化使用。",
    "固定依赖与镜像，设置非特权用户、资源限制和优雅停机窗口，在干净环境演练恢复。",
  ],
  pitfalls: [
    "日志带上完整 Authorization、Cookie 或模型提示词可能泄露数据。",
    "容器化不自动带来依赖可复现，也不替代应用层超时与退出处理。",
  ],
  question: "怎样让一个爬虫脚本变成可交付、可诊断、可恢复的工具？",
  scenario: "定时任务偶尔失败且没有日志，重跑又成功，怎样补证据？",
  answer:
    "给每轮任务生成 run_id，记录脱敏配置、阶段耗时、输入规模、重试与最终退出码。将结果与日志分流，持久化检查点和失败样本，设置总时间预算。用可控故障演练请求失败、解析失败与存储失败，确保不是统一返回零退出码。",
  refs: ["py-packaging", "py-test"],
  code: String.raw`import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--limit',type=int,default=20)
args=parser.parse_args(['--limit','5'])
show({'limit':args.limit,'authorization':'[REDACTED]'})`,
  logs: [{ limit: 5, authorization: "[REDACTED]" }],
  explain:
    "示例显式传入参数列表，避免受浏览器宿主参数影响；结果只包含非敏感配置和固定脱敏标记。真实脱敏不能靠固定字符串代替，需要日志字段白名单、异常链检查和样本审计，并让非法配置在启动时失败。",
  choice: [
    "适合写入常规运行日志的是？",
    [
      "完整 API Key",
      "会话 Cookie",
      "脱敏配置、run_id 和阶段耗时",
      "全部用户原文",
    ],
    2,
    "日志应服务诊断，同时最小化敏感信息。",
  ],
});
