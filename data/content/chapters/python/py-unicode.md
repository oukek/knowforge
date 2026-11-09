---
{"id":"py-unicode","title":"Python 文本与字节：Unicode、编码和字符长度","moduleId":"python","prerequisites":["py-syntax"],"sources":["py-types","py-functions"]}
---
## str 与 bytes 处理的是不同对象
str表示Unicode文本，bytes表示原始字节序列。网络和文件传输的最终是字节，解释为文本需要选择编码。encode将文本变成字节，decode将字节解释成文本；没有脱离编码的通用“字节转中文”。

UTF-8用可变数量字节表示码点，所以字节长度与文本长度不同。Python的字符串长度也不是用户看到的字形数量：组合字符、emoji序列可能由多个码点组成。截取显示昵称不能简单拿字节数当字符数。
## 编码表、码点和字节怎样对应

Unicode 为字符分配码点，UTF-8、UTF-16 等编码规定怎样把码点表示成字节。例如“中”对应一个码点，在 UTF-8 中占三个字节。文件不会因为扩展名是 .txt 就自带唯一正确解码方式；协议、文件声明或业务约定必须告诉读取方用什么编码。

`ord("中")` 查看一个字符的码点数值，`chr(number)` 从码点构造字符；这与把UTF-8的三个字节分别转字符不同。bytes 下标得到单个字节的整数值，str 下标得到一个长度为1的字符串，但它仍未必是用户感知的完整字形。

## 组合字符与分块读取要分别处理

```python
import codecs
import unicodedata

first = "é"
second = "e\u0301"
print(first == second, len(first), len(second))
print(unicodedata.normalize("NFC", first) ==
      unicodedata.normalize("NFC", second))

decoder = codecs.getincrementaldecoder("utf-8")()
raw = "中文".encode("utf-8")
print(decoder.decode(raw[:2]), decoder.decode(raw[2:], final=True))
```

两个看起来相同的带重音字母可以由一个码点或两个码点表示，规范化可在明确规则下统一。它不解决所有视觉相似字符，例如不同文字系统中外形相似的字母；用户账号防冒充仍需额外策略。

增量解码器在第一块只有部分字节时保存状态，下一块到来再组成字符。final=True 表示输入结束，未完成的编码序列此时应按错误策略处理。网络读取中一次 chunk 的边界由传输与缓冲决定，与字符、行和 JSON 对象边界没有必然对应。先得到正确文本，再按上层协议解析，能避免中文、emoji偶发乱码这类难复现问题。

## 观察两种长度和往返
```python
text = "中文"
raw = text.encode("utf-8")
print(len(text))
print(len(raw))
print(raw.decode("utf-8"))
```
输出2、6与原文本。若从中间切开UTF-8多字节字符再独立decode，可能报错。流式网络解码应使用增量解码器保存不完整序列，不能每个chunk都当完整文本。
## 编码错误应该被解释，而不是静默抹去
errors='ignore'会丢弃无法解释的字节，可能让数据看起来“成功”但内容损坏。优先确认HTTP头、文件格式或实际来源编码，再采用明确错误策略。replacement适合某些展示用途，持久化与解析则可能需要保留原始字节以便重处理。
```flow
可靠文本处理
获取字节与来源信息｜内容类型、声明编码
按明确编码解码｜流式场景保留跨块状态
处理Unicode文本｜规范化与比较按业务规则
输出前编码｜目标文件或协议的约定
```
## 规范化、排序与安全
视觉相同的文本可能由不同码点序列组成，Unicode规范化可以处理一些等价形式，但不应随意用于密码等必须保留原始值的字段。大小写折叠、语言排序与防相似字符冒充也各有独立规则。

测试中文、emoji、组合音标、非法字节与跨chunk字符。日志显示正常不代表数据库编码链路正确，应验证写入读出完整往返，并明确数据库列、客户端连接与文件输出的编码。
