## 二分维护的是区间事实
lower_bound 在已排序数组上找第一个 >= target 的位置，返回 n 表示不存在。采用 [left,right) 时，初始化 right=n，循环 left<right；若 nums[mid]<target，则 mid 及其左侧都不可能是答案，令 left=mid+1，否则 right=mid。每一步区间缩小，循环结束 left=right 即边界。

不要用 (left+right)>>1 计算任意大索引，它会触发 32 位整数转换；使用 left+Math.floor((right-left)/2)。重复值、全小于、全大于和空数组是边界定义的检验，不是附加装饰。
## 动态规划的四个问题
状态代表什么，转移依赖哪些较小状态，初始条件如何定义，遍历顺序如何保证依赖已计算。最少硬币数可定义 dp[x] 为凑出 x 的最少硬币个数，dp[0]=0，不可达为 Infinity；枚举最后一枚硬币得到 dp[x]=min(dp[x-c]+1)。这与统计组合数量不是同一个问题，交换循环顺序可能改变计数语义。
## 贪心反例与 LIS
面额 [1,3,4] 凑 6，最大面额优先得到 4+1+1，最优是 3+3，说明局部最优不一定能扩展成全局最优。LIS 的 tails[len] 记录该长度递增子序列可达到的最小结尾，用二分替换第一个 >= x 的位置；tails 本身未必是原数组中的一条真实子序列，返回长度可以，恢复路径则需前驱索引。
## 加权区间调度
按结束时间排序任务，dp[i] 表示前 i 个任务的最大收益。选择第 i 个任务时，使用二分找到最后一个 end<=start[i] 的兼容任务，转移是 max(不选的 dp[i-1], profit[i]+兼容前缀最优)。按最高收益或最早开始贪心都可能失败；无权的最多任务数量与带权最大收益需要区分。
## 可运行例子与证据
```javascript
function lowerBound(a,target){
 let left=0,right=a.length;
 while(left<right){const mid=left+Math.floor((right-left)/2);if(a[mid]<target)left=mid+1;else right=mid;}
 return left;
}
console.log(lowerBound([1,2,2,4],2)); // 1
console.log(lowerBound([1,2,2,4],5)); // 4
```
把 < 改为 <= 就变成寻找第一个 > target 的另一种边界。迁移训练应要求解释新的循环不变量，而不是只背最后一行改了符号。
## 测试与复杂度
零钱兑换按金额上线评估 O(amount×面额数) 是否可承受；LIS 长度可 O(n log n)，朴素 dp 为 O(n²)。用随机小样本和暴力解做差分测试，再用大样本验证复杂度。正确答案样例只能证明某个输入，不能证明边界和最优性。
