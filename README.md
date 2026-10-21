# KnowForge

**Learn. Practice. Build.**

A local-first learning workbench for frontend, Python, web scraping, REST APIs, and AI engineering.

**KnowForge · 知行实验室** 是一个基于 Vue 3 与 Node.js 的本地工程学习工作台。把知识讲解、可运行示例、自动验证练习、面试题库和复习记录放在一起，让你边读、边写、边验证。

主要内容为中文，支持 JavaScript 与 Python 双语言代码实验。学习数据保存在本机，不需要注册账号或配置模型 API Key。

[快速开始](#快速开始) · [功能介绍](#功能介绍) · [学习内容](#学习内容) · [开发与扩展](#开发与扩展) · [文档](#文档)

## 功能介绍

| 功能 | 可以做什么 |
| --- | --- |
| 知识资料库 | 按专题、优先级、学习状态和关键词筛选，阅读机制、步骤、误区和参考来源 |
| 边读边试 | 修改每课 JavaScript / Python 示例，运行后查看输出与错误 |
| 随堂练习 | 预测输出、补全代码，通过逐行反馈与测试用例验证理解 |
| 面试题库 | 练习单选、原理问答、场景分析和手写代码，对照解析与参考答案 |
| 手写实验室 | 在浏览器里实现算法、异步控制与工程工具函数，运行边界用例 |
| 模拟面试 | 按专题随机组卷、限时作答、保存草稿，交卷后复盘 |
| 复习与计划 | 管理薄弱题、到期复习、收藏、笔记及 7 / 14 / 21 / 30 天学习计划 |
| 数据管理 | 导出完整资料、Markdown 手册和个人备份，合并导入已有学习记录 |

### 代码编辑与运行

编辑器使用 **CodeMirror 6**，支持语法高亮、括号配对、自动缩进、行号与代码草稿恢复。JavaScript 提供常用 API 补全和按需加载的 Prettier 格式化；Python 使用四格缩进。

| 操作 | 快捷键 |
| --- | --- |
| 运行代码 | `Ctrl / ⌘ + Enter` |
| 格式化 JavaScript | `Shift + Alt + F` |
| 缩进 / 反缩进 | `Tab` / `Shift + Tab` |
| 离开编辑器 | 先按 `Esc`，再按 `Tab` |

JavaScript 在独立 Web Worker 中执行；Python 通过本地 Pyodide 运行时在 Worker 中执行。运行支持实时输出、手动停止与 4 秒超时终止；Python 运行时初始化单独限时 30 秒。课程示例无需调用外部模型或采集真实网站。

### 验证与复盘

- **预测输出**：按日志顺序逐行提交，查看缺行、多行和内容差异；JSON 值按结构比较，数值和字符串仍然区分。
- **代码补全与实验**：补上函数实现，逐条查看用例结果，并使用提示或参考解复盘。
- **单选题**：由服务端判分并展示解析。
- **原理与场景题**：对照答案要点自评，记录薄弱项和后续复习。

开放题目前采用自评，没有接入大模型自动打分。模拟面试分别展示客观题成绩和开放题复盘。

## 学习内容

当前资料版本：**2026-10-21**。

| 内容 | 数量 |
| --- | ---: |
| 学习专题 | 18 |
| 知识讲解 | 218 |
| 可编辑运行示例 | 218（JavaScript 130 / Python 88） |
| 随堂练习 | 310（预测输出 218 / 代码补全 92） |
| 面试题 | 614（原理 218 / 场景 218 / 单选 150 / 手写 28） |
| 代码实验 | 28，配套 117 个用例 |
| 官方及一手资料入口 | 60 |

| 方向 | 覆盖范围 |
| --- | --- |
| JavaScript 与浏览器 | 语言机制、异步调度、网络、CSS、移动端、性能与稳定性 |
| 前端框架与平台 | Vue / React、微信小程序、工程化、Node.js、系统设计 |
| 算法与工程表达 | 数据结构、手写实现、项目深挖、架构讨论、备考与表达 |
| Python · 24 篇 | 对象与容器、函数、迭代器、装饰器、异常、类型、测试、asyncio、并发、SQL 与交付 |
| 爬虫与采集 · 20 篇 | HTTP、解析、分页、编码、robots、限速重试、增量采集、幂等存储与观测 |
| RESTful API · 20 篇 | 资源建模、方法与状态码、校验、分页、缓存、鉴权、幂等、OpenAPI 与服务设计 |
| AI 应用 · 24 篇 | 模型接入、结构化输出、流式响应、Embedding、RAG、评估、工具调用、Agent、MCP 与部署 |

部分平台、网络及框架示例采用纯语言教学模型，页面会标记其运行范围。通过示例用例不等于在微信宿主、真实网络或生产模型上完成验证。

## 快速开始

### 环境要求

- **Node.js 22.13 或更高版本**，项目使用 Node 内置 SQLite。
- **npm**，用于安装依赖与运行脚本。
- 本机 **Python 3.11+** 仅用于独立 Python 配套项目及相关集成测试；浏览器中的 Python 练习使用 Pyodide。

### 开发运行

下载或克隆仓库后，在项目根目录执行：

```bash
npm ci
npm run dev
```

打开 **[http://127.0.0.1:6666/](http://127.0.0.1:6666/)**。

一条命令同时启动前端和后端：页面、API、代码运行资源和热更新共用 **6666**，服务只监听本机 `127.0.0.1`。停止使用 `Ctrl+C`。

> **端口兼容性**：6666 属于 Chromium 的受限端口。若浏览器提示 `ERR_UNSAFE_PORT`，可显式选择其他端口；项目默认值仍为 6666。服务不会自动修改浏览器设置。

macOS / Linux 可这样指定端口：

```bash
PORT=16666 npm run dev
```

PowerShell：

```powershell
$env:PORT = "16666"
npm run dev
```

此时访问 `http://127.0.0.1:16666/`。`PORT` 同时适用于开发与构建后的运行方式。

### 构建后运行

```bash
npm run build
npm start
```

Node 服务托管 `dist/` 中的前端产物，并提供 API、SQLite 和代码运行资源。运行时需要安装项目依赖，包括本地 Pyodide 文件。

### 配置

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `6666` | 页面、API 和 HMR 的统一入口端口 |
| `DB_PATH` | `runtime/study.sqlite` | 个人学习数据库路径 |

例如，在 macOS / Linux 下使用独立学习库：

```bash
DB_PATH=runtime/personal.sqlite npm run dev
```

环境变量通过启动终端传入；项目没有内置 `.env` 文件加载器。

## 学习数据与备份

进度、笔记、收藏、作答、复习、计划和模拟记录保存在 **`runtime/study.sqlite`**。应用关闭后数据保留，`runtime/` 中的数据库文件已排除在 Git 提交之外。

在“资料来源与数据”页面可以导出：

- **完整资料 JSON**：知识点、问答、答案、实验、用例与来源。
- **Markdown 学习手册**：适合离线阅读的完整学习内容。
- **个人 JSON 备份**：学习状态与已提交的练习记录，支持预览后合并导入。

**未提交的代码草稿保存在当前浏览器的 localStorage 中，不包含在个人 JSON 备份里。** 重要草稿请单独另存。直接复制 SQLite 文件前应先停止服务，避免遗漏尚未合并的 WAL 数据。

英文改名沿用现有内容 ID、数据库路径及浏览器草稿键，已有学习记录无需迁移。

## Python 配套项目

[examples/python/workbench.py](examples/python/workbench.py) 是一个只依赖 Python 3.11+ 标准库的独立练习项目，串联本机样本站点、robots、分页采集、HTML 解析、SQLite 幂等存储与 REST API。

运行完整演示：

```bash
python3 examples/python/workbench.py demo
```

分别启动服务与采集器：

```bash
# 终端一：启动本机样本站点与 API
python3 examples/python/workbench.py serve --port 8765

# 终端二：采集样本页面并写入独立数据库
python3 examples/python/workbench.py crawl --base http://127.0.0.1:8765
```

示例端点：

- `GET /api/articles?page=1&limit=2`
- `GET /api/search?q=python`

配套项目默认使用 `runtime/python-demo.sqlite`，与个人学习库分离。搜索接口返回带来源的确定性检索结果，`answer` 为 `null`；接入真实大模型需要另行实现模型适配与评估。

## 技术栈与目录

| 层级 | 技术 |
| --- | --- |
| 页面与路由 | Vue 3、Vue Router、Vite |
| 编辑与展示 | CodeMirror 6、Prettier、Marked、DOMPurify、Highlight.js |
| 服务与存储 | Node.js、Express 5、内置 SQLite、Zod |
| 代码运行 | Web Worker、Pyodide / CPython |
| 开发与测试 | nodemon、Node Test Runner、Python 标准库 |

```text
knowforge/
├── client/                   Vue 页面、组件与浏览器代码运行器
├── server/                   API、判分、备份、SQLite 与服务入口
├── shared/                   前后端共用的输出比较规则
├── data/
│   ├── content/              可维护的课程、示例、练习与来源
│   ├── catalog.json          生成的完整学习数据
│   └── original-handbook.txt 原始参考材料
├── examples/python/          独立 Python 全链路练习
├── scripts/                  数据生成与完整性检查
├── tests/                    API、示例、实验与 Python 集成测试
├── docs/                     完整手册、数据结构、覆盖说明与验收记录
├── runtime/                  本地数据库，忽略提交
├── dist/                     前端构建产物，忽略提交
├── nodemon.json              后端监听范围
└── vite.config.mjs           前端构建与开发配置
```

开发时 Vite 作为 Express 中间件运行，HMR 复用同一个 HTTP server。nodemon 仅监听 `server/`、`shared/` 和 `data/catalog.json`；前端改动由 Vite 处理，数据库、构建产物和 Vite 临时文件不会触发后端重启。

## 开发与扩展

### 添加或修改资料

1. 编辑 `data/content/` 中的结构化内容源；Python、爬虫、REST 和 AI 内容位于 `data/content/expansion/`。
2. 为知识点补充讲解、来源、示例、预期输出、练习与参考答案，并保留明确的输入输出契约。
3. 生成资料并检查数据关系：

```bash
npm run build:data
npm run check:data
```

`build:data` 会同时生成 `data/catalog.json` 与 `docs/完整学习手册.md`。请修改内容源，直接修改生成文件的结果会在下次生成时被覆盖。新增或调整内容 ID 前应考虑已有学习记录的关联。

### 验证

```bash
npm test
npm run build
```

测试涵盖 API 判分、持久化、备份合并、模拟作答、输出比较、课程示例、补全参考解、实验用例和 Python 配套项目。完整测试需要 `python3` 命令指向 Python 3.11+；测试使用独立数据库或临时目录。

贡献内容时，请同时说明示例适用范围和参考依据，为参考实现提供边界用例，并运行相关检查。UI、Worker 与平台兼容性还需要实际浏览器验证。

## 文档

- [完整学习手册](docs/完整学习手册.md)：知识讲解、题目、答案和代码示例。
- [数据结构与扩展](docs/数据结构与扩展.md)：数据模型、API 与维护方式。
- [新增专题覆盖](docs/新增专题覆盖.md)：Python、爬虫、RESTful API 和 AI 内容清单。
- [内容覆盖与校正](docs/内容覆盖与校正.md)：原材料映射与技术说法校正。
- [验收记录](docs/验收记录.md)：自动测试和浏览器检查记录。

## 使用范围与资料说明

KnowForge 面向单人、本机学习，目前没有账号体系、多人数据隔离或云同步。代码在浏览器 Worker 中运行，支持取消和超时，但没有严格内存配额；学习运行器不承担防作弊在线评测职责，也不能直接执行 Vue SFC、DOM 或 Node.js 模块。

Python 运行时随 npm 依赖从本地加载，项目不自动安装第三方 Python 包。课程中的框架、网络、采集和 AI 模型示例按页面标记区分真实语言执行与教学模拟，官方参考链接需要联网访问。

资料用于学习和练习，不代表腾讯或其他机构的官方题库、招聘流程或命中率承诺。涉及平台行为时，应以目标版本的官方文档和实际环境为准。

本仓库暂未添加 `LICENSE`。引用资料的版权归原作者所有，来源见课程引用和覆盖说明。
