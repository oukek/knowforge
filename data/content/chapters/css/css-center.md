---
{"id":"css-center","moduleId":"css","title":"居中方案、尺寸约束与溢出","prerequisites":["css-box-bfc","css-flex-grid"],"sources":["mdn-css"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识居中方案、尺寸约束与溢出

居中需要先说明相对于谁、在哪个方向、内容是否参与普通流，以及尺寸是否已知。文本在行内居中、一个块盒在父容器居中、未知尺寸弹层在视口居中，是不同问题，不能用一个left:50%解决所有情况。

正常布局通常优先使用Flex或Grid的对齐能力；绝对定位适合明确脱离普通流的覆盖层。选择方式会影响父高度、后续元素位置和内容溢出处理。

## 空间分配与几何平移的区别

块元素设置合适宽度后，左右auto margin可以分配剩余空间实现水平居中；没有剩余空间或布局条件不满足时效果不同。text-align:center对行内内容生效，不是给所有子块移动位置。Flex的justify-content与align-items按轴工作，Grid的place-items组合对齐属性。

绝对定位left:50%把元素的定位参考边放到包含块中点，再translateX(-50%)按自身参考盒宽度回退一半，两个百分比参考不同对象。top与translateY同理。绝对定位会脱离普通流，父容器不能依赖它自动撑高；transform还会影响渲染与某些包含块关系。

固定居中不应让长内容跑到屏幕外且无法滚动。弹窗需要最大可用高度、内部滚动、外边距和安全区域，手机上长表单可能更适合全屏布局。字体放大或翻译变长后，所谓“完美居中”可能反而损害可达性，内容可读可操作优先。

## 浏览器实验：可溢出的居中面板

Grid对齐适用于内容较短的面板，max-height和overflow保证较长内容仍可阅读。真实模态还需焦点、遮罩与背景交互管理。

```html
<style>
.stage { min-height:70dvh; display:grid; place-items:center; padding:1rem; }
.panel { width:min(100%,30rem); max-height:60dvh; overflow:auto; padding:1rem; box-sizing:border-box; border:1px solid #789; }
</style>
<div class="stage"><section class="panel">可替换成很长的正文。</section></div>
```

## 把机制放到一条完整路径中

```flow
确定居中方案
说明参照与方向｜文本、盒子、容器或视口
优先选择流内对齐｜Flex、Grid或auto margin
覆盖层再考虑定位平移｜明确包含块和自身尺寸
处理超长内容｜滚动、最大高度和触摸可达
```

## 配套代码：居中偏移与超高内容

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

尺寸已知时用差值的一半说明几何居中；超出容器时需要保证内容可达。

```javascript
function offset(container, content) { return (container - content) / 2; }
console.log(offset(300, 100));
console.log(offset(300, 500));
console.log(Math.max(0, offset(300, 500)));
```

内容超高时几何居中偏移会为负，顶部可能跑出可滚动区域。最后一行用顶部对齐作概念对照；真实弹窗需设置高度约束、overflow 和焦点可见。

## 从示例走向实际使用

先尝试正常流中的Grid居中，再用超长正文、软键盘和小高度窗口验证溢出。不要把固定宽高与负margin绑定到唯一设计稿尺寸。

课内数值模型解释平移几何，实际页面还受到padding、边框、包含块与滚动容器影响。用开发者工具逐层检查尺寸，而不是只修改中心元素。
