---
{"id":"py-environment","title":"Python 环境：解释器、虚拟环境、依赖与可复现安装","moduleId":"python","prerequisites":["py-syntax"],"sources":["py-types","py-functions"]}
---
## 运行 python 时究竟启动了谁
一台机器可能有系统Python、项目虚拟环境、版本管理器和IDE选择的解释器。终端中的 python 与 pip 未必指向同一套安装，这就是“已经安装却 import 不到”的常见原因。先确认 sys.executable、版本与包路径，再考虑重新安装，避免在错误环境反复操作。

虚拟环境主要隔离第三方包路径，不隔离整个操作系统。系统动态库、CPU架构、环境变量和外部服务仍会影响运行；它也不是容器或安全沙箱。
## 解释器、标准库和第三方包分别安装在哪里

执行 python 时，操作系统先按命令搜索路径找到某个解释器。这个解释器有自己的版本、标准库和第三方包搜索路径。同一台机器可以同时安装多个版本，所以“已经 pip install 过”不能证明当前 python 就能导入该包。使用 `python -m pip` 的意义是让当前选中的解释器运行它对应的 pip，减少安装到另一个环境的机会。

虚拟环境为项目提供独立的解释器入口和安装目录，让项目A依赖某个版本、项目B依赖另一版本时不互相覆盖。它不是容器或安全沙箱，不隔离文件权限、网络和操作系统。激活环境主要改变当前 shell 的搜索路径；在自动化脚本中直接使用环境里的可执行文件也可以，不要求先执行一个交互式激活命令。

```bash
python3 -m venv .venv
.venv/bin/python -m pip --version
.venv/bin/python -c "import sys; print(sys.executable)"
```

以上路径适用于类Unix环境，Windows虚拟环境的入口通常位于 Scripts 目录。不要把整个 .venv 提交进Git或复制到另一系统，它包含路径与平台相关产物；应提交依赖声明，重新创建环境。

## 依赖可复现不只是保存一张包名列表

直接依赖是项目主动使用的包，间接依赖是这些包又依赖的包。只写一个宽泛版本范围，下一次安装可能解析出不同的间接依赖。交付时应按项目选用的工具固定解析结果，并记录Python版本、平台及原生系统依赖。含C扩展的包还可能需要匹配的wheel或编译器，浏览器中的Pyodide并不支持任意本机扩展。

遇到导入失败先输出 sys.executable、实际包版本与模块路径，再检查依赖是否安装到同一环境；不要连续换几个 pip 命令碰运气。建立环境、安装、启动和测试应能在干净机器重复完成，这才是环境配置真正的验收标准。

## 建立项目环境的完整步骤
```bash
python3 -m venv .venv
# macOS / Linux
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install requests
python -m pip show requests
```
Windows 的激活脚本路径不同，也可不激活而直接调用 .venv 中的解释器。使用 python -m pip 明确让当前解释器执行安装器。不要提交整个 .venv 目录，它包含机器相关路径和可能与平台绑定的二进制包。
## 依赖声明与锁定有什么不同
pyproject.toml 描述项目元信息、构建和依赖等约定；直接依赖声明允许一定版本范围，锁定结果则记录一次具体解析所得的版本。仅有 requirements.txt 的文件名并不能说明是否完整锁定，还要看内容、平台与安装工具。
```python
import sys
import importlib.util
print(sys.version_info >= (3, 11))
print(importlib.util.find_spec("json") is not None)
```
浏览器Pyodide是独立的WebAssembly解释器，不等于系统python，能导入标准库也不代表本机已安装项目第三方依赖。包含原生扩展的wheel还与Python ABI、平台和系统库有关。
## 如何验证可复现
在干净环境按记录步骤重建，运行最小导入、单元测试和启动检查。记录解释器范围、安装索引、必要系统库与配置名称；密钥通过运行环境注入。不要把本机能跑作为唯一验收条件，部署环境可能有不同工作目录、权限和编码。

排查顺序应是解释器→依赖来源与版本→系统依赖→配置与权限→程序行为。这样的证据链比复制一整份虚拟环境更可靠，也更容易交接给下一位维护者。
