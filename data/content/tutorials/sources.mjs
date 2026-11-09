// 本轮实际打开的原始文档；只给明确相关课程添加链接，不冒称所有链接都重新验证。
const references = [
  ['tutorial-promise', 'MDN · Promise 状态、链式调用与解析', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise', ['js-promise','js-promise-handwrite','js-promise-combinators','js-async-await']],
  ['tutorial-python-async', 'Python 3.13 · 协程、任务与取消', 'https://docs.python.org/3.13/library/asyncio-task.html', ['py-asyncio','py-cancellation','py-asgi-concurrency']],
  ['tutorial-python-context', 'Python 3.13 · contextlib', 'https://docs.python.org/3.13/library/contextlib.html', ['py-context','py-stream-resources']],
  ['tutorial-vue-reactivity', 'Vue · Reactivity in Depth', 'https://vuejs.org/guide/extras/reactivity-in-depth.html', ['vue-reactivity']],
  ['tutorial-react-snapshot', 'React · State as a Snapshot', 'https://react.dev/learn/state-as-a-snapshot', ['react-hooks']],
  ['tutorial-mysql-snapshot', 'MySQL 8.4 · 一致性非锁定读', 'https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html', ['mysql-mvcc-isolation']],
  ['tutorial-mysql-locking', 'MySQL 8.4 · 锁定读', 'https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html', ['mysql-mvcc-isolation']],
  ['tutorial-mysql-index', 'MySQL 8.4 · 聚簇与二级索引', 'https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html', ['mysql-index-io']],
  ['tutorial-agents-sdk', 'OpenAI · Agents SDK 概览', 'https://developers.openai.com/api/docs/guides/agents/sdk', ['openai-agents-tools','agent-framework-design']],
  ['tutorial-agents-handoffs', 'OpenAI · Orchestration and handoffs', 'https://developers.openai.com/api/docs/guides/agents/orchestration', ['openai-agents-orchestration']],
  ['tutorial-langgraph-state', 'LangGraph · Graph API', 'https://docs.langchain.com/oss/python/langgraph/graph-api', ['langgraph-state']],
  ['tutorial-langgraph-interrupt', 'LangGraph · Interrupts', 'https://docs.langchain.com/oss/python/langgraph/interrupts', ['agent-human-review','langgraph-recovery']],
  ['tutorial-agentscope', 'AgentScope · 官方文档（按所用版本阅读）', 'https://docs.agentscope.io/', ['agent-harness-choice']],
];
export function attachTutorialSources(lessons, sources) {
  for (const [id, title, url, ids] of references) {
    if (sources.some(source => source.id === id)) throw new Error(`来源 ID 重复：${id}`);
    sources.push({ id, title, url, status: 'verified', checkedAt: '2026-11-09', scope: '对应概念与执行边界；具体安装、接口签名与部署能力仍需按使用版本验证。' });
    for (const lessonId of ids) {
      const lesson = lessons.find(item => item.id === lessonId);
      if (!lesson) throw new Error(`来源关联课程不存在：${lessonId}`);
      lesson.sourceIds = [...new Set([...lesson.sourceIds, id])];
    }
  }
}
