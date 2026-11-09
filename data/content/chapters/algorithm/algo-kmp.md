---
{"id":"algo-kmp","moduleId":"algorithm","title":"字符串匹配：朴素算法与 KMP","prerequisites":["algo-solving-basics"],"sources":["mdn-js"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识字符串匹配

字符串匹配是在文本中寻找模式串第一次完整出现的位置。朴素算法在每个可能起点逐字比较，失败后换下一个起点；当文本和模式有大量重复前缀时，已经比较过的字符会被反复检查。KMP 通过模式自身的重复结构减少这些重复工作。

核心问题是：已经匹配了一段前缀，下一字符不匹配时，前面哪些字符仍可能作为下一次匹配的开头？答案来自这段已匹配内容的相同前缀与后缀。

## 前缀函数保存可复用的匹配长度

pi[i] 表示模式从 0 到 i 这一段中，最长的、既是前缀又是后缀的真子串长度。“真”表示不能把整段自己算进去。例如 abab 的最长相同真前后缀是 ab，长度 2；所以匹配 abab 后失配，可以保留长度 2 的匹配事实。

构建 pi 时，j 表示当前可延续的前缀长度。若新字符与 pattern[j] 不同，就令 j=pi[j-1]，尝试更短的候选边界；匹配则 j 加一。搜索文本时采用同样回退规则，只回退模式位置，不把文本指针退回。

虽然代码中有 while 回退，总回退次数受前进次数约束，构建加搜索的时间为 O(m+n)，额外空间 O(m)。返回位置的单位要与实现一致：JavaScript 直接字符串下标是 UTF-16 代码单元位置，不一定是用户感知字符编号。空模式返回什么也属于契约，示例约定为 0。

## 把机制放到一条完整路径中

```flow
KMP 匹配
预处理模式｜计算每个前缀的最长边界
顺序读文本｜维护已匹配长度
失配回退｜沿 pi 保留可复用后缀
完整命中｜返回起点并遵守索引单位
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

前缀表复用已匹配信息，文本指针不回退。

```javascript
function findSubstring(text,pattern) {
  if(!pattern.length)return 0;
  const pi=new Array(pattern.length).fill(0);
  for(let i=1,j=0;i<pattern.length;i++){while(j>0&&pattern[i]!==pattern[j])j=pi[j-1];if(pattern[i]===pattern[j])j++;pi[i]=j}
  for(let i=0,j=0;i<text.length;i++){while(j>0&&text[i]!==pattern[j])j=pi[j-1];if(text[i]===pattern[j])j++;if(j===pattern.length)return i-j+1}
  return -1;
}


console.log(findSubstring('abababcababaca','ababaca'));
console.log(findSubstring('😀abc','abc'));
console.log(findSubstring('abc',''));
```

第一次匹配在 7；UTF-16 里表情占两个码元，所以 abc 索引为 2；空模式按契约返回 0。复杂度为 O(n+m)，索引不是用户感知字符位置。

## 从示例走向实际使用

先为 ababaca 手算 pi=[0,0,1,2,3,0,1]，重点解释遇到 c 时为何连续回退。再把这张表用于文本搜索，观察文本指针始终不后退。

测试模式长于文本、完全无匹配、重复前缀、空模式和包含表情的文本。理解回退保存了什么事实，比记住两层循环更重要。
