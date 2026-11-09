import { readFileSync } from 'node:fs';
import js from './js.mjs';
import browser from './browser.mjs';
import platform from './platform.mjs';
import server from './server.mjs';
import python from './python.mjs';
import crawler from './crawler.mjs';
import rest from './rest.mjs';
import algorithms from './algorithms.mjs';
import design from './design.mjs';
import aiBasics from './ai-basics.mjs';
import aiUi from './ai-ui.mjs';
import llm from './llm.mjs';
import agents from './agents.mjs';
import fde from './fde.mjs';

export const tutorialRevision = '2026-11-09';
export const tutorials = {};
for (const group of [js, browser, platform, server, python, crawler, rest, algorithms, design, aiBasics, aiUi, llm, agents, fde]) {
  for (const [id, entry] of Object.entries(group)) {
    if (Object.hasOwn(tutorials, id)) throw new Error(`逐课讲解重复 ID：${id}`);
    if (entry.length !== 4 || entry.some(text => typeof text !== 'string' || !text.trim())) throw new Error(`逐课讲解不完整：${id}`);
    tutorials[id] = { concept: entry[0], walkthrough: entry[1], question: entry[2], answer: entry[3] };
  }
}
const promiseText = readFileSync(new URL('./promise.md', import.meta.url), 'utf8');
export const promiseSections = promiseText.split(/^## /m).filter(Boolean).map(part => {
  const newline = part.indexOf('\n');
  return { title: part.slice(0, newline), content: part.slice(newline + 1).trim() };
});
tutorials['js-promise'] = {
  concept: promiseSections[0].content,
  walkthrough: promiseSections[2].content,
  question: '失败处理器返回普通值之后，为什么下一步会进入成功分支，这会改变最初的 Promise 吗？',
  answer: 'catch 返回新的 Promise，处理器的普通返回值使新 Promise 成功；原先 rejected 的 Promise 仍为 rejected，状态不可逆并没有被打破。',
};

// 明确先修知识，不将整段同模块说明机械复制到所有课程。
const modulePrerequisites = {
  aibasics: ['ai-concept-map', 'ai-llm-primer'],
  js: ['js-scope', 'js-closure'],
  network: ['net-navigation', 'net-dns-tcp'],
  css: ['css-box-bfc', 'css-flex-grid'],
  mini: ['mini-runtime', 'mini-setdata'],
  framework: ['js-closure', 'js-event-loop'],
  engineering: ['js-modules', 'net-cache'],
  node: ['js-promise', 'js-async-await'],
  performance: ['net-navigation', 'js-event-loop'],
  algorithm: ['algo-solving-basics'],
  design: ['rest-resources', 'rest-idempotency'],
  project: ['study-answer'],
  ai: ['ai-application-anatomy', 'js-promise'],
  architecture: ['arch-tradeoff'],
  strategy: [],
  python: ['py-environment', 'py-objects'],
  crawler: ['py-iterators', 'crawl-boundaries'],
  restapi: ['rest-model', 'net-navigation'],
  llmapp: ['ai-llm-primer', 'ai-application-anatomy'],
  agents: ['ai-agent-primer', 'ai-tools-primer'],
  fde: ['ai-application-anatomy', 'fde-discovery'],
};
const prerequisites = {
  'js-scope': [], 'js-closure': ['js-scope'],
  'js-promise': ['js-event-loop'], 'js-event-loop': ['js-scope'],
  'js-async-await': ['js-promise'], 'js-promise-combinators': ['js-promise'],
  'js-promise-handwrite': ['js-promise', 'js-event-loop'], 'js-concurrency': ['js-promise-combinators'],
  'ai-concept-map': [], 'ai-llm-primer': ['ai-concept-map'],
  'ai-transformer-primer': ['ai-tokenization-primer', 'ai-embedding-primer'],
  'ai-agent-primer': ['ai-application-anatomy', 'ai-tools-primer'],
  'ai-rag-primer': ['ai-llm-primer', 'ai-embedding-primer'],
  'net-navigation': [], 'net-dns-tcp': ['net-navigation'],
  'css-box-bfc': [], 'css-flex-grid': ['css-box-bfc'],
  'mini-runtime': [], 'mini-setdata': ['mini-runtime'],
  'py-environment': [], 'py-objects': ['py-environment'],
  'py-asyncio': ['py-functions', 'py-iterators'],
  'py-cancellation': ['py-asyncio', 'py-context'],
  'crawl-boundaries': ['py-environment'], 'rest-model': ['net-navigation'],
  'algo-solving-basics': [], 'algo-dp-knapsack': ['algo-dp-foundations'],
  'mysql-index-io': ['py-sql'], 'mysql-engine-recovery': ['mysql-index-io'],
  'mysql-mvcc-isolation': ['mysql-engine-recovery', 'rest-transactions'],
  'langgraph-recovery': ['langgraph-state', 'fullstack-idempotent-outbox'],
  'agent-human-review': ['langgraph-recovery'],
  'arch-tradeoff': [], 'fde-discovery': ['ai-application-anatomy'],
};
const section = (kind, title, content) => ({ kind, title, content });
export function attachTutorials(lessons) {
  const byId = new Map(lessons.map(lesson => [lesson.id, lesson]));
  if (byId.size !== lessons.length) throw new Error('课程 ID 重复');
  const unknown = Object.keys(tutorials).filter(id => !byId.has(id));
  if (unknown.length) throw new Error(`逐课讲解引用未知课程：${unknown.join(', ')}`);
  for (const lesson of lessons) {
    const tutorial = tutorials[lesson.id];
    if (!tutorial && lesson.chapterFile) continue;
    if (!tutorial) throw new Error(`缺少逐课概念、推演和变式解析：${lesson.id}`);
    if (lesson.teachingRevision) throw new Error(`重复装配课程：${lesson.id}`);
    const before = lesson.sections;
    // 旧的场景评分依据引用原第三节，不能让新教学小节的位置改变其语义。
    lesson.interview.scenarioRubric = [lesson.interview.scenarioAnswer, ...before[2].content.split('\n').map(x => x.replace(/^- /, ''))];
    const pre = (prerequisites[lesson.id] ?? modulePrerequisites[lesson.moduleId] ?? []).filter(id => id !== lesson.id);
    for (const id of pre) if (!byId.has(id)) throw new Error(`${lesson.id} 先修课程不存在：${id}`);
    lesson.prerequisiteLessonIds = pre;
    const prep = pre.length ? `**建议先学：** ${pre.map(id => `[${byId.get(id).title}](/learn/${id})`).join(' · ')}\n\n` : '';
    if (lesson.id === 'js-promise') {
      lesson.sections = promiseSections.map((item, index) => section(index === 0 ? 'concept' : 'promise-tutorial', item.title, (index === 0 ? prep : '') + item.content));
      lesson.interview.answer = 'Promise 有 pending（等待）、fulfilled（成功，保存 value）、rejected（失败，保存 reason）三态，只能从等待进入一种终态。executor 同步执行，then/catch 的处理器异步调度；每次 then 返回新 Promise，普通返回值使其成功、抛错使其失败、返回 Promise/thenable 则采用结果。resolve 另一份未完成的 Promise 会锁定跟随关系，但不等于立即 fulfilled。catch 返回值恢复的是新链，原 Promise 状态不变；finally 的普通返回值通常不覆盖原结果。标准 Promise 没有公共 status 属性，也没有通用取消能力。';
      lesson.interview.rubric = ['三个状态的中文含义及单向转换', '执行器同步与处理器微任务调度', '新 Promise 的返回值、异常及状态采用', 'resolved 与 fulfilled、错误恢复与取消边界'];
    } else {
      lesson.sections = [
        section('concept', '从零理解：先把概念说清楚', prep + tutorial.concept),
        before[0],
        section('walkthrough', '跟着一个具体例子推演', tutorial.walkthrough),
        ...before.slice(1),
      ];
    }
    const example = lesson.playground;
    const fence = '`'.repeat(Math.max(3, ...[...example.code.matchAll(/`+/g)].map(match => match[0].length + 1)));
    const runtime = example.runtime === 'model'
      ? '这是确定性教学模型，用来观察机制与边界，不会连接真实宿主、数据库或模型服务。'
      : lesson.language === 'python'
        ? '这里使用课内 Python 运行环境；真实服务器、文件和网络行为，以本课示例说明的范围为准。'
        : '这里使用课内 JavaScript 运行环境；浏览器主页面和 Node 专有 API 的行为不能由 Worker 模拟直接推定。';
    lesson.sections.push(section('experiment', '把原理对照到可运行代码', `**实验：${example.title}**\n\n${example.description}\n\n${runtime}\n\n${fence}${lesson.language}\n${example.code}\n${fence}\n\n**逐项核对输出：**\n\n${fence}text\n${example.expectedLogs.join('\n')}\n${fence}\n\n**为什么得到这些结果：**\n\n${example.explanation}`));
    lesson.sections.push(section('understanding-check', '换个条件，再检验一次理解', `**先思考：** ${tutorial.question}\n\n**解析：** ${tutorial.answer}`));
    lesson.teachingRevision = tutorialRevision;
    lesson.understandingCheck = { question: tutorial.question, answer: tutorial.answer };
    lesson.updatedAt = tutorialRevision;
    const prose = lesson.sections.reduce((sum, item) => sum + item.content.replace(/```[\s\S]*?```/g, '').length, 0);
    lesson.estimatedMinutes = Math.max(lesson.estimatedMinutes, Math.ceil(prose / 180) + 8);
  }
}
