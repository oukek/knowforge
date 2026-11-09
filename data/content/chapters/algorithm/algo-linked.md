---
{"id":"algo-linked","moduleId":"algorithm","title":"链表反转与指针不变量","prerequisites":["algo-solving-basics"],"sources":["mdn-js"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识链表反转与指针不变量

单链表由一个个节点组成，每个节点保存值和指向下一个节点的引用。数组用连续下标定位元素，链表则沿 next 逐个前进。反转链表要求改变引用方向，使原来的尾节点成为头节点，不只是把值倒序打印。

对 1→2→3→空，目标是 3→2→1→空。节点仍是原来的三个对象，变化的是谁指向谁。若只改第一个节点的 next 而没有保存后续入口，就会失去访问剩余链表的路径。

## 三个指针如何保证不丢节点

循环维护 prev 和 current：prev 指向已经反转好的前缀，current 指向尚未处理部分的头。每轮先用 next 保存 current 原来的后继，再把 current.next 指向 prev，最后让 prev 与 current 向前推进。保存后继必须发生在覆盖 next 之前。

初始 prev 为 null，表示反转后的尾部应指向空；current 为原头。处理节点 1 后，已反转部分是 1→空，未处理部分是 2→3；处理节点 2 后变成 2→1→空 与 3；current 最后为空时，prev 就是新头。这个循环不变量解释了为什么每轮都能安全继续。

每个节点访问一次，时间 O(n)，只使用固定数量引用，额外空间 O(1)。递归也能反转，但调用栈通常占 O(n)，很长链表可能超过栈深。若输入含环，普通反转循环的前提不成立，应先明确题目保证无环还是需要单独处理。

## 手推 1→2→3

| 轮次结束 | prev 所指链 | current 所指链 |
| --- | --- | --- |
| 初始 | 空 | 1→2→3 |
| 第一轮 | 1→空 | 2→3 |
| 第二轮 | 2→1→空 | 3 |
| 第三轮 | 3→2→1→空 | 空 |

表中两部分覆盖已处理与未处理节点；临时 next 负责在改箭头时保持连接信息。

## 把机制放到一条完整路径中

```flow
迭代反转
保存后继｜记住尚未处理部分的入口
反转箭头｜当前节点指向已反转前缀
推进边界｜更新 prev 与 current
返回新头｜未处理部分为空时取 prev
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

反转后使用返回的新头，原 head 变为尾节点。

```javascript
function reverseList(head) {
  let prev=null, current=head;
  while(current){const next=current.next;current.next=prev;prev=current;current=next}
  return prev;
}


const third={val:3,next:null};
const second={val:2,next:third};
const first={val:1,next:second};
const head=reverseList(first),values=[];
for(let node=head;node;node=node.next) values.push(node.val);
console.log(values);
console.log(first.next===null);
```

反转复用原节点，先保存 next 再改指针；返回值指向新的头，原 first 成为尾。调用方若仍从旧 head 遍历，只会看到一个节点。

## 从示例走向实际使用

手动画每次赋值前后的箭头，尤其检查 next 保存与 current 推进顺序。测试空链表、单节点和两个节点，比直接跑一百个节点更容易发现尾部没断开的问题。

课内输出同时检查节点值顺序与原头的 next 是否为空，说明验收不能只看打印结果，还应检查结构本身是否正确。
