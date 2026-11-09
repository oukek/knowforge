---
{"id":"algo-tree","moduleId":"algorithm","title":"二叉树遍历、层序与显式栈","prerequisites":["algo-solving-basics"],"sources":["mdn-js"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识二叉树遍历、层序与显式栈

二叉树的每个节点最多有左、右两个孩子。遍历是按照某种规则访问所有节点：前序先访问根，再左、右；中序先左，再根、右；后序先左、右，再根。这里的“前中后”描述根节点相对于两个子树的访问位置。

层序遍历则按深度逐层访问，例如根为 1，孩子为 2 和 3，2 又有孩子 4，结果按层组织为 [[1],[2,3],[4]]。

## 栈保存返回位置，队列保存下一层

递归遍历借用调用栈保存“处理完孩子后回到哪里”。显式栈把这份状态写到数据结构中，适合避免深树递归溢出。前序用栈时通常先压右孩子再压左孩子，因为栈后进先出，左孩子才能先被取出。中序需要沿左链入栈，再逐个访问并转向右子树。

层序使用先进先出的队列。每轮开始记录当前队列尾位置或当前层数量，只处理这一批节点，新加入的孩子留到下一轮。若一边入队一边用不断增长的总长度当当前层范围，就会把多层混在一起。

每个节点访问一次，时间 O(n)。深度优先额外空间与树高相关，广度优先与最大层宽相关；退化成链的树和非常宽的树，会分别暴露两种方式的空间边界。JavaScript 大数组反复 shift 可能带来不必要移动，使用头下标更容易控制队列开销。

## 把机制放到一条完整路径中

```flow
层序遍历
根入队｜建立第一层待访问节点
固定边界｜记录本轮应处理的数量
访问入队｜输出本层并加入孩子
进入下一层｜重复直到队列耗尽
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

逐层收集树节点，当前层终点在处理前固定。

```javascript
function levelOrder(root) {
  if(!root)return [];
  const queue=[root],output=[];let head=0;
  while(head<queue.length){const end=queue.length,level=[];while(head<end){const node=queue[head++];level.push(node.val);if(node.left)queue.push(node.left);if(node.right)queue.push(node.right)}output.push(level)}
  return output;
}


const root={val:1,left:{val:2,left:{val:4}},right:{val:3}};
console.log(levelOrder(root));
console.log(levelOrder(null));
```

层序队列把每层的节点划到一起，空树返回空结果。示例按树契约，不处理带环图；使用 head 游标可避免反复 shift。

## 从示例走向实际使用

先用四个节点手推栈或队列，再写循环。测试空树、只有根、单侧长链和完整多层树，检查输出层级与访问顺序。

课内实现用 end 固定本层边界。观察新增孩子为什么不在当前层被处理，有助于理解 BFS 中距离逐层增加的性质。
