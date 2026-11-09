import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { tutorials, promiseSections, tutorialRevision } from '../data/content/tutorials/index.mjs';
import { createCatalogApi } from '../server/catalog-api.mjs';
import { chapters } from '../data/content/chapters/index.mjs';

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const byId = new Map(catalog.lessons.map(lesson => [lesson.id, lesson]));
test('全部课程逐课覆盖，旧练习关联稳定，先修图可读且无环', () => {
  assert.equal(chapters.size, catalog.lessons.length, '全部课程必须有独立正文，不能以旧补充代替');
  const done = new Set(), active = new Set();
  function visit(id) {
    assert(!active.has(id), `先修循环：${id}`);
    if (done.has(id)) return;
    active.add(id);
    for (const pre of byId.get(id).prerequisiteLessonIds) {
      assert(byId.has(pre), `${id} 缺少先修 ${pre}`);
      visit(pre);
    }
    active.delete(id); done.add(id);
  }
  for (const lesson of catalog.lessons) {
    visit(lesson.id);
    const tutorial = tutorials[lesson.id];
    if (chapters.has(lesson.id)) {
      assert.equal(lesson.teachingFormat, 'chapter');
      assert.deepEqual(lesson.sections, chapters.get(lesson.id).sections);
    } else {
    assert.equal(lesson.teachingRevision, tutorialRevision);
    assert(lesson.sections.some(item => item.content.includes(tutorial.concept)), lesson.id);
    assert(lesson.sections.some(item => item.content.includes(tutorial.walkthrough)), lesson.id);
    const experiment = lesson.sections.find(item => item.kind === 'experiment');
    assert(experiment.content.includes(lesson.playground.code), lesson.id);
    assert(experiment.content.includes(lesson.playground.expectedLogs.join('\n')), lesson.id);
    assert(experiment.content.includes(lesson.playground.explanation), lesson.id);
    assert.deepEqual(lesson.understandingCheck, { question: tutorial.question, answer: tutorial.answer });
    }
    const output = lesson.exercises.find(item => item.type === 'output');
    assert.equal(output.id, `output-${lesson.id}`);
    assert.equal(output.code, lesson.playground.code);
    assert.deepEqual(output.expectedLogs, lesson.playground.expectedLogs);
    // 新教学小节不能改变原场景题的评分依据。
    assert.deepEqual(catalog.questions.find(item => item.id === `case-${lesson.id}`).rubric, lesson.interview.scenarioRubric);
  }
});

test('教材导出保留逐课概念、推演和变式答案', () => {
  const handbook = readFileSync(new URL('../docs/完整学习手册.md', import.meta.url), 'utf8');
  for (const [id, entry] of Object.entries(tutorials)) {
    if (chapters.has(id)) continue;
    for (const value of Object.values(entry)) assert(handbook.includes(value), `${id} 导出遗漏讲解`);
  }
  for (const chapter of chapters.values())
    for (const section of chapter.sections) assert(handbook.includes(section.content), `${chapter.id} 导出遗漏教程正文`);
});

test('新正文不进入首屏目录，仅课程详情携带完整教学', () => {
  const api = createCatalogApi(catalog);
  const req = { query: {}, params: {}, get: () => '', acceptsEncodings: () => false };
  const response = { set() { return this; }, vary() { return this; }, send(body) { return JSON.parse(body.toString()); } };
  const index = api.index(req, response);
  assert(index.summaryOnly);
  for (const lesson of index.lessons) {
    assert(!('sections' in lesson));
    assert(!('understandingCheck' in lesson));
    assert(!('playground' in lesson));
  }
  req.params.id = 'js-promise';
  const detail = api.detail(req, response, 'lessons');
  assert.equal(detail.teachingRevision, '2026-11-09-textbook');
  assert(detail.sections.some(section => section.title === '三种状态逐个说明'));
});

const promiseCode = promiseSections.flatMap(section => [...section.content.matchAll(/```javascript\n([\s\S]*?)```/g)].map(match => match[1]));
const outputs = [
  ['开始办理', '仍会执行', '继续做别的事', '收到 订单 42'],
  ['断网', '本地缓存'],
  ['8'],
];
for (let index = 0; index < outputs.length; index++) {
  test(`Promise 新正文示例 ${index + 1} 的执行顺序与结果`, async () => {
    const logs = [];
    const context = vm.createContext({ console: { log: (...values) => logs.push(values.join(' ')) } });
    await vm.runInContext(`(async () => { ${promiseCode[index]} })()`, context, { timeout: 1000 });
    assert.deepEqual(logs, outputs[index]);
  });
}
test('Promise 新文中的变式覆盖恢复、新链失败与状态采用', async () => {
  assert.equal(promiseCode.length, 3);
  const original = Promise.reject('错误');
  const recovered = original.catch(() => 0).then(value => value + 1);
  assert.equal(await recovered, 1);
  assert.equal((await Promise.allSettled([original]))[0].status, 'rejected');
  await assert.rejects(Promise.resolve(1).then(() => { throw Error('失败'); }, () => 2), /失败/);
  let finish;
  const inner = new Promise(resolve => { finish = resolve; });
  const outer = new Promise((resolve, reject) => { resolve(inner); reject(Error('不能覆盖')); });
  let observed = false;
  const observation = outer.then(value => { observed = true; return value; });
  await Promise.resolve();
  assert.equal(observed, false);
  finish(8);
  assert.equal(await observation, 8);
  assert.equal(await Promise.resolve(7).finally(() => 99), 7);
});
