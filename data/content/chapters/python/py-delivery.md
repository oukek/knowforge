---
{"id":"py-delivery","title":"Python 项目交付：配置、日志、打包、启动与退出","moduleId":"python","prerequisites":["py-environment","py-testing"],"sources":["py-types","py-functions"]}
---
## 脚本能跑与服务可交付的差别
开发脚本可能依赖当前目录、个人环境与手动操作，服务则需要在新机器、重启和故障后仍可预测运行。交付单位包括代码或包、解释器与依赖、启动命令、配置契约、外部资源和运行检查。不能只把一份.py文件发过去就认为环境可复现。

配置应区分必需值、默认值和敏感值，启动时尽早校验。密钥通过运行环境或密钥系统提供，不写进源码或日志；错误提示说明缺少哪个配置名即可，不打印其内容。
## 从源码到服务的四层依赖

第一层是解释器与操作系统能力，第二层是项目及第三方包，第三层是运行配置，第四层是数据库、队列和外部接口等服务。虚拟环境隔离包，不会创建MySQL；打包wheel分发Python包，也不必然附带可独立运行的解释器。选择容器、系统服务或平台运行时之前，先把这四层写清楚。

构建阶段应产出确定版本，运行阶段注入环境相关配置。不要在每次请求到来时临时安装依赖，也不要把开发机路径写死到服务入口。数据库结构升级要有版本、顺序与兼容策略；即使代码能回滚，已经发生的数据转换也未必可以逆转，因此发布流程要单独考虑数据。

## 日志如何支持定位一条失败请求

```python
import logging
logger = logging.getLogger("course-service")
logging.basicConfig(level=logging.INFO,
                    format="%(levelname)s %(name)s %(message)s")

def load_course(course_id):
    if not course_id:
        raise ValueError("缺少课程ID")
    logger.info("course_loaded id=%s", course_id)
    return {"id": course_id}

print(load_course("python")['id'])
```

示例展示日志等级、记录器和参数化消息，不构成完整结构化日志方案。服务中应沿请求传递关联ID，记录失败发生在哪个阶段、耗时和可公开的错误类别；不要记录密码、密钥或完整敏感正文。重复在每层打印同一异常会放大噪声，通常在真正负责处理的边界记录一次，并保留原因链。

优雅退出需要先停止接新任务，再等待或取消已有工作，最后关闭连接池等资源。进程管理器设置的终止宽限必须与应用预算匹配，否则应用还在清理就被强制杀死。需要跨重启继续的工作应先持久化，不能只依赖内存任务列表。

## 写一个可验证的配置入口
```python
import os
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    port: int

def read_settings(env):
    port = int(env.get("PORT", "8000"))
    if not 1 <= port <= 65535:
        raise ValueError("PORT 超出范围")
    return Settings(port=port)

print(read_settings({}).port)
```
把读取函数接受的环境映射作为参数，测试就不必修改全局os.environ。真实入口传os.environ，测试传字典；类型转换失败应在启动阶段暴露，而不是收到第一个请求才发现。
## 日志与健康检查
结构化日志记录请求ID、操作类型、耗时和错误类别，避免每层重复打印同一异常。健康检查区分进程存活与能否接收业务流量；依赖短暂故障时不能随意引发无限重启风暴。监控应包含错误率、队列、连接池与资源使用。
```flow
一次发布
干净环境构建｜固定依赖与解释器范围
自动验证｜单测、集成、启动检查
注入配置并启动｜不依赖交互式Shell
就绪后接流量｜监测新版本与错误
优雅退出或回滚｜停止接单，收束任务并释放资源
```
## 后台任务与退出预算
收到退出信号后停止接受新工作，等待已有工作在预算内完成；必须持久完成的任务应写入队列或数据库，进程内Task无法保证重启后恢复。优雅退出不是永远等待，超时后要有明确终止策略与可恢复记录。

发布检查包括工作目录、文件权限、编码、端口、依赖版本与数据库连接。使用同一份构建产物向上推进环境，记录版本便于回滚，不在生产机器随意手改源码而丢失可追溯性。
