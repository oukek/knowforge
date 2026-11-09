---
{"id":"css-mobile","moduleId":"css","title":"viewport、DPR、rpx 与 1px","prerequisites":["css-box-bfc","css-flex-grid"],"sources":["mdn-css"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识viewport、DPR、rpx 与 1px

手机页面至少涉及CSS像素、设备像素和视口。CSS像素是布局使用的抽象单位，设备像素是屏幕物理采样单位，devicePixelRatio描述两者在当前环境中的比例。它会受到设备与缩放等因素影响，不能把某个手机型号固定等同于一套永久比例。

布局视口用于页面布局，视觉视口表示用户当前可见区域，键盘、地址栏和缩放会改变可见空间。理解这两个范围，才能解释固定按钮为什么在软键盘弹出后被挡住。

## 尺寸、图片清晰度与动态可见区域

viewport元信息通常把布局宽度关联设备宽度，使CSS响应式规则按合理尺寸工作。图片的布局尺寸与像素资源尺寸不同，高DPR屏幕可能需要更高分辨率资源，但超大图片又增加下载、解码和内存成本；使用适合的srcset与sizes表达候选，而不是所有设备都下载最大图。

传统100vh在移动浏览器工具栏变化时可能不等于当前可见高度，svh、lvh、dvh表达不同视口概念，需按目标环境支持情况选择。安全区域env值用于避开刘海和底部指示区域，不等于通用外边距。键盘出现还应验证VisualViewport等行为，不能只在桌面缩窗口判断。

小程序rpx是平台定义的响应式尺寸单位，与CSS rem、vw或设备像素不是同一概念。细线常涉及边框在设备像素上的采样，transform缩放可以在限定场景使用，但可能改变坐标、模糊或包含块行为。不要为了追求1物理像素而牺牲文本和交互可见性。

## 浏览器实验：动态高度与安全区域

该页面结构让正文可滚动，底部操作保留安全区域。dvh按动态视口计算，仍需在目标手机上验证键盘和浏览器工具栏行为。

```html
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body { margin:0; min-height:100dvh; display:flex; flex-direction:column; }
main { flex:1; padding:1rem; }
footer { padding:1rem 1rem calc(1rem + env(safe-area-inset-bottom)); }
</style>
<main>正文与输入区域</main><footer><button>保存</button></footer>
```

## 把机制放到一条完整路径中

```flow
移动端尺寸推理
识别CSS与设备像素｜布局单位不等于物理点
确认布局与视觉视口｜键盘、工具栏和缩放会变化
按内容分配尺寸｜图片、文字与安全区域分别处理
真机验证交互｜触摸、分屏、旋转和大字体
```

## 配套代码：rpx、CSS 像素与设备像素

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

将 750 设计宽下的 rpx 转为 CSS 像素，再按 DPR 估算设备像素尺度。

```javascript
const viewportWidth = 375;
const dpr = 3;
const rpxToCssPx = value => value * viewportWidth / 750;
console.log(rpxToCssPx(100));
console.log(rpxToCssPx(100) * dpr);
console.log(1 * dpr);
```

375 宽下 100rpx 对应 50 CSS px，DPR=3 时约 150 设备像素尺度。实际细线效果还受缩放和栅格化影响，这不是浏览器或小程序真实测量。

## 从示例走向实际使用

使用真实设备检查输入、旋转、分屏、地址栏收起与大字体，iPad尤其需要测试宽屏中的窄分栏。触摸目标、hover替代与滚动弹层也属于移动适配。

课内数值例子只说明换算关系，不保证实际截图每条线都精确落在一个物理像素。浏览器设置与平台无障碍能力也可能保留用户缩放，布局应能承受合理尺寸变化。
