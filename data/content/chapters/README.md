# 连续教程源文件

每课独立Markdown，首部两条`---`之间是一行JSON元数据，正文以`## 标题`分节。构建时直接替换对应lesson.sections，不在旧摘要后堆叠一层相同内容。

- 已有课程使用稳定id；新增课程设置new、moduleId、order、sources、example与logs，并在assessments.json提供独立问答、场景和参考答案。
- prerequisites填写课程ID，构建检查引用；同专题排序按先修关系展开。不要用“高级”标题代替解释基础术语。
- 每节从一个具体概念或问题展开成段落，说明语法含义、各部分关系与适用条件。代码注明运行位置，真实组件与教学模型分清。
- flow围栏第一行是图标题，之后每行用`节点名称｜说明`。网页渲染为有序流程图，Markdown手册保留可读源码。分支与循环需在文字里准确说明，不能用一条直线暗示不存在的顺序。
- 新Go课程首个go围栏必须是完整可执行标准库程序，配合logs逐行验证；Go课程runtime为local。Python代码围栏应能独立执行，需第三方环境的片段应明确其文件与依赖边界。
- Vue完整SFC使用html围栏，React使用jsx；目前自动验证SFC编译与JSX语法，不宣称验证所有外部框架集成。

执行`npm run build:data`、`npm run check:data`、`npm run audit:lessons -- --write-report`和`npm test`。Go正文验证需本机Go工具链，Python正文验证需Python3.11及以上。不要因测试通过或达到某个字数，就认定教学内容已经足够易懂。
