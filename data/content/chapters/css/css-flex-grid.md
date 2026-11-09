---
{"id":"css-flex-grid","moduleId":"css","title":"Flex、Grid 与自适应约束","prerequisites":["css-box-bfc"],"sources":["mdn-css"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Flex、Grid 与自适应约束

布局要解决的是内容怎样分配可用空间、怎样对齐、内容变长时怎么办。Flex主要围绕一条主轴分配项目，Grid同时定义行与列的轨道关系。二者可以嵌套，选择依据是布局关系，不是“旧布局与新布局”的替代关系。

先识别容器和直接子项目，再确认主轴、交叉轴或网格轨道。justify-content不是永远水平，align-items也不是永远垂直，它们要结合方向和书写模式理解。

## 可用空间、基准尺寸与最小内容约束

Flex先考虑项目的基准尺寸，再分配正的剩余空间或收缩不足空间。grow决定增长分配，shrink参与负空间收缩，basis提供基准；只写flex:1并不等于忽略内容和最小尺寸。长URL或不换行文本可能受到自动最小尺寸约束，合适位置的min-width:0与断行规则才能让项目真正收缩。

Grid用轨道定义二维关系，fr表示可用空间中的份额，但轨道也受到内容最小尺寸影响。minmax(0,1fr)常用于允许轨道收缩的场景；repeat、auto-fit和minmax可以让卡片数量随容器宽度变化。gap是项目之间的间距，不能简单认为总宽度永远等于列宽乘列数。

响应式设计还要考虑内容本身：按钮翻译后更长、用户字体更大、图片还未加载时的占位。媒体查询看视口，容器查询看组件所在空间；宽屏里的窄侧栏不应被当成大页面主区域。

## 浏览器实验：自适应卡片与长文本

将下列片段保存为HTML并打开。minmax为卡片设定最小宽度，长文字允许断行；这段需要浏览器DOM，不能直接粘到Worker运行区。

```html
<style>
.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr)); gap:1rem; }
.card { border:1px solid #789; padding:1rem; overflow-wrap:anywhere; }
</style>
<div class="cards"><article class="card">一条很长的课程说明与链接</article><article class="card">第二门课程</article></div>
```

## 把机制放到一条完整路径中

```flow
选择与求解布局
识别一维或二维关系｜Flex主轴与Grid轨道
确定基准和可用空间｜包含gap与边框影响
应用伸缩和最小尺寸｜长内容可能阻止缩小
验证不同容器与内容｜布局契约覆盖真实变化
```

## 配套代码：Flex 缩小权重的简化计算

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

在没有 min/max 限制时，按 shrink×basis 分摊负剩余空间。

```javascript
const basis = [200, 100];
const shrink = [1, 1];
const deficit = 60;
const weights = basis.map((size, i) => size * shrink[i]);
const total = weights.reduce((sum, value) => sum + value, 0);
console.log(basis.map((size, i) => size - deficit * weights[i] / total));
```

两个 shrink 都是 1 也不表示等量减少，因为权重还乘基础尺寸。真实 Flex 还要迭代处理 min-content、min/max 和冻结项目，模型未覆盖这些约束。

## 从示例走向实际使用

下面HTML可保存后在浏览器打开，逐渐缩窄窗口并替换成长文本，观察哪一层开始溢出。课内JS模型只能计算份额，真实布局以浏览器盒模型为准。

测试极短与极长内容、缩放、不同语言和键盘焦点。避免为了匹配一张截图固定全部宽高；先写清哪些区域固定、哪些可伸缩、哪些需要换行。
