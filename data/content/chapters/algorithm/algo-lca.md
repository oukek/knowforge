---
{"id":"algo-lca","moduleId":"algorithm","title":"最近公共祖先与节点存在性","prerequisites":["algo-solving-basics"],"sources":["mdn-js"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识最近公共祖先与节点存在性

两个节点的公共祖先，是从根到这两个节点的路径上共同出现的节点；最近公共祖先是其中深度最大的一个。“最近”指树上的包含关系，不是节点值差最小。一个节点也可以是自己的祖先。

如果 p 是 q 的祖先，答案就是 p；如果 p 与 q 是同一个节点，答案也是该节点。题目是否保证两者都存在，决定算法需不需要额外验证。

## 父指针路径与递归返回值

一种直观方法是遍历整棵树，为每个节点记录父节点。把 p 到根的路径放入集合，再从 q 向上走，遇到的第一个集合成员就是最近公共祖先。因为 q 的祖先按由近到远访问，第一次命中已经是最深的共同位置。

递归方法则让每个子树报告是否找到目标：若左右两边分别返回目标线索，当前根就是分叉点；若只一边有线索，向上传递那一边。常见简写默认 p、q 都在树中；若其中一个不存在，单纯返回找到的另一个节点会错误地看起来像答案，需要计数或先验证存在性。

节点值可能重复，因此 Map 与 Set 应按节点身份记录，不能只用 val。普通二叉树不能利用值大小选择左右方向；只有题目明确是满足相应规则的二叉搜索树时，才能使用有序性质简化。大量重复查询还可考虑预处理方案，但单次问题无需过度设计。

## 把机制放到一条完整路径中

```flow
父路径求公共祖先
遍历建表｜记录每个节点的父节点
验证存在｜确保两个目标属于该树
记录一路｜把 p 到根加入集合
回溯另一路｜q 向上首次命中即答案
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

两个目标必须都存在；同值的另一个对象不是同一节点。

```javascript
function lowestAncestor(root,p,q) {
  if(!root||!p||!q)return null;
  const parent=new Map([[root,null]]),stack=[root];
  while(stack.length){const node=stack.pop();for(const child of [node.left,node.right])if(child){parent.set(child,node);stack.push(child)}}
  if(!parent.has(p)||!parent.has(q))return null;
  const path=new Set();for(let x=p;x;x=parent.get(x))path.add(x);
  for(let x=q;x;x=parent.get(x))if(path.has(x))return x;
  return null;
}


const p={val:2},q={val:3},root={val:1,left:p,right:q};
console.log(lowestAncestor(root,p,q)===root);
console.log(lowestAncestor(root,p,{val:3}));
console.log(lowestAncestor(root,p,p)===p);
```

第一组在根分叉，第二组 q 的同值新对象并不在树里，第三组同一目标存在时祖先就是自身。该解使用父指针表，空间 O(n)。

## 从示例走向实际使用

手画两条根路径，找到最后一个共同节点，再与程序输出比较。测试祖先关系、相同节点、不存在节点和重复值节点。

课内父映射方案时间与额外空间都是 O(n)，优势是存在性和路径都清楚。之后再学习递归或倍增时，应保持同一问题契约。
