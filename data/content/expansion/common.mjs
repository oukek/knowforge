import { modules, sources, lessons, topic } from "../base.mjs";
import { choices } from "../choices.mjs";
import { examples, fills } from "../examples/helpers.mjs";
const groups = [
  [
    "python",
    "Python 语言与工程",
    "从对象模型到异步、测试和交付",
    "Braces",
    "P0",
    "#537b92",
    24,
  ],
  [
    "crawler",
    "Python 爬虫与数据采集",
    "请求、解析、调度、存储与质量",
    "Globe2",
    "P1",
    "#a17c43",
    20,
  ],
  [
    "restapi",
    "RESTful API 与服务设计",
    "资源契约、HTTP 语义与可靠性",
    "Server",
    "P0",
    "#668b78",
    20,
  ],
  [
    "llmapp",
    "大模型 AI 应用工程",
    "从模型接入到 RAG、Agent 与评估",
    "Sparkles",
    "P1",
    "#8571a0",
    24,
  ],
];
for (const [id, title, subtitle, icon, priority, color, budget] of groups)
  modules.push({
    id,
    title,
    subtitle,
    icon,
    priority,
    color,
    budget,
    order: modules.length + 1,
  });
const refs = [
  [
    "py-types",
    "Python · 类型与数据模型",
    "https://docs.python.org/3.14/library/stdtypes.html",
    "对象、容器、相等性与迭代",
  ],
  [
    "py-functions",
    "Python · 控制流与函数",
    "https://docs.python.org/3.14/tutorial/controlflow.html",
    "参数绑定、推导式与函数定义",
  ],
  [
    "py-classes",
    "Python · 类与作用域",
    "https://docs.python.org/3.14/tutorial/classes.html",
    "作用域、继承与协议",
  ],
  [
    "py-context",
    "Python · contextlib",
    "https://docs.python.org/3.14/library/contextlib.html",
    "资源管理和异常传播",
  ],
  [
    "py-dataclass",
    "Python · dataclasses",
    "https://docs.python.org/3.14/library/dataclasses.html",
    "数据类、default_factory 与冻结边界",
  ],
  [
    "py-typing",
    "Python · typing",
    "https://docs.python.org/3.14/library/typing.html",
    "静态类型与运行时校验的区别",
  ],
  [
    "py-asyncio",
    "Python · asyncio 任务",
    "https://docs.python.org/3.14/library/asyncio-task.html",
    "协程、TaskGroup、取消和超时",
  ],
  [
    "py-test",
    "Python · unittest",
    "https://docs.python.org/3.14/library/unittest.html",
    "断言、测试夹具与隔离",
  ],
  [
    "py-packaging",
    "Python Packaging User Guide",
    "https://packaging.python.org/en/latest/tutorials/packaging-projects/",
    "虚拟环境、pyproject 与分发",
  ],
  [
    "py-url",
    "Python · urllib.parse",
    "https://docs.python.org/3.14/library/urllib.parse.html",
    "URL 拆分、相对链接与编码",
  ],
  [
    "py-robots",
    "Python · robotparser",
    "https://docs.python.org/3.14/library/urllib.robotparser.html",
    "robots 规则查询与缓存",
  ],
  [
    "robots-rfc",
    "RFC 9309 · Robots Exclusion Protocol",
    "https://www.rfc-editor.org/rfc/rfc9309.html",
    "抓取规则与失败处理；不是身份授权协议",
  ],
  [
    "httpx",
    "HTTPX 官方文档",
    "https://www.python-httpx.org/advanced/timeouts/",
    "连接、读取、写入和连接池超时",
  ],
  [
    "scrapy",
    "Scrapy · 架构",
    "https://docs.scrapy.org/en/latest/topics/architecture.html",
    "调度器、下载器、Spider 与 Pipeline",
  ],
  [
    "scrapy-throttle",
    "Scrapy · AutoThrottle",
    "https://docs.scrapy.org/en/latest/topics/autothrottle.html",
    "按站点延迟与并发进行自适应限速",
  ],
  [
    "scrapy-selectors",
    "Scrapy · Selectors",
    "https://docs.scrapy.org/en/latest/topics/selectors.html",
    "CSS、XPath、相对选择器与文本提取",
  ],
  [
    "playwright-python",
    "Playwright Python · 浏览器上下文",
    "https://playwright.dev/python/docs/browser-contexts",
    "动态网页、等待条件与会话隔离",
  ],
  [
    "http-semantics",
    "RFC 9110 · HTTP 语义",
    "https://www.rfc-editor.org/rfc/rfc9110.html",
    "方法、状态、条件请求与表示",
  ],
  [
    "http-cache-rfc",
    "RFC 9111 · HTTP 缓存",
    "https://www.rfc-editor.org/rfc/rfc9111.html",
    "缓存指令、验证器与共享缓存",
  ],
  [
    "problem-details",
    "RFC 9457 · Problem Details",
    "https://www.rfc-editor.org/rfc/rfc9457.html",
    "API 错误的机器可读表示",
  ],
  [
    "openapi",
    "OpenAPI Specification",
    "https://spec.openapis.org/oas/latest.html",
    "接口契约；文档版本应与工具链固定",
  ],
  [
    "json-schema",
    "JSON Schema Reference",
    "https://json-schema.org/understanding-json-schema/reference",
    "结构、必填、边界与组合校验",
  ],
  [
    "fastapi",
    "FastAPI · 依赖注入",
    "https://fastapi.tiangolo.com/tutorial/dependencies/",
    "请求校验、依赖与生命周期",
  ],
  [
    "oauth-bcp",
    "RFC 9700 · OAuth 2.0 安全实践",
    "https://www.rfc-editor.org/rfc/rfc9700.html",
    "授权码与 PKCE、令牌保护",
  ],
  [
    "llm-structured",
    "OpenAI Docs · 结构化输出",
    "https://developers.openai.com/api/docs/guides/structured-outputs",
    "Schema 约束与业务正确性边界",
  ],
  [
    "llm-tools",
    "OpenAI Docs · Function calling",
    "https://developers.openai.com/api/docs/guides/function-calling",
    "工具循环、参数和调用结果",
  ],
  [
    "llm-evals",
    "OpenAI Docs · Evals",
    "https://developers.openai.com/api/docs/guides/evals",
    "数据集、评估器与回归比较",
  ],
  [
    "mcp-spec",
    "Model Context Protocol · 规范",
    "https://modelcontextprotocol.io/specification/2025-11-25",
    "协议版本、工具和资源；不替代身份鉴权",
  ],
  [
    "rag-paper",
    "Retrieval-Augmented Generation 原论文",
    "https://arxiv.org/abs/2005.11401",
    "检索增强生成的基本结构，不是效果保证",
  ],
  [
    "pyodide",
    "Pyodide · Worker 与部署",
    "https://pyodide.org/en/stable/usage/webworker.html",
    "浏览器 CPython、运行时加载和宿主边界",
  ],
];
for (const [id, title, url, scope] of refs)
  sources.push({
    id,
    title,
    url,
    scope,
    status: "reference",
    checkedAt: "2026-10-21",
  });
export function unit(moduleId, o) {
  topic(
    moduleId,
    o.id,
    o.title,
    o.summary,
    o.mechanism,
    o.steps.join("|"),
    o.pitfalls.join("|"),
    o.question,
    o.scenario,
    o.answer,
    o.keywords ?? o.title.replace(/[、，：/]/g, " "),
    "",
    o.refs,
  );
  const lesson = lessons.at(-1);
  lesson.language = "python";
  lesson.sections.push({ title: "用代码验证与继续排查", content: o.explain });
  if (["crawl-project", "llm-capstone", "rest-testing"].includes(o.id))
    lesson.sections.push({
      title: "运行配套本地项目",
      content:
        "[下载 Python 配套项目](/api/export/python-demo)（Python 3.11+，仅标准库）。下载后执行 `python3 zhixing-python-workbench.py demo`，会启动本机临时样本站点，重复采集并校验 SQLite 去重、分页与带来源检索。执行 `python3 zhixing-python-workbench.py serve --port 8765` 可保持练习站点运行，另一终端执行 `python3 zhixing-python-workbench.py crawl --base http://127.0.0.1:8765`。浏览器示例不提供真实网络，配套项目也不会调用模型或消耗额度；默认数据库独立位于 runtime/python-demo.sqlite。",
    });
  const code = `import json\n\ndef show(value):\n    """按 JSON 打印结果，便于逐行预测和验证。"""\n    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))\n\n${o.code.trim()}`;
  examples.set(o.id, {
    id: "example-" + o.id,
    title: o.exampleTitle ?? o.title + "：最小可验证示例",
    description:
      o.description ??
      "使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。",
    language: "python",
    runtime: o.model ? "model" : "python",
    code,
    expectedLogs: o.logs.map((x) => JSON.stringify(x)),
    explanation: o.explain,
  });
  const [prompt, options, correct, explanation] = o.choice;
  choices.push({
    id: "choice-" + o.id + "-1",
    lessonId: o.id,
    type: "choice",
    prompt,
    options,
    correct,
    explanation: explanation + "\n\n机制依据：" + o.mechanism,
    provenance: "editorial",
  });
  if (o.fill) {
    const f = o.fill;
    fills.set(o.id, {
      id: "fill-" + o.id,
      type: "fill",
      language: "python",
      title: "补全 Python 代码",
      prompt: f.prompt,
      signature: f.signature,
      starter: f.signature + "\n    # TODO：按题目契约实现\n    pass",
      solution: f.solution,
      tests: f.tests.map(([name, code]) => ({ name, code })),
      hint: f.hint,
      explanation: f.explanation ?? o.explain,
    });
  }
}
