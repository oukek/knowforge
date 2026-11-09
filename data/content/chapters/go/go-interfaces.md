---
{"id":"go-interfaces","title":"Go 接口与泛型：行为契约、方法集合和 typed nil","moduleId":"go","prerequisites":["go-struct-methods"],"sources":["go-docs"],"new":true,"language":"go","order":5,"logs":["Go","true","false"],"exampleExplanation":"Course满足Name方法契约，先输出 Go。pointer是nil指针，但赋给any后接口携带动态类型 *Course，因此pointer == nil为true，接口value == nil为false。"}
---
## 接口表达需要什么能力
接口描述一组方法，具体类型只要满足方法集合就隐式实现，不需要声明 implements。把参数定义为小接口，让函数依赖需要的能力，而不是依赖某个巨大具体实现。例如日志写入只需要 Write，就可以接受文件、缓冲区或测试替身。

接口值可以从动态类型与动态值两个角度理解。只有二者都没有时接口才等于 nil；接口里装着一个具体类型的 nil 指针时，接口本身通常不等于 nil。这是错误返回和资源判断中的常见陷阱。
## 隐式实现怎样减少双方耦合

假设一个函数只需要Name方法，参数就可以声明为包含Name的小接口。Course实现Name后便满足它，不要求Course预先知道这个调用者存在。这样调用方可以在自己的边界定义最小依赖，具体实现来自本地对象、远端适配器或测试替身。接口应描述行为，不是为了把结构体所有方法原样复制一遍。

类型T的方法集合包含值接收者方法，*T的方法集合还包括指针接收者方法。可寻址变量调用指针方法时，语法可能自动取地址，但把T赋给接口并不会凭空获得*T的方法集合。这解释了为什么有时`value.Change()`能编译，而把value交给某接口却失败，需要传&value。

## 接口里已经有值时，怎样安全识别能力

类型断言`value, ok := item.(Concrete)`在匹配时取出动态值，失败时ok为false。只有单返回值的断言失败会panic，因此外部可变数据边界应使用安全形式。type switch适合处理有限的已知类型分支，但如果业务到处断言十几种实现，接口可能没有表达真正共同的能力。

any是空接口的别名，它允许保存任意类型，却没有承诺任何专有方法。它适合通用容器边界，不会自动让任意值都能相加、排序或安全JSON编码。接口比较也有约束：若动态值本身不可比较，比较两个接口值可能panic；不要把任意接口都当稳定map键。

接口为nil与动态值为nil需要分别理解。返回error时若构造了一个nil具体指针再装入error接口，调用者可能看到err != nil。成功路径应明确返回nil接口，错误路径返回有意义的错误值；不能靠格式化输出看起来像nil来判断状态。

## 行为契约的完整示例
```go
package main

import "fmt"

type Named interface{ Name() string }
type Course struct{ Title string }

func (c Course) Name() string { return c.Title }
func printName(value Named)   { fmt.Println(value.Name()) }
func main() {
	printName(Course{Title: "Go"})
	var pointer *Course
	var value any = pointer
	fmt.Println(pointer == nil)
	fmt.Println(value == nil)
}
```
最后两个比较分别为 true、false，因为 value 保存了动态类型 *Course。不要因此调用所有方法都认为安全：方法是否能接受 nil 接收者取决于实现，解引用 nil 会 panic。
## 方法集合与接口设计
类型 T 的值方法与 *T 的指针方法集合不同。一个只实现指针接收者方法的类型，通常需要传 *T 才满足对应接口；调用语法中能自动取地址，不代表接口赋值时方法集合也被随意扩大。
```flow
接口调用的理解路径
调用方声明最小能力｜只列真正需要的方法
具体类型提供方法｜隐式满足契约
接口值保存动态类型和值｜实际调用分派到具体实现
调用方依据契约使用｜不依赖内部字段和实现细节
```
接口适合在使用方定义。若每个结构体都先写一份全字段接口，容易产生没有实际隔离价值的抽象。测试替身应模拟外部行为，不必复制真实内部实现。
## 泛型与接口不是二选一
泛型通过类型参数复用算法和容器，约束限定允许的操作；普通接口通过方法集表达运行时行为多态。通用 Map/Set 操作可能适合泛型，数据库仓储或外部服务能力常用小接口。不要为了避免写两个短函数就引入复杂类型参数组合。

使用类型断言时处理失败，type switch 适合有限类型分支；频繁把 any 再断言回大量具体类型，往往说明边界设计不清。API 需要说明 nil、错误与并发使用契约，接口本身不会替你定义这些语义。
