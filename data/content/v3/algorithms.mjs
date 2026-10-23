import { labs } from "../labs.mjs";
function add(
  id,
  lessonId,
  title,
  signature,
  solution,
  tests,
  complexity,
  hints,
  prompt,
) {
  labs.push({
    id,
    lessonId,
    title,
    prompt,
    signature,
    starter: signature + ' {\n  throw new Error("尚未实现");\n}',
    solution,
    tests: tests.map(([name, code]) => ({
      name,
      code: code
        .replace(
          new RegExp(
            "\\b" + signature.match(/function\s+(\w+)/)[1] + "\\b",
            "g",
          ),
          "fn",
        )
        .replaceAll("assert.deepEqual(", "equal(")
        .replaceAll("assert.equal(", "equal(")
        .replaceAll("assert.ok(", "assert(")
        .replace(
          "assert.throws(()=>fn([1],0),RangeError);",
          "let threw=false;try{fn([1],0);}catch(error){threw=error instanceof RangeError;}assert(threw);",
        ),
    })),
    complexity,
    hints,
    difficulty: "进阶",
    pool: "transfer",
    provenance: "editorial",
    timeLimitMs: 4000,
  });
}
add(
  "window-distinct",
  "algo-window-invariants",
  "最长无重复子串 · Unicode 码点",
  "function longestDistinct(text)",
  `function longestDistinct(text) {
  const chars = Array.from(text),
    last = new Map();
  let left = 0,
    best = 0;
  for (let right = 0; right < chars.length; right++) {
    if (last.has(chars[right]))
      left = Math.max(left, last.get(chars[right]) + 1);
    last.set(chars[right], right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}`,
  [
    ["重复回退", 'assert.equal(longestDistinct("abba"),2);'],
    ["码点", 'assert.equal(longestDistinct("😀a😀b"),3);'],
    ["空", 'assert.equal(longestDistinct(""),0);'],
    ["长重复", 'assert.equal(longestDistinct("a".repeat(100000)),1);'],
  ],
  "O(n) 时间 / O(n) 额外空间（含码点数组）；位置 Map 为 O(min(n,字符种类))",
  [
    "left 只向前移动，不能退回旧重复位置。",
    "Array.from 按码点拆分；不要求字素簇。",
    "用 abba 解释为什么要 max。",
  ],
  "返回按 Unicode 码点计算的最长无重复连续子串长度；空串为 0。要求 O(n) 时间，不能把 emoji 的代理对当两个字符。",
);
add(
  "prefix-count",
  "algo-window-invariants",
  "含负数的子数组和计数",
  "function countSubarrays(nums, target)",
  `function countSubarrays(nums, target) {
  const counts = new Map([[0, 1]]);
  let sum = 0,
    total = 0;
  for (const value of nums) {
    sum += value;
    total += counts.get(sum - target) ?? 0;
    counts.set(sum, (counts.get(sum) ?? 0) + 1);
  }
  return total;
}`,
  [
    ["负数", "assert.equal(countSubarrays([1,-1,1],1),3);"],
    ["零重复", "assert.equal(countSubarrays([0,0,0],0),6);"],
    ["空", "assert.equal(countSubarrays([],0),0);"],
    ["大输入", "assert.equal(countSubarrays(Array(50000).fill(1),2),49999);"],
  ],
  "O(n) 时间 / O(n) 空间",
  [
    "从 prefix[j]-prefix[i]=target 推导查询键。",
    "先查询历史频次，再记录当前前缀。",
    "初始前缀 0 的频次为 1。",
  ],
  "计算和恰好为 target 的非空连续子数组数量，输入可含负数和零。采用前缀频次，要求 O(n)，不要使用只对非负数成立的窗口。",
);
add(
  "minimum-cover",
  "algo-window-invariants",
  "最小覆盖窗口 · 重复字符",
  "function minimumCover(source, target)",
  `function minimumCover(source, target) {
  const a = Array.from(source),
    b = Array.from(target);
  if (!b.length) return "";
  const need = new Map(),
    have = new Map();
  for (const c of b) need.set(c, (need.get(c) ?? 0) + 1);
  let formed = 0,
    left = 0,
    start = 0,
    size = Infinity;
  for (let right = 0; right < a.length; right++) {
    const c = a[right];
    have.set(c, (have.get(c) ?? 0) + 1);
    if (need.has(c) && have.get(c) === need.get(c)) formed++;
    while (formed === need.size) {
      if (right - left + 1 < size) {
        size = right - left + 1;
        start = left;
      }
      const old = a[left++];
      have.set(old, have.get(old) - 1);
      if (need.has(old) && have.get(old) < need.get(old)) formed--;
    }
  }
  return size === Infinity ? "" : a.slice(start, start + size).join("");
}`,
  [
    ["典型", 'assert.equal(minimumCover("ADOBECODEBANC","ABC"),"BANC");'],
    ["需求重复", 'assert.equal(minimumCover("aab","aa"),"aa");'],
    ["不存在", 'assert.equal(minimumCover("a","aa"),"");'],
    ["空目标", 'assert.equal(minimumCover("abc",""),"");'],
    ["码点", 'assert.equal(minimumCover("😀ab😀c","😀c"),"😀c");'],
  ],
  "O(n+m) 时间 / O(n+m) 额外空间（含码点数组）；频次表为 O(字符种类)",
  [
    "need 保存频次而非 Set。",
    "满足全部需求后反复收缩左边界。",
    "只有跨越需求阈值时修改 formed。",
  ],
  "返回包含 target 全部码点及所需重复次数的最短连续子串；并列时取最早出现的一段；无解或空目标返回空串。",
);
add(
  "binary-lower-bound",
  "algo-search-dp",
  "二分查找第一个不小于目标的位置",
  "function lowerBound(nums, target)",
  `function lowerBound(nums, target) {
  let left = 0,
    right = nums.length;
  while (left < right) {
    const mid = left + Math.floor((right - left) / 2);
    if (nums[mid] < target) left = mid + 1;
    else right = mid;
  }
  return left;
}`,
  [
    ["重复边界", "assert.equal(lowerBound([1,2,2,4],2),1);"],
    ["末尾插入", "assert.equal(lowerBound([1,2],3),2);"],
    ["空", "assert.equal(lowerBound([],7),0);"],
    ["最左", "assert.equal(lowerBound([2,3],1),0);"],
    [
      "较大输入",
      "assert.equal(lowerBound(Array.from({length:100000},(_,i)=>i*2),199999),100000);",
    ],
  ],
  "O(log n) 时间 / O(1) 空间",
  [
    "维护半开区间 [left,right)。",
    "nums[mid]<target 才丢弃 mid。",
    "返回 n 也是合法边界。",
  ],
  "nums 已按非递减排序，返回首个 >= target 的索引；不存在返回数组长度。不得线性扫描，解释重复值与空区间。",
);
add(
  "heap-kth",
  "algo-graph-heap",
  "第 K 大元素 · 有界小根堆",
  "function kthLargest(nums, k)",
  `function kthLargest(nums, k) {
  if (!Number.isInteger(k) || k < 1 || k > nums.length)
    throw new RangeError("k");
  const heap = [];
  function push(x) {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (heap[p] <= heap[i]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  }
  function down() {
    let i = 0;
    while (true) {
      let j = i,
        l = i * 2 + 1,
        r = l + 1;
      if (l < heap.length && heap[l] < heap[j]) j = l;
      if (r < heap.length && heap[r] < heap[j]) j = r;
      if (j === i) break;
      [heap[i], heap[j]] = [heap[j], heap[i]];
      i = j;
    }
  }
  for (const x of nums) {
    if (heap.length < k) push(x);
    else if (x > heap[0]) {
      heap[0] = x;
      down();
    }
  }
  return heap[0];
}`,
  [
    ["重复值计数", "assert.equal(kthLargest([3,2,3,1,2,4,5,5,6],4),4);"],
    ["负数", "assert.equal(kthLargest([-8,-1,-3],2),-3);"],
    ["最大", "assert.equal(kthLargest([2,1],1),2);"],
    ["非法", "assert.throws(()=>kthLargest([1],0),RangeError);"],
    [
      "不改输入",
      "const input=[3,1,2];kthLargest(input,2);assert.deepEqual(input,[3,1,2]);",
    ],
  ],
  "O(n log k) 时间 / O(k) 空间",
  [
    "堆顶是 k 个候选里最小的值。",
    "只替换大于堆顶的新元素。",
    "重复元素按位置计数，不去重。",
  ],
  "返回包含重复元素在内的第 k 大数。k 非整数或越界抛 RangeError，不修改输入，使用 O(k) 额外空间的堆。",
);
add(
  "graph-topological",
  "algo-graph-heap",
  "有向依赖图拓扑排序与环检测",
  "function topologicalOrder(n, edges)",
  `function topologicalOrder(n, edges) {
  const next = Array.from({ length: n }, () => []),
    degree = Array(n).fill(0),
    queue = [];
  for (const [a, b] of edges) {
    next[a].push(b);
    degree[b]++;
  }
  for (let i = 0; i < n; i++) if (degree[i] === 0) queue.push(i);
  for (let head = 0; head < queue.length; head++)
    for (const b of next[queue[head]]) if (--degree[b] === 0) queue.push(b);
  return queue.length === n ? queue : null;
}`,
  [
    [
      "合法次序",
      "const edges=[[0,2],[1,2],[2,3]],out=topologicalOrder(5,edges);assert.equal(new Set(out).size,5);assert.deepEqual([...out].sort((a,b)=>a-b),[0,1,2,3,4]);for(const[a,b]of edges)assert.ok(out.indexOf(a)<out.indexOf(b));",
    ],
    ["环", "assert.equal(topologicalOrder(2,[[0,1],[1,0]]),null);"],
    ["自环", "assert.equal(topologicalOrder(1,[[0,0]]),null);"],
    ["空图", "assert.deepEqual(topologicalOrder(0,[]),[]);"],
    ["重复边", "assert.deepEqual(topologicalOrder(2,[[0,1],[0,1]]),[0,1]);"],
  ],
  "O(V+E) 时间和空间",
  [
    "节点全集是 0..n-1，含孤立节点。",
    "入度减到 0 才入队。",
    "输出不足 n 代表不存在完整拓扑序。",
  ],
  "有向边 [a,b] 表示 a 必须先于 b。返回任意合法拓扑序，含全部孤立节点；有环返回 null。输入节点合法，可有重复边。",
);
add(
  "dp-coin-change",
  "algo-search-dp",
  "最少硬币数 · 贪心反例",
  "function minimumCoins(coins, amount)",
  `function minimumCoins(coins, amount) {
  const dp = Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let total = 1; total <= amount; total++)
    for (const c of coins)
      if (c <= total) dp[total] = Math.min(dp[total], dp[total - c] + 1);
  return dp[amount] === Infinity ? -1 : dp[amount];
}`,
  [
    ["贪心失败", "assert.equal(minimumCoins([1,3,4],6),2);"],
    ["不可达", "assert.equal(minimumCoins([2],3),-1);"],
    ["零", "assert.equal(minimumCoins([2,3],0),0);"],
    ["空面额", "assert.equal(minimumCoins([],5),-1);"],
    ["一般", "assert.equal(minimumCoins([1,2,5],11),3);"],
  ],
  "O(amount × 面额数) 时间 / O(amount) 空间",
  [
    "dp[x] 是凑 x 的最少数量。",
    "dp[0]=0，不可达为 Infinity。",
    "枚举最后一枚硬币，而不是总取最大面额。",
  ],
  "面额为正整数，每种无限枚，求组成非负整数 amount 的最少枚数；不可达返回 -1。说明 [1,3,4] 凑 6 的贪心反例。",
);
add(
  "dp-lis-length",
  "algo-search-dp",
  "最长严格递增子序列 · 二分优化",
  "function lisLength(nums)",
  `function lisLength(nums) {
  const tails = [];
  for (const x of nums) {
    let l = 0,
      r = tails.length;
    while (l < r) {
      const m = l + Math.floor((r - l) / 2);
      if (tails[m] < x) l = m + 1;
      else r = m;
    }
    tails[l] = x;
  }
  return tails.length;
}`,
  [
    ["典型", "assert.equal(lisLength([10,9,2,5,3,7,101,18]),4);"],
    ["严格递增", "assert.equal(lisLength([2,2,2]),1);"],
    ["空", "assert.equal(lisLength([]),0);"],
    ["降序", "assert.equal(lisLength([4,3,2,1]),1);"],
    [
      "大递增",
      "assert.equal(lisLength(Array.from({length:30000},(_,i)=>i)),30000);",
    ],
  ],
  "O(n log n) 时间 / O(n) 空间",
  [
    "tails[i] 代表长度 i+1 的最小结尾。",
    "找第一个 >= x 的位置，严格递增不追加重复值。",
    "tails 不一定是原数组的实际子序列。",
  ],
  "返回最长严格递增子序列的长度，不要求连续。必须优于 O(n²)，重复值不能增长长度，不修改输入。",
);
add(
  "dp-edit-distance",
  "algo-search-dp",
  "编辑距离 · 滚动数组与 Unicode",
  "function editDistance(left, right)",
  `function editDistance(left, right) {
  let a = Array.from(left),
    b = Array.from(right);
  if (a.length < b.length) [a, b] = [b, a];
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length];
}`,
  [
    ["常见", 'assert.equal(editDistance("kitten","sitting"),3);'],
    ["空", 'assert.equal(editDistance("","abc"),3);'],
    ["相同", 'assert.equal(editDistance("慢快","慢快"),0);'],
    ["码点", 'assert.equal(editDistance("😀a","😀b"),1);'],
    [
      "对称",
      'assert.equal(editDistance("abc","ab"),editDistance("ab","abc"));',
    ],
  ],
  "O(mn+m+n) 时间；DP 行 O(min(m,n)) 空间，计入码点数组后总额外空间 O(m+n)",
  [
    "状态表示两个前缀之间的最少操作数。",
    "三种操作对应删除、插入和替换。",
    "滚动数组必须保留上一行对角信息。",
  ],
  "按 Unicode 码点计算插入、删除、替换的最少次数，每次成本为 1。采用滚动数组控制额外空间。",
);
add(
  "interval-merge",
  "algo-search-dp",
  "闭区间合并与输入不可变性",
  "function mergeClosed(intervals)",
  `function mergeClosed(intervals) {
  const rows = intervals
      .map((x) => [...x])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    out = [];
  for (const [start, end] of rows) {
    const last = out.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}`,
  [
    ["首尾相接", "assert.deepEqual(mergeClosed([[1,2],[2,4]]),[[1,4]]);"],
    [
      "嵌套与乱序",
      "assert.deepEqual(mergeClosed([[5,8],[1,9],[2,3]]),[[1,9]]);",
    ],
    ["空", "assert.deepEqual(mergeClosed([]),[]);"],
    [
      "保留输入",
      "const rows=[[3,4],[1,2]];mergeClosed(rows);assert.deepEqual(rows,[[3,4],[1,2]]);",
    ],
    ["不相交", "assert.deepEqual(mergeClosed([[1,2],[4,6]]),[[1,2],[4,6]]);"],
  ],
  "O(n log n) 时间 / O(n) 输出与副本空间",
  [
    "排序后只比较当前段与结果最后一段。",
    "闭区间相接也重叠。",
    "浅复制外层还会修改内层数组，需复制每个区间。",
  ],
  "输入合法闭区间 [start,end]，合并重叠或首尾相接的区间并按起点排序。不得修改原数组及其中的区间对象。",
);
add(
  "graph-components",
  "algo-graph-heap",
  "并查集计算无向连通分量",
  "function componentCount(n, edges)",
  `function componentCount(n, edges) {
  const parent = Array.from({ length: n }, (_, i) => i),
    size = Array(n).fill(1);
  let count = n;
  function find(x) {
    while (x !== parent[x]) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  for (const [a, b] of edges) {
    let x = find(a),
      y = find(b);
    if (x === y) continue;
    if (size[x] < size[y]) [x, y] = [y, x];
    parent[y] = x;
    size[x] += size[y];
    count--;
  }
  return count;
}`,
  [
    ["孤立节点", "assert.equal(componentCount(5,[[0,1],[1,2],[3,4]]),2);"],
    ["重复不减", "assert.equal(componentCount(3,[[0,1],[1,0],[0,0]]),2);"],
    ["无边", "assert.equal(componentCount(4,[]),4);"],
    ["空", "assert.equal(componentCount(0,[]),0);"],
    [
      "链",
      "assert.equal(componentCount(30000,Array.from({length:29999},(_,i)=>[i,i+1])),1);",
    ],
  ],
  "O((V+E) α(V)) 摊还时间 / O(V) 空间",
  [
    "find 用路径压缩。",
    "只在不同根合并时减少分量数。",
    "按集合大小合并避免退化。",
  ],
  "顶点为 0..n-1，输入合法无向边，可含重复边和自环；返回包含孤立顶点的连通分量数。使用路径压缩和按大小合并。",
);
add(
  "weighted-schedule",
  "algo-search-dp",
  "带收益任务调度 · 二分加 DP",
  "function maxJobProfit(jobs)",
  `function maxJobProfit(jobs) {
  const rows = jobs.map((x) => ({ ...x })).sort((a, b) => a.end - b.end),
    dp = Array(rows.length + 1).fill(0);
  for (let i = 1; i <= rows.length; i++) {
    const job = rows[i - 1];
    let l = 0,
      r = i - 1;
    while (l < r) {
      const m = l + Math.floor((r - l) / 2);
      if (rows[m].end <= job.start) l = m + 1;
      else r = m;
    }
    dp[i] = Math.max(dp[i - 1], dp[l] + job.profit);
  }
  return dp[rows.length];
}`,
  [
    [
      "带权选择",
      "assert.equal(maxJobProfit([{start:1,end:3,profit:50},{start:2,end:4,profit:10},{start:3,end:5,profit:60}]),110);",
    ],
    [
      "长任务更值钱",
      "assert.equal(maxJobProfit([{start:0,end:10,profit:100},{start:0,end:2,profit:2},{start:2,end:3,profit:2}]),100);",
    ],
    ["空", "assert.equal(maxJobProfit([]),0);"],
    [
      "不修改",
      "const jobs=[{start:2,end:3,profit:5},{start:0,end:1,profit:2}];const before=JSON.stringify(jobs);maxJobProfit(jobs);assert.equal(JSON.stringify(jobs),before);",
    ],
  ],
  "O(n log n) 时间 / O(n) 空间",
  [
    "按结束时间排序。",
    "dp[i] 比较不选与选当前任务。",
    "二分得到 end<=start 的兼容前缀长度。",
  ],
  "每个任务含 start<end 与非负 profit，单执行器不能重叠；end 等于下一任务 start 时允许衔接。返回最大总收益，不修改输入。",
);
