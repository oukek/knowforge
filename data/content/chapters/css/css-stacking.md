---
{"id":"css-stacking","moduleId":"css","title":"层叠上下文与 z-index","prerequisites":["css-box-bfc","css-flex-grid"],"sources":["mdn-css"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识层叠上下文与 z-index

z-index不是整个页面共用的一张排名表。层叠上下文把一组元素的绘制顺序封装成一个整体，子元素的层级主要在所属上下文里比较。子元素即使写很大的z-index，也不能无条件越过祖先所在的整体层级。

可以把它理解为多层文件夹：文件夹之间先排序，文件夹内的纸张再排序。提高纸张在自己文件夹中的位置，不会把整个文件夹移到另一个文件夹上方。

## 创建上下文、定位与裁剪

根元素建立层叠上下文，某些定位加z-index、transform、opacity等也可能创建新的上下文；具体触发条件要按属性和布局类型确认。元素创建上下文不等于创建独立合成图层，也不等于一定发生GPU加速，这属于不同渲染层次。

绘制顺序还受背景、普通流、定位元素和层叠级别等规则影响。负z-index可能把内容放到意外位置，不能拿它作为通用“放底下”。当弹窗被遮挡时，沿祖先检查上下文与整体层级，比把z-index加到无限大更有效。

overflow裁剪和层叠顺序也不同：一个元素可能层级足够高，却仍被祖先裁掉。定位包含块又是另一概念，transform祖先可能影响固定定位行为。Teleport或Portal把弹层挂到适当宿主可以改变祖先关系，但焦点、滚动锁定和嵌套层级仍需组件管理。

## 浏览器实验：子元素的大数为什么无效

两个父容器各自建立层叠上下文。把父容器a的z-index从1改成3，比较与只修改child数值的区别；请放在浏览器页面中运行。

```html
<style>
.a,.b { position:absolute; width:180px; height:100px; }
.a { z-index:1; background:#dce; }
.b { z-index:2; left:80px; top:50px; background:#acd; }
.child { position:relative; z-index:9999; }
</style>
<div class="a"><span class="child">仍属于a上下文</span></div><div class="b">b</div>
```

## 把机制放到一条完整路径中

```flow
排查遮挡
找到元素的所属上下文｜检查祖先触发属性
比较上下文整体顺序｜子级大数不跨越祖先
区分裁剪与包含块｜overflow和定位不等于层级
调整挂载和层级协议｜再验证焦点与遮罩交互
```

## 配套代码：z-index 是分层比较的模型

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

把父上下文和子层级组成向量，按祖先顺序比较，而不是只取子级最大数字。

```javascript
function compareLayers(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  }
  return Math.sign(a.length - b.length);
}
console.log(compareLayers([1, 99999], [2, 1]));
console.log(compareLayers([2, 10], [2, 5]));
```

父层级 1 里的巨大子级仍排在父层级 2 后面；父级相同才比较内部。真实 CSS 绘制顺序还有定位、负层级和 top layer 等规则，需在 DOM 中验证。

## 从示例走向实际使用

为页面、固定导航、弹窗、提示与嵌套选择器制定层级约定，并明确各自挂载位置。使用浏览器检查祖先样式，不靠盲目添加position和z-index试错。

真实弹层还要验证遮罩点击、键盘退出、焦点恢复与移动端滚动。可见层级正确只是交互正确的一部分，背景不可操作也要单独实现。
