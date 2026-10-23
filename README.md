# KnowForge

**Learn. Practice. Build.**

A learning workbench for full-stack engineering, AI agents, algorithms, and deliberate practice.

**KnowForge · 知行实验室** 是一个基于 Vue 3 与 Node.js 的本地工程学习工作台。把知识讲解、可运行示例、自动验证练习、面试题库和复习记录放在一起，让你边读、边写、边验证。

主要内容为中文，支持 JavaScript 与 Python 双语言代码实验。学习数据可保存在服务端 MySQL 或本机 SQLite，支持账号密码公开注册，无需验证码，也无需配置模型 API Key。未登录会跳转到 `/login`，登录后返回原本访问的页面。

[快速开始](#快速开始) · [功能介绍](#功能介绍) · [学习内容](#学习内容) · [开发与扩展](#开发与扩展) · [文档](#文档)

## 功能介绍

| 功能 | 可以做什么 |
| --- | --- |
| 知识资料库 | 按专题、资料深度、优先级、学习状态和关键词筛选，阅读机制、步骤、误区和参考来源 |
| 边读边试 | 修改每课 JavaScript / Python 示例，运行后查看输出与错误 |
| 随堂练习 | 预测输出、补全代码，通过逐行反馈与测试用例验证理解 |
| 面试题库 | 区分基础自测与迁移训练，练习场景推演、设计取舍、反例与手写代码 |
| 手写实验室 | 在浏览器里实现算法、异步控制与工程工具函数，运行边界用例 |
| 模拟面试 | 默认使用迁移题组卷，也可选择基础或混合题，限时作答、保存草稿并复盘 |
| 复习与计划 | 管理薄弱题、到期复习、收藏、笔记及 7 / 14 / 21 / 30 天学习计划 |
| 账号空间 | 公开注册、登录与退出；个人记录按账号隔离，同账号跨设备接续学习 |
| 数据管理 | 导出完整资料、Markdown 手册和个人备份，合并导入已有学习记录 |

### 代码编辑与运行

编辑器使用 **CodeMirror 6**，支持语法高亮、括号配对、自动缩进、行号与代码草稿恢复。JavaScript 提供常用 API 补全和按需加载的 Prettier 格式化；Python 使用四格缩进。

| 操作 | 快捷键 |
| --- | --- |
| 运行代码 | `Ctrl / ⌘ + Enter` |
| 格式化 JavaScript | `Shift + Alt + F` |
| 缩进 / 反缩进 | `Tab` / `Shift + Tab` |
| 离开编辑器 | 先按 `Esc`，再按 `Tab` |

JavaScript 在独立 Web Worker 中执行；Python 通过本地 Pyodide 运行时在 Worker 中执行。运行支持实时输出、手动停止与 4 秒超时终止；Python 首次初始化需下载约 13 MB 资源并编译 WebAssembly，独立限时 180 秒，显示下载与初始化阶段。后续运行复用浏览器中的版本化资源缓存。课程示例无需调用外部模型或采集真实网站。

Python 加载较慢时显示环境准备窗口：PC 居中弹窗，手机底部面板，展示连接、清单、资源读取、初始化四个阶段，以及资源就绪数量、已读取大小和时间日志。可收起继续阅读、取消加载或复制日志；环境就绪自动关闭，之后仍可回看本次日志。快速加载不闪现弹窗。加载失败可以重新加载并运行，重试会重新校验资源；初始化失败不会记为补全题答错。环境日志和代码的 `print` 输出分别展示。

### 验证与复盘

- **预测输出**：按日志顺序逐行提交，查看缺行、多行和内容差异；JSON 值按结构比较，数值和字符串仍然区分。
- **代码补全与实验**：补上函数实现，逐条查看用例结果，并使用提示或参考解复盘。
- **单选题**：由服务端判分并展示解析。
- **原理与场景题**：对照答案要点自评，记录薄弱项和后续复习。

开放题目前采用自评，没有接入大模型自动打分。模拟面试分别展示客观题成绩和开放题复盘。

正文中的对比表格统一显示表头底色、单元格网格和隔行底色；手机与窄屏 iPad 可在表格内左右滑动，超宽时显示提示，也支持键盘聚焦后横向滚动。

## 学习内容

当前资料版本：**2026-10-23 · 深度与迁移训练**。

| 内容 | 数量 |
| --- | ---: |
| 学习专题 | 21 |
| 知识讲解 | 282（含 24 节 AI 系统基础、39 篇深入专题、13 篇机制深化） |
| 可编辑运行示例 | 282（JavaScript 173 / Python 109） |
| 随堂练习 | 397（预测输出 282 / 代码补全 115） |
| 题库 | 1,047（基础自测 742 / 迁移训练 305，其中公开面经考点改编 60） |
| 代码实验 | 40，配套 174 个用例；新增 12 个算法挑战 |
| 技术资料及公开面经来源 | 116（技术及背景资料 107 / 公开面经来源 9） |
| AI 概念速查 | 108 个中英文词条，含辨析与关联课程 |

| 方向 | 覆盖范围 |
| --- | --- |
| AI 基础与概念 · 24 节 | AI / ML / DL / GenAI、LLM、Token、Embedding、Transformer、训练推理、模型规格、量化、Prompt、RAG、Agent、协议、评估与多模态 |
| JavaScript 与浏览器 | 语言机制、异步调度、网络、CSS、移动端、性能与稳定性 |
| 前端框架与平台 | Vue / React、微信小程序、工程化、Node.js、系统设计 |
| 算法与工程表达 | 数据结构、手写实现、项目深挖、架构讨论、备考与表达 |
| Python · 27 篇 | 对象与容器、函数、迭代器、装饰器、异常、类型、测试、asyncio、并发、SQL 与交付 |
| 爬虫与采集 · 20 篇 | HTTP、解析、分页、编码、robots、限速重试、增量采集、幂等存储与观测 |
| RESTful API · 21 篇 | 资源建模、方法与状态码、校验、分页、缓存、鉴权、幂等、OpenAPI 与服务设计 |
| AI 应用工程 · 32 篇 | 模型推理、解码、上下文工程、RAG 排障、证据契约、结构化输出、缓存路由与模型适配 |
| AI 交互与前端 · 13 篇 | 流式传输、断线恢复与事件一致性、工具交互、多模态、安全渲染与网关 |
| Node.js · 11 篇 | 事件循环、请求上下文、统一 deadline、背压、幂等与 Outbox、队列租约与优雅退出 |
| Agent 框架 · 15 篇 | Microsoft Agent Framework、LangGraph、OpenAI Agents SDK、调度、记忆、MCP、安全沙箱、可观测性与评估 |
| FDE · 4 篇 | 需求发现、价值验证、系统集成、影子与灰度发布、熔断及可审计退款助手案例 |
| 算法迁移 | 窗口、前缀频次、最小覆盖、二分、堆、拓扑排序、并查集、零钱兑换、LIS、编辑距离、区间与带权调度 |

资料分为基础导读、机制深化、深入专题。基础题用于回忆和自测；迁移题独立编写，不复制课内问答，默认用于题库和模拟面试。每篇深入专题包含机制、案例、失败边界和独立问题；算法练习配有输入契约、反例、复杂度与参考解。旧资料保留基础定位，并非全部已重写成深入专题。

### AI 从零到交付

AI 相关五个专题合计 **88 篇**，包含 **24 节递进基础课**与 **28 篇深入专题**。基础路线从概念、模型机制、训练推理开始，接到应用、RAG、工具与 Agent；每课有可运行实验、预测输出及独立场景和选择题。八课另有自动验证补全，逻辑回归一步更新、余弦相似度和分块边界都能在浏览器练习。

进入资料库的 **AI 基础与概念**，可展开 **108 个概念速查词条**，按中英文、缩写和分类搜索，查看易混淆点并跳转完整课程。学习计划新增“AI 从概念到应用”主线。JavaScript 数值课另用 IPv4 与端口编码说明安全整数、32 位位运算和 BigInt 的区别。

| 路线 | 深入主题 |
| --- | --- |
| 模型与数据 | 注意力与 KV Cache、温度与 Top-p、上下文预算与压缩、SFT / LoRA / DPO 及数据泄漏 |
| RAG 与输出 | 分阶段检索排障、主张与证据契约、拒绝与不完整输出、缓存隔离及模型降级 |
| Agent 运行时 | DAG 工具调度、记忆冲突与遗忘、MCP 版本及授权、执行沙箱、轨迹与关键路径、配对评估、多 Agent 状态所有权 |
| 交互与交付 | 流式事件去重与恢复、影子流量与灰度熔断、工单退款助手全链路案例 |

浏览器实验使用确定性策略、构造数据与标准库验证机制，不调用付费模型，也不执行真实退款或 shell。涉及实际服务的协议版本与安全边界在正文中单独说明，参考来源按 2026-10-23 核对；未来接入 SDK 时仍应锁定并验证所用版本。

部分平台、网络及框架示例采用纯语言教学模型，页面会标记其运行范围。通过示例用例不等于在微信宿主、真实网络或生产模型上完成验证。

### 国内公开面经考点

题库新增 **60 道公开面经考点改编题**，来源为 **9 个公开页面**，覆盖字节跳动、腾讯、阿里巴巴、百度、美团、快手、京东、小红书、蚂蚁集团和拼多多。可按 **题目来源类型**与 **公开面经公司**筛选；详情保留原文链接、来源类型、公开日期信息、证据边界、原创参考答案、评分要点与追问。

来源包括候选人自述、社区汇总和经编辑润色的面经，均未经公司确认。部分来源记录了 2026 年 8–10 月的面试，另有只显示月日或明确不公开面试日期的页面，均保留不确定性。只使用可见公开部分，不绕过登录或付费限制，不把单篇样本当出题频率；改写后的场景约束与答案也不冒充逐字原题或原候选人经历。

维护来源时可运行：

```bash
npm run collect:interviews
```

采集器只请求已整理的 HTTPS 来源，读取 robots 策略、顺序访问并限速，设置超时和响应大小上限。结果写入忽略提交的 `output/interview-research/retrieval.json`，包含标题、状态、可见长度、摘要哈希和公开节选标志，不保存文章全文、不自动修改题库。HTTP 200 也可能只是页面空壳，报告会标记；当前九个来源中八个通过直接请求取得可见正文，一个仅能通过公开网页阅读核对，保留为可追踪线索。

## 快速开始

### 环境要求

- **Node.js 22.13 或更高版本**（部署建议 Node.js 24），支持 MySQL 与 Node 内置 SQLite。
- **npm**，用于安装依赖与运行脚本。
- 本机 **Python 3.11+** 仅用于独立 Python 配套项目及相关集成测试；浏览器中的 Python 练习使用 Pyodide。

### 开发运行

下载或克隆仓库后，在项目根目录执行：

```bash
npm ci
npm run dev
```

打开 **[http://127.0.0.1:16666/](http://127.0.0.1:16666/)**。

一条命令同时启动前端 **16666** 与后端 API **6666**，两个服务都只监听本机 `127.0.0.1`。浏览器通过前端入口访问页面；API、JavaScript / Python 运行器及 Python 运行时资源由前端服务转发到后端，热更新使用前端端口。停止使用 `Ctrl+C`。

6666 属于 Chromium 的受限端口，因此应在浏览器访问 **16666**，不需要放开浏览器端口限制。

如需自定义端口，macOS / Linux：

```bash
FRONTEND_PORT=16667 PORT=6667 npm run dev
```

PowerShell：

```powershell
$env:FRONTEND_PORT = "16667"
$env:PORT = "6667"
npm run dev
```

此时访问 `http://127.0.0.1:16667/`。两个端口必须不同；端口被占用时启动会明确报错，不自动递增。环境变量同时适用于开发与构建后的运行方式。

### 构建后运行

```bash
npm run build
npm start
```

构建后仍通过 `http://127.0.0.1:16666/` 访问。前端服务托管 `dist/` 并代理后端，后端 API 保持在 6666。运行时需要安装项目依赖，包括本地 Pyodide 文件。

### GitHub Actions 手动部署

前后端使用两个独立工作流，均只支持手动触发，推送、PR 和标签不会自动部署：

| Actions 名称 | 工作流文件 | 发布目标 |
| --- | --- | --- |
| **Deploy frontend (OSS)** | `.github/workflows/deploy-frontend.yml` | 构建前端，上传 OSS |
| **Deploy backend (SSH)** | `.github/workflows/build-package.yml` | 编译独立 backend-dist 产物，更新 `/www/wwwroot/knowforge` 并按配置重启 |

两者直接复用仓库已配置的 Secrets 和 Variables，名称保持不变，不需要创建 GitHub Environment，也不需要按工作流重复填写。前端仅使用 `OSS_*` 配置，后端仅使用 `SSH_*` 配置；MySQL 仍读取服务器现有 `.env`。

将工作流提交到默认分支后，在 **Actions** 中选择对应名称，点击 **Run workflow**、选择分支并运行。`deploy` 默认开启；取消勾选则前端只构建、后端只生成部署包。两条工作流互不触发，可以单独运行。修改接口、知识数据或 Worker 时需要部署后端；两端都有改动时，对同一个 commit 先部署后端，再部署前端。

构建产物在对应运行的 **Artifacts** 中保留 30 天。后端独立运行包可手动解压后运行 `npm ci --omit=dev` 和 `npm start`。包中只有编译后的 API 服务、题库、实验及下载资源和后端专用依赖清单，不包含前端 dist、原始源码树或整个 docs；原有 .env、服务入口和 16666 API 网关保持兼容。

本地执行 `npm run build:backend` 可检查 `backend-dist/`；执行 `npm run package:deploy` 构建并生成后端压缩包。服务器运行的是编译产物，不执行构建。配置项、重启命令与正式域名配置详见 [服务器部署](docs/服务器部署.md)。

正式前端：`https://knowforge.ookew.com`；正式 API：`https://knowforge-api.ookew.com`。域名已配置在代码中，生产构建自动使用，开发继续走本地代理。请求携带 API 域名会话 Cookie，跨域预检与 CSRF 校验由后端处理；无需新增 Actions Secrets 或 Variables。

### 配置

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `FRONTEND_PORT` | `16666` | 浏览器页面、代理入口与 HMR 端口 |
| `PORT` | `6666` | 后端 API 与运行资源端口 |
| `DB_DRIVER` | `sqlite` | `mysql` 或 `sqlite`，显式选择存储引擎 |
| `DB_PATH` | `runtime/study.sqlite` | SQLite 数据库路径，MySQL 模式忽略 |
| `MYSQL_HOST` / `MYSQL_PORT` | `127.0.0.1` / `3306` | MySQL 地址与端口 |
| `MYSQL_USER` / `MYSQL_PASSWORD` | — / 空字符串 | MySQL 账号与密码 |
| `MYSQL_DATABASE` | — | 已存在的 MySQL 数据库名 |
| `MYSQL_TABLE_PREFIX` | `knowforge_` | 应用表前缀，1–40 个字母、数字或下划线 |
| `MYSQL_SSL` / `MYSQL_SSL_CA` | `false` / — | 启用证书验证的 TLS；可选 CA 文件绝对路径 |

例如，在 macOS / Linux 下使用独立学习库：

```bash
DB_PATH=runtime/personal.sqlite npm run dev
```

启动入口会加载项目根目录 `.env`，已有进程环境变量优先。可以复制 `.env.example` 为 `.env`，填写数据库信息后运行 `npm run dev` 或 `npm start`。`.env` 已排除 Git 与部署包。

服务器使用已有 MySQL 时，设置 `DB_DRIVER=mysql` 并填写 `MYSQL_*`。应用自动在指定库中创建账号、会话和个人学习表，不创建数据库；账号需要该库的建表、查询、插入、更新、删除权限。连接失败会终止启动，不会悄悄切回 SQLite。配置示例、TLS 和迁移步骤见 [MySQL 部署配置](docs/服务器部署.md#mysql-数据库配置)。

## 学习数据与备份

进度、笔记、收藏、作答、复习、计划和模拟记录统一保存在所选数据库。MySQL 模式使用 `MYSQL_DATABASE` 中的 `knowforge_*` 表；默认 SQLite 模式使用 **`runtime/study.sqlite`**。应用关闭后数据保留，`runtime/` 中的数据库文件已排除 Git。

公开注册后，每个账号从空白记录开始。升级前的共享记录不会自动归属任何注册用户；旧共享表不再通过学习接口访问。

同一套账号数据库下，用相同账号在不同设备登录可访问自己的进度和已提交记录。切换数据库不会自动复制账号或记录；需要保留某份学习状态时，可先登录原账号导出个人 JSON 备份，在目标库注册并登录账号后导入。

在“资料来源与数据”页面可以导出：

- **完整资料 JSON**：知识点、问答、答案、实验、用例与来源。
- **Markdown 学习手册**：适合离线阅读的完整学习内容。
- **个人 JSON 备份**：学习状态与已提交的练习记录，支持预览后合并导入。

**未提交的代码草稿保存在当前浏览器的 localStorage 中，不包含在个人 JSON 备份里。** 重要草稿请单独另存。直接复制 SQLite 文件前应先停止服务，避免遗漏尚未合并的 WAL 数据。

代码草稿按站点来源和账号 ID 隔离，同一浏览器切换账号也不会混用草稿。旧版未分账号的草稿不再自动读取；草稿不在设备间同步。

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
| 服务与存储 | Node.js、Express 5、MySQL / 内置 SQLite、Zod |
| 代码运行 | Web Worker、Pyodide / CPython |
| 开发与测试 | nodemon、Node Test Runner、Python 标准库 |

```text
knowforge/
├── client/                   Vue 页面、组件与浏览器代码运行器
├── server/                   API、判分、备份、MySQL / SQLite 与服务入口
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

开发时 Vite 作为前端 Express 服务的中间件运行，HMR 使用前端端口；`server/frontend.mjs` 将 API 和 Worker 资源流式代理到后端，并保留浏览器 Host，使写入校验和 Python Worker CSP 保持同源。nodemon 仅监听 `server/`、`shared/` 和 `data/catalog.json`；前端改动由 Vite 处理，数据库、构建产物和 Vite 临时文件不会触发后端重启。

## 开发与扩展

### 添加或修改资料

1. 编辑 `data/content/` 中的结构化内容源；Python、爬虫、REST 和 AI 基础内容位于 `data/content/expansion/`。新增深度正文、运行代码、迁移题和算法位于 `data/content/v3/`；`entries.json` 保存元信息，`lessons/` 保存正文，`code/` 保存确定性实验。
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

MySQL 集成测试单独运行 `npm run test:mysql`，需通过环境变量提供测试库的 `MYSQL_*` 连接信息；每项测试创建并清理随机前缀表。Actions 手动打包时会自动运行隔离 MySQL 测试，不使用生产凭据。

贡献内容时，请同时说明示例适用范围和参考依据，为参考实现提供边界用例，并运行相关检查。UI、Worker 与平台兼容性还需要实际浏览器验证。

## 文档

- [完整学习手册](docs/完整学习手册.md)：知识讲解、题目、答案和代码示例。
- [数据结构与扩展](docs/数据结构与扩展.md)：数据模型、API 与维护方式。
- [新增专题覆盖](docs/新增专题覆盖.md)：Python、爬虫、RESTful API 和 AI 内容清单。
- [内容覆盖与校正](docs/内容覆盖与校正.md)：原材料映射与技术说法校正。
- [验收记录](docs/验收记录.md)：自动测试和浏览器检查记录。
- [服务器部署](docs/服务器部署.md)：手动打包、产物下载、服务器运行与 HTTPS 反向代理。

## 使用范围与资料说明

KnowForge 支持公开注册和个人学习记录隔离。账号为 3–32 位字母、数字、下划线或短横线，不区分大小写；密码为 8–128 位。登录会话有效期 7 天，退出会立即注销当前会话。当前没有邮箱验证、自助密码找回或管理员界面，请妥善保管密码。数据库请求在单个 Node 进程内串行处理，部署使用单实例，不启用 PM2 cluster 或多副本。代码在浏览器 Worker 中运行，支持取消和超时，但没有严格内存配额；学习运行器不承担防作弊在线评测职责，也不能直接执行 Vue SFC、DOM 或 Node.js 模块。

Python 运行时随 npm 依赖从本地加载，项目不自动安装第三方 Python 包。课程中的框架、网络、采集和 AI 模型示例按页面标记区分真实语言执行与教学模拟，官方参考链接需要联网访问。正文中的真实 SDK/服务代码需要按说明在本地安装依赖；涉及模型的示例还需自行配置服务端凭据和模型，浏览器实验不会偷偷请求模型。

资料用于学习和练习，不代表腾讯或其他机构的官方题库、招聘流程或命中率承诺。涉及平台行为时，应以目标版本的官方文档和实际环境为准。

本仓库暂未添加 `LICENSE`。引用资料的版权归原作者所有，来源见课程引用和覆盖说明。


### Python 运行环境排查

前后端分域部署时，Python Worker 与 `/python-runtime/` 都由 API 域名提供。前端从 OSS 加载页面，再通过 API 的隔离运行器启动 Worker。首次加载较慢时可展开环境准备窗口里的“加载日志”，查看文件名、HTTP/MIME 错误和初始化阶段，并复制排查；等待过程中可以停止。进度条表示已就绪资源数量，初始化阶段不估造百分比。

1. 检查 `https://knowforge-api.ookew.com/python-runtime/manifest.json` 返回 JSON，不能返回站点首页；该清单使用 `Cache-Control: no-store`。
2. 按清单 `base` 检查 `pyodide.js`、`pyodide.asm.mjs`、`pyodide.asm.wasm`、`python_stdlib.zip` 和 `pyodide-lock.json` 都返回 200；WASM 类型必须是 `application/wasm`。
3. 运行资源使用版本路径与长期缓存，避免不同版本混用。资源缺失返回明确 404；错误会包含资源名、HTTP 状态或 MIME 原因。
4. 发布这次更新需要分别运行前端、后端两个部署 Actions。只更新 OSS 不能更新后端运行资源清单和 Worker；不要把 API 的资源路径转发成前端 SPA 页面。

框架概念与 API 示例参考 [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/)、[LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)、[OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk) 等官方资料，核对日期为 2026-10-23。升级框架时仍需按目标版本复核示例。
