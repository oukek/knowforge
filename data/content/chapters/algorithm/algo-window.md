---
{"id":"algo-window","moduleId":"algorithm","title":"滑动窗口与不变量","prerequisites":["algo-solving-basics"],"sources":["mdn-js"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识滑动窗口与不变量

滑动窗口用左右边界描述数组或字符串中的连续一段。它适合那些能随边界移动维护条件的问题，不是所有子数组题都能套用。最长无重复子串要求找到连续且没有重复字符的最长片段，“子串”不能跳过中间字符。

对 abba，答案长度是 2，可以选 ab 或 ba；aba 虽然没有相邻重复，却不是原字符串中的连续无重复片段。

## 左边界为什么只能向前

窗口维护一个不变量：当前区间内没有重复字符。右边界加入字符 c 时，如果 c 上次出现在当前窗口内，左边界必须跳到那次位置之后。若上次位置已经在窗口外，则不能把左边界向后退，因此更新要取原 left 与 last(c)+1 的较大值。

手推 abba：读 a 得到 a；读第一个 b 得到 ab；读第二个 b，左边界跳过旧 b，窗口变 b；读最后 a 时，旧 a 已在窗口外，左边界保持，窗口变 ba。遗漏 max 会把边界退回去，把重复的 b 又包含进来。

每个右边界只前进一次，左边界也不后退，时间 O(n)，额外存储与不同字符数量相关。JavaScript 字符串索引按 UTF-16 代码单元，Array.from 可按 Unicode 码点遍历；完整用户感知字符还可能由多个码点组成，题目必须说明字符单位。

## abba 的窗口变化

| 右下标 | 字符 | 左下标 | 当前窗口 | 最大长度 |
| --- | --- | --- | --- | --- |
| 0 | a | 0 | a | 1 |
| 1 | b | 0 | ab | 2 |
| 2 | b | 2 | b | 2 |
| 3 | a | 2 | ba | 2 |

最后一行的旧 a 位于窗口外，不能把左边界改回 1。

## 把机制放到一条完整路径中

```flow
无重复窗口
扩展右边｜读入下一个字符
检查重复｜查询它在当前窗口中的旧位置
推进左边｜越过旧位置且绝不后退
更新答案｜记录当前合法窗口长度
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

左边界只能向前；按 Unicode 码点统计长度。

```javascript
function longestUnique(text) {
  const chars=Array.from(text),last=new Map();let left=0,best=0;
  for(let right=0;right<chars.length;right++){const c=chars[right];if(last.has(c))left=Math.max(left,last.get(c)+1);last.set(c,right);best=Math.max(best,right-left+1)}
  return best;
}


console.log(longestUnique('abba'));
console.log(longestUnique('😀a😀b'));
console.log(longestUnique(''));
```

abba 不能把左边界因第二个 a 向后退；表情按码点视为一个元素。此例不等同完整用户感知字素簇分割，组合字符另有语义。

## 从示例走向实际使用

先写清窗口条件和破坏条件，再决定用集合、频次表还是最后位置表。最小覆盖问题要维护频次，不能把本题的“最后位置”方法直接套过去。

测试空串、全相同、全部不同、abba 和包含表情的字符串。验证边界移动过程，比只比较最终数字更容易发现不变量被破坏的位置。
