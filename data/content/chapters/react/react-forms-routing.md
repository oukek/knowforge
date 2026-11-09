---
{"id":"react-forms-routing","title":"React 表单与路由：受控输入、URL 状态和请求竞争","moduleId":"react","prerequisites":["react-hooks","net-ajax"],"sources":["react"],"new":true,"order":7,"logs":["event loop"],"example":"const form={query:'  event loop  '};\nconsole.log(form.query.trim());","exampleDescription":"纯输入规范化示例；React 表单事件与路由需要在项目环境中运行。"}
---
## 输入框有 DOM 状态，也可以由 React 管理
受控输入用 value 与 onChange 将内容与 state 联系起来。用户每次输入都提交新值，React 用该值渲染输入框。非受控输入由 DOM 保存当前值，可在提交时通过 FormData 等读取。二者都能使用，但一个输入不能在生命周期里无意地在受控与非受控之间切换。

value 为 undefined 与空字符串语义不同；数值输入也可能暂时是空或无效字符串，不要每次按键就强行转为0。表单的验证、触碰状态、服务端错误和提交状态应有明确归属。
## 受控输入与非受控输入分别把状态放在哪里

受控输入使用value或checked由React状态决定当前值，并在onChange中更新状态；非受控输入由DOM维护，初始值用defaultValue等提供，提交时通过表单或ref读取。两者都可用于合适场景，但同一个输入不应在生命周期中无意从undefined的非受控状态切成受控状态。

用户输入是字符串，即使input类型为number，也要处理空值、非法格式和业务范围。校验错误应与对应字段关联，提交中应防重复操作，服务端仍需重新校验。客户端校验改善体验，不承担可信授权和数据完整性的最终责任。

## 路由状态、表单草稿与请求状态怎样协作

路由参数表示当前资源，query可保存筛选和分页，使页面可分享与刷新恢复。表单草稿通常属于当前编辑实例，切换资源时要明确保留、提示未保存还是重置。用key有意重建编辑器可以表达重置，但随机key会让每次渲染都丢失输入。

请求状态至少区分未开始、进行中、成功、失败，成功但数据为空与尚未完成不是一回事。用户切换路由后旧请求仍可能返回，应取消或拒绝过期结果。权限检查既可在路由交互层给出提示，也必须在API按可信身份执行。

浏览器返回、深链接刷新和移动端输入法组合都应纳入验证。不要把所有键盘事件都当完整输入提交；中文输入法组合期间的处理要尊重composition相关行为。表单是否可用最终体现在用户能否正确完成动作，而不是只看状态变量是否变化。

## 一段受控提交代码
```jsx
import {useState} from 'react';
export default function SearchForm({onSearch}) {
  const [query,setQuery]=useState('');
  function submit(event) {
    event.preventDefault();
    onSearch(query.trim());
  }
  return <form onSubmit={submit}>
    <label htmlFor="query">搜索课程</label>
    <input id="query" value={query} onChange={e=>setQuery(e.target.value)} />
    <button>搜索</button>
  </form>;
}
```
提交回调由父组件处理，可把筛选条件同步到 URL，再由页面请求数据。不要只绑定按钮 click 而漏掉 Enter 提交。标签、错误关联和焦点是功能的一部分，不是最后再补的装饰。
## URL 应保存哪些状态
资源 ID 放路径，可分享的筛选排序放 query，短暂弹窗状态按产品需要决定。React 本身不内置完整路由库，需要选择框架或路由方案，并遵守它的数据加载与导航约定。history 模式部署时要正确回退页面路径，不能把 API 错误也回退成 HTML。
```flow
搜索页面的状态关系
输入草稿｜用户可以继续编辑
提交条件｜成为本次有效查询
URL 参数｜可分享、可前进后退
请求数据｜用查询键与取消管理生命周期
结果视图｜处理 loading、空、错误与成功
```
## 快速导航为什么容易显示错数据
当 URL 从课程A变成B，A的慢响应可能晚于B返回。Effect 清理、AbortController 与过期标记共同保证只接受当前请求。取消不代表服务端没有执行，因此写请求还需幂等与状态核对。

测试浏览器前进后退、刷新深层地址、快速连续查询、输入为空与请求失败后重试。前端路由守卫只改善体验，后端仍需验证用户对具体资源的权限。URL 可见、会进入日志和历史，不应携带密钥或敏感正文。
