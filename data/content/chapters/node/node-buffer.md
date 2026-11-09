---
{"id":"node-buffer","moduleId":"node","title":"Buffer、二进制与编码边界","prerequisites":["js-promise","js-async-await"],"sources":["node-loop","node-stream"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Buffer、二进制与编码边界

字符串是文本，Buffer 是一组字节。网络、文件和加密接口处理的首先是字节，只有选择字符编码后，字节才被解释成文本。一个中文字符在 UTF-8 中通常占多个字节，因此字符串长度与传输字节数不一定相等。

例如“你好”被拆成两个网络块时，拆分点可能落在某个汉字的字节序列中间。分别把每块独立转成字符串，可能产生替代字符；这不是网络把汉字改坏了，而是解码器没有保留未完整的字节。

## 字节边界与字符边界不能混用

编码把字符序列转换成字节，解码执行反方向解释。双方必须使用一致编码；Base64 则是把任意字节表示成可传输文本的方法，不是加密，也不是压缩。长度限制如果保护网络与内存资源，应明确按字节计数，而不是仅用 JavaScript 字符串的 length。

流式解码器会保留块尾未完成的字符，等下一块补齐后再输出。最终结束时还需要刷新解码状态，处理残缺输入。类似问题也存在于按行读取、JSON 消息和二进制帧：网络块边界与业务记录边界独立，必须维护剩余缓冲。

Buffer 的切片或视图可能共享底层内存，修改一处可能影响另一处；需要独立副本时应明确复制。alloc 与 allocUnsafe 的初始化语义不同，未完整覆盖的未初始化缓冲不可直接暴露。处理不可信长度字段时，要先验证范围再分配内存，避免恶意声明巨大消息。

## 把机制放到一条完整路径中

```flow
文本经过网络
编码｜字符转换成明确编码的字节
分块传输｜块边界可以切断字符
增量解码｜保留未完成字节并等待后续
记录解析｜再按业务协议形成完整消息
```

## 配套代码：UTF-8 中文跨块解码

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

使用 Worker 也提供的 TextEncoder/TextDecoder，演示字节分块不等于字符边界。

```javascript
const bytes=new TextEncoder().encode('你好');
const decoder=new TextDecoder();
const first=decoder.decode(bytes.slice(0,2),{stream:true});
const rest=decoder.decode(bytes.slice(2),{stream:true})+decoder.decode();
console.log(bytes.length);
console.log(first.length);
console.log(first+rest);
```

“你”占三个 UTF-8 字节，前两字节不构成完整字符，流式解码器保留残留直到下块补齐。Node Buffer/网络流同样需要状态化解码，不能逐块随意 toString。

## 从示例走向实际使用

为协议解析器准备逐字节切块、在多字节字符中间切块、多条记录合并一块和末尾残缺四类输入。正确解析器的结果应与理想分块方式无关。

课内使用 TextEncoder 与流式 TextDecoder，让浏览器运行区也能观察字节和字符区别。Node 文件协议可使用 Buffer 与适当解码器，但仍需遵守同样的边界规则。
