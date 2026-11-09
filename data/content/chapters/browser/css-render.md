---
{"id":"css-render","moduleId":"css","title":"浏览器如何绘制 UI：从 DOM 到屏幕像素","prerequisites":["net-navigation"],"sources":["mdn-css","html-loop"]}
---
## 屏幕上的按钮，最初并不是一张图片

浏览器收到的是 HTML 字节、CSS 文本、JavaScript 和图片等资源。屏幕却只能显示像素。渲染的任务就是把“这是按钮”“宽度跟随父容器”“文字用这个字体”等描述，逐步变成可显示的像素。DOM 是页面结构的对象表示，CSS 规则描述样式，二者都不是屏幕截图。

例如下面的卡片有一段文字和一个按钮。浏览器不仅要知道它们是什么，还要决定文字用多大的字体、折成几行、按钮放在哪里、哪些像素用绿色填充。父容器宽度改变，文字可能重新换行，即使文字内容没有变化，后续按钮的位置也会改变。这就是为什么渲染不是简单地“把 HTML 画出来”。

本课把现代浏览器的过程拆成便于理解的阶段。不同引擎可能合并步骤或用不同内部结构；实际性能分析应以浏览器性能面板记录为准，不能把示意图当成所有版本的源码调用链。

## 第一阶段：把文档与样式变成可计算的数据

HTML 解析器读入字符，识别标签、属性和文本，并构造 DOM 节点。DOM 是树形结构：section 包含 h2 和 button，元素的父子关系会影响继承、选择器和布局。解析可以随着网络数据分段到达逐步推进，并非总要等完整 HTML 下载完才开始。

CSS 同样需要解析。浏览器为元素匹配规则，并结合层叠顺序、优先级、继承和默认样式计算最终样式。作者写的 `font-size: inherit` 不是最终可绘制尺寸，必须先知道父元素的字体。`width: 50%` 也还需要布局时确定参考尺寸。不要把“计算样式”误认为所有几何尺寸已经确定。

普通同步脚本可能读取或修改 DOM，因此解析器遇到它时可能暂停。defer 和 module 脚本有各自的下载、执行时序，async 则在准备好时执行。CSS 并不简单等于“阻塞所有 HTML 解析”，但样式会影响渲染及某些脚本的执行时机。排查白屏需要区分文档解析、资源加载、脚本执行与可见内容出现。

```flow
从页面描述到显示结果
HTML → DOM｜节点、文本、父子结构
CSS + DOM → 计算样式｜层叠、继承、选择器匹配
布局 Layout｜确定需要布局的盒子的尺寸与位置
绘制 Paint｜记录背景、边框、文字、阴影等绘制指令
栅格化 Raster｜把指令转换为图块像素
合成 Composite｜组合图层，提交可以显示的一帧
```

## 第二阶段：布局解决“放在哪里，占多大”

布局需要结合格式化上下文、包含块、字体度量和内容，计算盒子的几何信息。普通块流、Flex 和 Grid 的分配规则不同。例如宽度 300px 的容器内有很长的文本，浏览器需要按字体与可用宽度寻找换行位置；文本行数又决定容器高度，继而影响后续元素的位置。

DOM 与布局结构不是一一对应：`display:none` 的子树不参与普通布局；一个行内元素换行后可能产生多个片段；伪元素也可能生成需要布局或绘制的盒子。`visibility:hidden` 通常仍保留布局位置，只是不显示内容。理解这点后，就不会把“DOM 节点数量”当成全部渲染成本。

布局可以局部更新，也可能因依赖扩散。修改父容器宽度容易影响子元素换行和兄弟位置；修改某个独立区域则可能影响更小。CSS containment 可以限定部分依赖，但它改变布局语义，不能为了性能随意加在所有元素上。

## 第三阶段：绘制、栅格化和合成各负责什么

Paint 关心如何画：先画背景，再画边框、文本等，并遵守层叠顺序和裁剪规则。栅格化把这些指令变成实际像素，通常分块处理，因此大面积背景、复杂阴影和图片也会有成本。合成负责按顺序组合可复用的内容，可能利用 GPU，但不能由“用了 GPU”推断一定更快。

如果只改变一个可独立合成元素的 transform，浏览器可能复用已有像素并改变它的位置，避免每一帧重新布局和绘制。但是否独立合成、是否发生栅格化、纹理是否需要重新上传，都取决于实际情况。`will-change` 是提示，不是免费加速按钮；过多图层会占用内存并增加管理成本。

注意框架的 render 与浏览器 paint 是不同层次：Vue 或 React 先计算需要怎样更新 DOM，浏览器随后才根据 DOM 和样式产生像素。组件函数执行一次，不代表浏览器立即画一帧；DOM 修改完成，也不代表用户已经看到。

## 用一个完整页面观察阶段差异

把下列内容保存为 `render.html`，在浏览器打开。它需要真实 DOM，请不要把 HTML 粘到课内 JavaScript Worker 运行区。

```html
<!doctype html>
<meta charset="utf-8">
<title>观察布局与绘制</title>
<style>
  #card { width: 280px; padding: 16px; border: 1px solid #789;
          font: 18px/1.6 sans-serif; background: #eef6ee; }
  #card.wide { width: 420px; }
  #card.color { background: #ffe4b5; }
  #card.shift { transform: translateX(60px); }
</style>
<div id="card">这段文字会随着容器宽度改变而重新换行。观察卡片下面按钮的位置。</div>
<button id="layout">改变宽度</button>
<button id="paint">改变背景</button>
<button id="move">改变 transform</button>
<script>
const card = document.querySelector('#card');
document.querySelector('#layout').onclick = () => card.classList.toggle('wide');
document.querySelector('#paint').onclick = () => card.classList.toggle('color');
document.querySelector('#move').onclick = () => card.classList.toggle('shift');
</script>
```

打开开发者工具的 Performance 面板，录制后分别点击三个按钮，查看 Style、Layout、Paint 等记录；也可开启 Paint flashing 观察重新绘制的区域。改变宽度会影响换行；改变背景不需要因为颜色本身重新计算几何；transform 移动的是视觉结果，普通流中的占位仍保留。是否只发生合成，以本次记录为证据。

## 把这些机制用于实际页面

做首屏优化时先问内容卡在哪个阶段：HTML 迟到应检查服务响应和网络；脚本占满主线程应分析长任务；布局反复发生应检查尺寸读写；图片解码和巨大绘制区域则不是删一个 JavaScript 函数就能解决的。

图片提供 width/height 或 aspect-ratio，让布局提前知道占位，能减少图片到达后把文字推开的情况。字体交换也可能改变文字宽度，须结合字体策略、回退字体和实测布局偏移处理。动画优先选择可避免几何重算的属性，但必须检查图层与内存。

学习时分别解释“结构”“样式”“几何”“绘制指令”“像素”“图层组合”，再沿着一次 DOM 更新追踪它们。这样才能准确回答浏览器如何渲染 UI，而不是只背 DOM + CSSOM = 渲染树这一句。
