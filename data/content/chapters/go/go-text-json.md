---
{"id":"go-text-json","title":"Go 字符串、rune 与 JSON：字节、文本和接口输入","moduleId":"go","prerequisites":["go-struct-methods"],"sources":["go-docs"],"new":true,"language":"go","order":4.5,"logs":["6 2","Go 30"],"exampleExplanation":"UTF-8中的两个汉字共占6个字节，utf8.RuneCountInString统计2个码点，所以第一行输出6 2。JSON解码将字段恢复到结构体，再输出Go 30；字节数、码点数和视觉字形数应区分。"}
---
## string 是字节序列，rune 用来表示码点
Go字符串是不可变字节序列，len返回字节数。用下标访问得到字节，range按UTF-8解码得到码点与字节位置。rune是int32的别名，常用于Unicode码点；它仍不等于用户看到的完整字形，组合字符和emoji可能由多个码点构成。

因此截取姓名时不能直接按字节切，网络分块也可能切开多字节字符。文本是否保证合法UTF-8、是否规范化、长度按什么单位限制，都要在协议里说明，而不是让数据库或UI各自猜测。
## 字符串索引与range得到的是不同单位

Go的string保存不可变字节序列，并不保证内容一定是合法UTF-8。len返回字节数量，按下标取得byte；range遍历字符串时按UTF-8解码得到rune，循环索引仍是该字符起始字节位置。rune是int32的别名，用于表示Unicode码点；多个码点仍可能组合成用户看到的一个字形，因此rune数量也不等于视觉字符数量。

需要修改字节内容时可以转换为[]byte，需要按码点处理时可以转换为[]rune，但都可能产生分配。截断用户昵称时要明确按字节、码点还是字形限制，不能随意对string按字节切片后期待UTF-8始终完整。跨网络chunk的文本应增量解码，不能把每个分块当独立完整字符串处理。

## JSON字段映射与缺失语义

encoding/json使用结构体导出字段及json标签决定编码映射，未导出字段不会像普通字段一样自动暴露。标签`json:"title"`指定协议字段名，omitempty按规则省略空值，但“省略”和“明确传0”在更新接口中可能是不同意思。可以用指针字段或专门的存在性类型表达是否提供，不能只有一个int字段却假装知道客户端有没有传。

解码器默认行为不等于业务校验。需要限制请求体大小，按契约决定是否拒绝未知字段，并检查解析后是否还有额外JSON值。直接解码到any时数字通常成为float64，极大整数可能失去精度，ID宜采用字符串或明确的数值类型，必要时使用UseNumber再受控转换。

时间、金额和二进制内容需要约定格式与单位；不要仅因为json.Marshal成功就把整个内部结构体直接当公开接口。内部字段新增可能不应自动对客户端开放，敏感字段更应在专门响应类型中明确排除。

## 一个完整文本与JSON例子
```go
package main

import (
	"encoding/json"
	"fmt"
	"unicode/utf8"
)

type Course struct {
	Title   string `json:"title"`
	Minutes int    `json:"minutes"`
}

func main() {
	text := "中文"
	fmt.Println(len(text), utf8.RuneCountInString(text))
	var course Course
	err := json.Unmarshal([]byte(`{"title":"Go","minutes":30}`), &course)
	if err != nil {
		panic(err)
	}
	fmt.Println(course.Title, course.Minutes)
}
```
结构体导出字段才能按常规规则参与编码，tag指定JSON字段名。Unmarshal需要可写目标地址。解码成功只说明数据可映射到目标结构，不保证minutes的范围合法、用户有权限或未知字段应该被接受。
## 缺失、零值与严格解码
普通int字段缺失后为0，与明确输入0可能无法区分；需要区分时可以用指针、可选类型或独立存在性记录。Decoder可按需求拒绝未知字段，并限制请求体大小；还应确认只接受一个顶层值，而不是忽略后续垃圾。
```flow
HTTP正文到业务对象
限制输入字节数｜避免超大数据占用资源
按JSON规则解码｜确认结构与类型
校验字段存在与范围｜零值不自动代表合法默认值
校验身份与资源权限｜数据解析不能代替授权
进入业务处理｜使用明确内部类型
```
## 编码与日志的工程边界
JSON中的大整数需要考虑其它语言的精度范围，金额应明确最小单位，时间应明确时区格式。omitempty改变输出字段是否出现，不代表该字段在业务上永远可以缺失。错误日志不要打印完整令牌或请求正文。

测试中文、非法UTF-8、缺字段、未知字段、数值越界与深层嵌套。跨语言接口必须验证往返语义，不能仅因为Go能成功Marshal就认为前端一定按相同精度解释。
