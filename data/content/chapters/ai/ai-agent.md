---
{"id":"ai-agent","moduleId":"ai","title":"Function Call、工具卡片与执行状态机","prerequisites":["ai-application-anatomy","js-promise"],"sources":["sse","fetch"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Function Call、工具卡片与执行状态机

工具卡片把模型提出的行动与真实执行状态展示给用户。例如“准备修改学习计划”只是一个提议，“已保存计划”必须来自后端成功结果。把模型自然语言直接渲染成成功提示，会让用户误以为操作已经完成。

需要确认的操作应展示具体目标与参数，而不是一个含糊的“允许 AI 操作”按钮。确认必须绑定到这次可审阅的操作。

## 提议、批准与执行版本

后端为操作分配 ID 与版本，保存工具名、目标、参数摘要与风险范围。用户确认后，执行时验证批准仍对应同一版本；如果模型随后把目标 A 改成 B，旧批准不能沿用。参数变化与权限变化都可能要求重新校验。

卡片状态可包含 proposed、awaiting_approval、running、succeeded、failed 与 cancelled。重复点击确认不应重复执行，使用幂等身份与条件转换保护。失败时显示真实业务错误和可用操作，而不是把模型补写的道歉当作系统状态。

工具结果中的敏感数据按权限裁剪，审计记录保留谁批准了哪个版本、执行了什么与结果如何。只读操作也可能涉及私人信息，不应因为没有写入就跳过授权。确认流程与后端权限互补，不能由用户点击替代服务器资源校验。

## 把机制放到一条完整路径中

```flow
可审阅工具操作
形成提议｜保存工具目标参数与版本
展示确认｜让用户审阅具体影响
校验执行｜批准匹配且权限仍有效才调用
记录结果｜按真实执行推进卡片与审计
```

## 配套代码：确认必须绑定最终参数版本

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

同一 operationId 的参数变了，旧确认不能继续放行。

```javascript
const confirmation={operationId:'op-1',version:1,target:'A'};
function canExecute(operation) {
  return operation.id===confirmation.operationId&&operation.version===confirmation.version&&operation.target===confirmation.target;
}
console.log(canExecute({id:'op-1',version:1,target:'A'}));
console.log(canExecute({id:'op-1',version:2,target:'B'}));
```

确认与具体操作和最终参数绑定，参数变化需重新确认。真实服务端还要鉴权、幂等和不可逆动作边界，不能只在前端比字段。

## 从示例走向实际使用

测试确认后参数被修改、重复确认、批准过期、执行中取消与结果重复推送。移动端卡片与弹层应保持目标和确认按钮可读，避免关键参数被折叠隐藏。

课内 canExecute 检查操作身份、版本与目标，展示批准绑定思想；真实实现还需服务端持久记录与权限检查。
