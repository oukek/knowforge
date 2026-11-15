import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { normalizeQuestionPrompt } from '../shared/question-prompt.mjs';

test('legacy inline fences become code blocks with surrounding prose', () => {
  const html = marked.parse(normalizeQuestionPrompt("题目： ```js const x = 1; console.log(x); ``` 请说明输出。"));
  assert.match(html, /<pre><code class="language-js">const x = 1; console.log\(x\);/);
  assert.match(html, /<p>\s*请说明输出。<\/p>/);
});
test('formatted code, inline code and ordinary prompts remain intact', () => {
  for (const prompt of ['解释 `this` 的含义。', '背景\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\n要求', '普通题目', '```python\nprint("hi")\n```']) {
    assert.equal(normalizeQuestionPrompt(prompt), prompt);
  }
});
