import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { parse, compileScript, compileTemplate } from "@vue/compiler-sfc";
import { parse as parseJS } from "@babel/parser";
import { chapters } from "../data/content/chapters/index.mjs";
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));

test("全库独立正文覆盖，旧摘要退出展示，章节示例与运行区保持一致", () => {
  assert.equal(chapters.size, catalog.lessons.length);
  for (const lesson of catalog.lessons) {
    const chapter = chapters.get(lesson.id);
    assert(chapter, lesson.id);
    assert.equal(lesson.teachingFormat, "chapter", lesson.id);
    assert.deepEqual(lesson.sections, chapter.sections, lesson.id);
    assert.equal(new Set(chapter.sections.map(s => s.title)).size, chapter.sections.length, `${lesson.id} 重复小节`);
    assert(!chapter.sections.some(s => ["先建立正确模型", "机制拆解与工程落地", "边界与常见误区"].includes(s.title)), lesson.id);
    if (chapter.reviewedRewrite) assert(chapter.body.includes(lesson.playground.code), `${lesson.id} 正文与运行区代码漂移`);
  }
});

test("数学与重试示例拒绝无效输入，并尊重服务端的最小等待时间", () => {
  const getCode = id => catalog.lessons.find(l => l.id === id).playground.code;
  const checks = [
    { code: getCode('llm-embeddings'), tail: `\nfor a,b in [([1,2],[1]),([float('nan')],[1]),([float('inf')],[1])]:\n    try: cosine(a,b)\n    except ValueError: pass\n    else: raise AssertionError('invalid vector accepted')\nassert abs(cosine([1,2],[2,4])-1)<1e-9\nassert cosine([0,0],[1,0])==0` },
    { code: getCode('crawl-retry'), tail: `\nassert delay(1,120)==120\nassert delay(20)==30\nassert delay(4,2)==16` },
  ];
  for (const {code, tail} of checks) execFileSync('python3', ['-c', code + tail], {timeout: 5000});
});

test("防抖与节流正文实现：时间边界、参数、this、取消、flush与重入", () => {
  let now = 0,
    sequence = 0;
  const timers = new Map();
  const context = vm.createContext({
    performance: { now: () => now },
    setTimeout(fn, delay) {
      const id = ++sequence;
      timers.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  function advance(target) {
    while (true) {
      const next = [...timers]
        .filter(([, task]) => task.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = target;
  }
  const code = [
    ...chapters
      .get("js-rate-limit")
      .body.matchAll(/```javascript\n([\s\S]*?)```/g),
  ]
    .map((match) => match[1])
    .join("\n");
  const { debounce, throttleLeading } = vm.runInContext(
    `${code}\n({debounce, throttleLeading})`,
    context,
    { timeout: 1000 },
  );
  const logs = [],
    owner = { id: "owner" };
  const debounced = debounce(function (value) {
    logs.push([this.id, value, now]);
    return value;
  }, 300);
  debounced.call(owner, "a");
  advance(100);
  debounced.call(owner, "b");
  advance(200);
  debounced.call(owner, "c");
  advance(499);
  assert.deepEqual(logs, []);
  advance(500);
  assert.deepEqual(logs, [["owner", "c", 500]]);
  debounced.call(owner, "cancelled");
  debounced.cancel();
  advance(1000);
  assert.equal(logs.length, 1);
  debounced.call(owner, "flush");
  assert.equal(debounced.flush(), "flush");
  assert.equal(debounced.flush(), undefined);
  advance(1500);
  assert.equal(logs.length, 2);
  const reentrant = debounce((value) => {
    logs.push(value);
    if (value === "first") reentrant("second");
  }, 100);
  reentrant("first");
  advance(1700);
  assert.deepEqual(logs.slice(-2), ["first", "second"]);
  now = 0;
  const events = [];
  const throttled = throttleLeading(function (value) {
    events.push([this.id, value, now]);
  }, 300);
  for (const time of [0, 100, 200, 450, 800]) {
    now = time;
    throttled.call(owner, time);
  }
  assert.deepEqual(
    events.map((row) => row[2]),
    [0, 450, 800],
  );
  throttled.cancel();
  throttled.call(owner, "reset");
  assert.equal(events.at(-1)[1], "reset");
  assert(events.every((row) => row[0] === "owner"));
});

test("指定专题使用连续教程正文；新旧课程和学习主线关联完整", () => {
  for (const moduleId of ["vue", "react", "go", "python"]) {
    const lessons = catalog.lessons.filter((l) => l.moduleId === moduleId);
    assert(lessons.length >= 10, moduleId);
    for (const lesson of lessons) {
      assert.equal(lesson.teachingFormat, "chapter", lesson.id);
      if (lesson.language === "python" && chapters.get(lesson.id).new)
        assert.equal(lesson.playground.runtime, "python", lesson.id);
      assert(
        !lesson.sections.some((s) =>
          ["先建立正确模型", "机制拆解与工程落地", "边界与常见误区"].includes(
            s.title,
          ),
        ),
        lesson.id,
      );
      assert(
        lesson.sections.some((s) => /```/.test(s.content)),
        lesson.id,
      );
      for (const id of lesson.prerequisiteLessonIds) {
        const prerequisite = lessons.find((l) => l.id === id);
        if (prerequisite)
          assert(
            prerequisite.order < lesson.order,
            `${lesson.id} 在先修课之前`,
          );
      }
    }
    assert(
      catalog.tracks.some(
        (t) => t.id === moduleId && t.moduleIds.includes(moduleId),
      ),
    );
  }
  for (const id of [
    "css-render",
    "css-reflow-repaint",
    "css-percentage",
    "css-box-bfc",
    "net-ajax",
    "net-web-attacks",
    "perf-firstscreen",
    "js-event-loop",
  ]) {
    const chapter = chapters.get(id);
    assert(chapter && chapter.body.includes("```flow"), id);
  }
  for (const question of catalog.questions)
    assert.equal(
      question.moduleId,
      catalog.lessons.find((l) => l.id === question.lessonId).moduleId,
      question.id,
    );
});

test("章节图解保留清楚的标题与各节点说明；不会依赖外部图片服务", () => {
  let diagrams = 0;
  for (const chapter of chapters.values())
    for (const match of chapter.body.matchAll(/```flow\n([\s\S]*?)```/g)) {
      const [title, ...steps] = match[1].trim().split("\n");
      assert(title && steps.length >= 3, chapter.id);
      assert(
        steps.every((step) => step.includes("｜")),
        chapter.id,
      );
      diagrams++;
    }
  assert(diagrams >= 340);
});

test("Vue 正文完整 SFC 与 React JSX 可被相应编译器或解析器解析", () => {
  let vue = 0,
    jsx = 0;
  for (const chapter of chapters.values()) {
    for (const match of chapter.body.matchAll(/```html\n([\s\S]*?)```/g)) {
      if (chapter.moduleId !== "vue" || !match[1].includes("<script setup>"))
        continue;
      const { descriptor, errors } = parse(match[1], {
        filename: `${chapter.id}.vue`,
      });
      assert.deepEqual(errors, [], chapter.id);
      const script = compileScript(descriptor, { id: chapter.id });
      const result = compileTemplate({
        source: descriptor.template.content,
        filename: `${chapter.id}.vue`,
        id: chapter.id,
        compilerOptions: { bindingMetadata: script.bindings },
      });
      assert.deepEqual(result.errors, [], chapter.id);
      vue++;
    }
    for (const match of chapter.body.matchAll(/```jsx\n([\s\S]*?)```/g)) {
      parseJS(match[1], { sourceType: "module", plugins: ["jsx"] });
      jsx++;
    }
  }
  assert(vue >= 6);
  assert(jsx >= 8);
});

test("Python 教程正文代码在真实解释器独立执行，包含线程与顶层 await", () => {
  const cases = [];
  for (const chapter of chapters.values())
    if (chapter.moduleId === "python") {
      for (const [index, match] of [
        ...chapter.body.matchAll(/```python\n([\s\S]*?)```/g),
      ].entries())
        cases.push({ id: `${chapter.id}:${index + 1}`, code: match[1] });
    }
  const runner = `import ast,asyncio,contextlib,inspect,io,json,sys\nfor case in json.load(sys.stdin):\n    try:\n        with contextlib.redirect_stdout(io.StringIO()):\n            value=eval(compile(case['code'],case['id'],'exec',flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT),{'__name__':'__main__'})\n            if inspect.iscoroutine(value): asyncio.run(value)\n    except BaseException as error:\n        raise RuntimeError(case['id']) from error\nprint('ok')`;
  assert(cases.length >= 30);
  assert.equal(
    execFileSync("python3", ["-c", runner], {
      input: JSON.stringify(cases),
      encoding: "utf8",
      timeout: 30000,
    }).trim(),
    "ok",
  );
});

for (const lesson of catalog.lessons.filter((l) => l.language === "go")) {
  test(`Go 真实工具链执行：${lesson.id}`, () => {
    const folder = mkdtempSync(join(tmpdir(), "knowforge-go-"));
    try {
      const file = join(folder, "main.go");
      writeFileSync(file, lesson.playground.code);
      const result = execFileSync("go", ["run", file], {
        encoding: "utf8",
        timeout: 60000,
        env: { ...process.env, GOTOOLCHAIN: "local" },
      });
      assert.deepEqual(
        result.trim().split("\n"),
        lesson.playground.expectedLogs,
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
}
