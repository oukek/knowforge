import { readFileSync, writeFileSync } from 'node:fs';
import { tutorials, tutorialRevision } from '../data/content/tutorials/index.mjs';
import { chapters } from '../data/content/chapters/index.mjs';

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const questionIds = new Set(catalog.questions.map(question => question.id));
const sourceIds = new Set(catalog.sources.map(source => source.id));
const lessonIds = new Set(catalog.lessons.map(lesson => lesson.id));
const plainLength = text => text.replace(/(`{3,})[^\n]*\n[\s\S]*?\n\1/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').length;
const inspect = lesson => {
  const sections = lesson.sections || [];
  const proseLength = sections.reduce((n, item) => n + item.content.length, 0);
  const explanationLength = sections.filter(item => item.kind !== 'experiment').reduce((n, item) => n + plainLength(item.content || ''), 0);
  const tutorial = tutorials[lesson.id];
  const chapter = chapters.get(lesson.id);
  const issues = [];
  if (!sections.length || sections.some(item => !item.title || !item.content?.trim())) issues.push('正文为空');
  if (chapter) {
    if (lesson.teachingFormat !== 'chapter' || sections.length < 4) issues.push('缺完整教程章节');
    if (!sections.some(item => item.kind === 'chapter-introduction')) issues.push('缺教程介绍');
    if (!sections.some(item => /```(javascript|jsx|html|css|python|go|bash)/.test(item.content))) issues.push('缺正文代码');
  } else {
    if (!tutorial || lesson.teachingRevision !== tutorialRevision) issues.push('缺逐课教学修订');
    if (!sections.some(item => item.kind === 'concept')) issues.push('缺概念入口');
    if (!sections.some(item => ['walkthrough', 'promise-tutorial'].includes(item.kind))) issues.push('缺具体推演');
    if (!sections.some(item => item.kind === 'experiment')) issues.push('缺代码与输出解读');
  }
  if (!lesson.understandingCheck?.question || !lesson.understandingCheck?.answer) issues.push('缺变式与解析');
  if (!lesson.playground?.code?.trim() || !lesson.playground?.expectedLogs?.length) issues.push('缺可运行示例');
  if (!lesson.exercises?.length) issues.push('缺随堂练习');
  if (!lesson.interview?.answer?.trim() || !questionIds.has(`oral-${lesson.id}`)) issues.push('缺关联问答');
  if (!lesson.sourceIds?.length || lesson.sourceIds.some(id => !sourceIds.has(id))) issues.push('来源待核对');
  if ((lesson.prerequisiteLessonIds || []).some(id => id === lesson.id || !lessonIds.has(id))) issues.push('先修关系错误');
  return {
    id: lesson.id, title: lesson.title, proseLength, explanationLength,
    introductory: Boolean(tutorial || chapter), teachingRevision: lesson.teachingRevision,
    format: chapter ? '连续教程' : '原资料与补充',
    focus: chapter?.sections[0].content || tutorial?.concept, walkthrough: tutorial?.walkthrough,
    understandingCheck: lesson.understandingCheck,
    exampleRuntime: lesson.playground?.runtime, exerciseCount: lesson.exercises?.length || 0,
    sourceCount: lesson.sourceIds?.length || 0, issues,
  };
};
const results = catalog.modules.map(module => {
  const lessons = catalog.lessons.filter(lesson => lesson.moduleId === module.id).map(inspect);
  return { id: module.id, title: module.title, total: lessons.length, introductory: lessons.filter(lesson => lesson.introductory).length, lessons };
});
const all = results.flatMap(module => module.lessons);
const issues = all.filter(lesson => lesson.issues.length);
if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else if (process.argv.includes('--write-report')) {
  const escape = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = [
    '# 学习资料逐课修订清单', '',
    `教学修订日期：2026-11-09。共 ${all.length} 篇，${chapters.size === all.length ? '全部采用独立连续教程正文' : `其中 ${chapters.size} 篇采用独立连续教程正文，${all.length - chapters.size} 篇仍待改写`}。逐篇记录正文、示例、练习和来源，不把结构检查当作教学质量的充分证明。`, '',
    '连续教程直接替换原来的模型、工程步骤和误区摘要，按概念背景、机制、实际代码、应用与边界组织。Vue、React、Go、Python 独立成专题。正文 flow 图在网页显示为可阅读的流程图，手册保留文字图解源码。', '',
    '下面逐项列出新增解释的切入点和理解题，便于内容审阅。字数只用于观察篇幅，不作为质量合格线；没有结构提示不等于所有技术细节都已经获得独立专家审定。来源栏表示关联来源数量，不表示本轮重新验证了全部链接。实际执行验证结果见[课程修订验收](课程修订验收.md)。', '',
    `结构缺项：${issues.length} 篇。现有课程 ID、示例 ID 与练习 ID 保持稳定。`, '',
  ];
  for (const module of results) {
    lines.push(`## ${module.title}`, '', '| 课程 | 正文形式 | 概念入口 | 解释字数¹ | 示例 / 练习 / 来源 | 缺项 |', '| --- | --- | --- | ---: | --- | --- |');
    for (const lesson of module.lessons) lines.push(`| ${escape(lesson.title)}（${lesson.id}） | ${lesson.format} | ${escape(lesson.focus?.split(/[。\n]/)[0] || '缺失')} | ${lesson.explanationLength} | ${lesson.exampleRuntime} / ${lesson.exerciseCount} / ${lesson.sourceCount} | ${lesson.issues.join('、') || '无结构缺项'} |`);
    lines.push('');
  }
  lines.push('¹ 解释字数为近似字符数，排除了实验整节、代码围栏及链接标记；不能用这个数字证明读者已经理解。', '');
  writeFileSync(new URL('../docs/学习资料检查清单.md', import.meta.url), lines.join('\n'));
  console.log(`已输出 ${all.length} 篇逐课修订记录；${issues.length} 篇有结构缺项。`);
} else {
  for (const module of results) console.log(`${module.title}：${module.total} 篇，逐课补写 ${module.introductory} 篇`);
  for (const lesson of issues) console.log(`  ${lesson.id}：${lesson.issues.join('、')}`);
  console.log(`结构缺项 ${issues.length} 篇；实际代码运行与判题请执行 npm test。结构完整不等于教学效果已经验证。`);
}
if (issues.length) process.exitCode = 1;
