<script setup>
import AppDisclosure from "./AppDisclosure.vue";
import AppField from "./AppField.vue";
import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue";
import { store, safeStorageGet, safeStorageSet, mutate } from "../store";
import { useCodeRunner } from "../composables/useCodeRunner";
import Icon from "./Icon.vue";
import CodeEditor from "./CodeEditor.vue";
import CodeBlock from "./CodeBlock.vue";
import RunOutput from "./RunOutput.vue";
import PythonRuntimeDialog from "./PythonRuntimeDialog.vue";
const props = defineProps({ lesson: Object, initialTab: String });
const tab = ref("code"),
  resetPending = ref(false),
  answer = ref(""),
  feedback = ref(null),
  feedbackAnswer = ref(""),
  submitting = ref(false),
  saveStatus = ref("");
const language = computed(() => props.lesson.language ?? "javascript");
const languageName = computed(() =>
  language.value === "python" ? "Python" : "JavaScript",
);
const example = computed(() => props.lesson.playground),
  output = computed(() =>
    props.lesson.exercises.find((item) => item.type === "output"),
  ),
  fill = computed(() =>
    props.lesson.exercises.find((item) => item.type === "fill"),
  );
const code = ref(
  safeStorageGet("wxg-snippet-" + props.lesson.id) ?? example.value.code,
);
const fillCode = ref(
  fill.value
    ? (safeStorageGet("wxg-fill-" + fill.value.id) ?? fill.value.starter)
    : "",
);
answer.value = safeStorageGet("wxg-output-" + output.value.id) ?? "";
const { running, result, logs, phase, initialization, run, stop, clear } =
  useCodeRunner();
const lastSource = ref(null);
let alive = true;
onBeforeUnmount(() => (alive = false));
watch(
  () => props.initialTab,
  async (value) => {
    if (value === "output" || (value === "fill" && fill.value)) {
      tab.value = value;
      await nextTick();
      document
        .getElementById("lesson-practice")
        ?.scrollIntoView({ block: "start" });
    }
  },
  { immediate: true },
);
const attempts = computed(() => store.state.exerciseAttempts ?? []);
const passedCount = computed(
  () =>
    props.lesson.exercises.filter(
      (exercise) =>
        attempts.value.find((attempt) => attempt.exerciseId === exercise.id)
          ?.passed,
    ).length,
);
const lastOutput = computed(() =>
  attempts.value.find((attempt) => attempt.exerciseId === output.value.id),
);
const activeCode = computed(() =>
  tab.value === "fill" ? fillCode.value : code.value,
);
const stale = computed(
  () => lastSource.value !== null && lastSource.value !== activeCode.value,
);
watch(code, (value) => safeStorageSet("wxg-snippet-" + props.lesson.id, value));
watch(fillCode, (value) => {
  if (fill.value) safeStorageSet("wxg-fill-" + fill.value.id, value);
});
watch(answer, (value) =>
  safeStorageSet("wxg-output-" + output.value.id, value),
);
watch(tab, () => {
  clear();
  lastSource.value = null;
  resetPending.value = false;
  saveStatus.value = "";
});
async function execute({ reloadRuntime = false } = {}) {
  const isFill = tab.value === "fill",
    source = isFill ? fillCode.value : code.value;
  const current = fill.value;
  lastSource.value = source;
  saveStatus.value = "";
  const value = await run(
    isFill
      ? {
          language: language.value,
          code: source,
          signature: current.signature,
          tests: current.tests,
          reloadRuntime,
        }
      : {
          language: language.value,
          mode: "snippet",
          code: source,
          reloadRuntime,
        },
  );
  if (!alive || value.cancelled || !isFill) return;
  if (value.initializationFailed) {
    saveStatus.value =
      "Python 环境尚未就绪，本次未记录为答错。可重新加载后验证。";
    return;
  }
  saveStatus.value = "正在保存本次验证…";
  const saved = await mutate(
    "/lesson-exercises/" + current.id + "/attempt",
    "POST",
    {
      answer: source,
      passedTests: value.results?.filter((test) => test.passed).length ?? 0,
      totalTests: current.tests.length,
    },
  );
  if (alive)
    saveStatus.value = saved
      ? "本次验证已保存到学习记录"
      : "记录保存失败，可重新验证后保存。";
}
async function verifyOutput() {
  if (!answer.value.trim() || submitting.value) return;
  const submitted = answer.value;
  submitting.value = true;
  const saved = await mutate(
    "/lesson-exercises/" + output.value.id + "/attempt",
    "POST",
    { answer: submitted },
  );
  submitting.value = false;
  if (saved) {
    feedback.value = saved.feedback;
    feedbackAnswer.value = submitted;
  }
}
function reset() {
  if (!resetPending.value) {
    resetPending.value = true;
    return;
  }
  if (tab.value === "fill") fillCode.value = fill.value.starter;
  else code.value = example.value.code;
  clear();
  lastSource.value = null;
  resetPending.value = false;
}
function openExercises() {
  tab.value = "output";
  document
    .getElementById("lesson-practice")
    ?.scrollIntoView({ block: "start" });
}
function openExample() {
  tab.value = "code";
  document
    .getElementById("lesson-practice")
    ?.scrollIntoView({ block: "start" });
}
function moveTab(event) {
  const keys = fill.value ? ["code", "output", "fill"] : ["code", "output"];
  const index = keys.indexOf(tab.value);
  let next;
  if (event.key === "ArrowRight") next = (index + 1) % keys.length;
  else if (event.key === "ArrowLeft")
    next = (index + keys.length - 1) % keys.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = keys.length - 1;
  else return;
  event.preventDefault();
  tab.value = keys[next];
  document.getElementById("lesson-" + tab.value + "-tab")?.focus();
}
defineExpose({ openExercises, openExample });
</script>
<template>
  <section id="lesson-practice" class="lesson-practice article-section">
    <div class="section-line lesson-practice-heading">
      <div>
        <div class="eyebrow">READ · EDIT · VERIFY</div>
        <h2><Icon name="FlaskConical" :size="22" />边读边试</h2>
      </div>
      <span class="badge"
        >随堂练习 {{ passedCount }} / {{ lesson.exercises.length }} 通过</span
      >
    </div>
    <p class="lesson-practice-intro">
      从这篇资料的具体代码开始，修改输入、观察输出，再独立验证理解。
    </p>
    <PythonRuntimeDialog
      v-if="language === 'python'"
      :state="initialization"
      @cancel="stop()"
      @retry="execute({ reloadRuntime: true })"
    />
    <div
      class="lesson-practice-tabs"
      role="tablist"
      @keydown="moveTab"
      aria-label="本课代码与练习"
    >
      <button
        id="lesson-code-tab"
        role="tab"
        :tabindex="tab === 'code' ? 0 : -1"
        :aria-selected="tab === 'code'"
        aria-controls="lesson-code-panel"
        :class="{ active: tab === 'code' }"
        @click="tab = 'code'"
      >
        代码试验</button
      ><button
        id="lesson-output-tab"
        role="tab"
        :tabindex="tab === 'output' ? 0 : -1"
        :aria-selected="tab === 'output'"
        aria-controls="lesson-output-panel"
        :class="{ active: tab === 'output' }"
        @click="tab = 'output'"
      >
        预测输出</button
      ><button
        v-if="fill"
        id="lesson-fill-tab"
        role="tab"
        :tabindex="tab === 'fill' ? 0 : -1"
        :aria-selected="tab === 'fill'"
        aria-controls="lesson-fill-panel"
        :class="{ active: tab === 'fill' }"
        @click="tab = 'fill'"
      >
        补全代码
      </button>
    </div>
    <div
      v-if="tab === 'code'"
      id="lesson-code-panel"
      role="tabpanel"
      aria-labelledby="lesson-code-tab"
    >
      <div class="lesson-example-caption">
        <div class="row wrap">
          <h3>{{ example.title }}</h3>
          <span class="badge subtle">{{
            example.runtime === "model" ? "教学模拟" : "可运行示例"
          }}</span>
        </div>
        <p>{{ example.description }}</p>
        <p v-if="example.runtime === 'model'" class="example-scope">
          此处运行可控的教学模型，不调用真实 AI 服务、微信宿主或 Node 专属
          API，也不执行业务写入；实际用法与边界见正文和示例说明。
        </p>
      </div>
      <div class="lesson-editor-shell">
        <div class="workbench-toolbar">
          <span>{{ language === "python" ? "example.py" : "example.js" }}</span>
          <div class="row wrap">
            <button class="text-btn" @click="reset">
              {{ resetPending ? "确认恢复原例" : "恢复原例" }}</button
            ><button
              v-if="resetPending"
              class="text-btn"
              @click="resetPending = false"
            >
              取消</button
            ><button v-if="running" class="btn small" @click="stop()">
              停止</button
            ><button
              class="btn primary small"
              :disabled="running"
              @click="execute"
            >
              <Icon name="Play" :size="15" />运行代码
            </button>
          </div>
        </div>
        <CodeEditor
          :key="'example-' + lesson.id"
          v-model="code"
          :label="'本课 ' + languageName + ' 示例代码'"
          :language="language"
          :height="330"
          @run="execute"
        />
        <p v-if="running && phase" class="workbench-save-hint" role="status">
          {{ phase }}
        </p>
        <RunOutput
          :language="language"
          :result="result"
          :logs="logs"
          :running="running"
          :stale="stale"
        />
      </div>
      <p class="workbench-save-hint">
        代码草稿自动保存在当前浏览器 · 支持顶层 await · 执行上限 4 秒
        <span v-if="language === 'python'">
          · Python
          环境加载时间单独计时；仅内置标准库与内存文件，无第三方包、真实爬虫网络或模型
          API</span
        >
      </p>
      <AppDisclosure class="example-explanation">
        <template #title>这段代码在说明什么？</template>
        <p>{{ example.explanation }}</p>
      </AppDisclosure>
    </div>
    <div
      v-else-if="tab === 'output'"
      id="lesson-output-panel"
      role="tabpanel"
      aria-labelledby="lesson-output-tab"
    >
      <div class="lesson-example-caption">
        <h3>先预测，再验证</h3>
        <p>{{ output.prompt }}</p>
        <p class="output-line-hint">
          本题需要
          {{ output.expectedLogs.length }} 行输出，每次输出占一行。布尔值填写
          true / false，无需加引号。
        </p>
        <p class="example-scope">
          以下面的原始代码为准，试验区的修改不会改变本题答案。
        </p>
      </div>
      <CodeBlock :language="language" :code="output.code" /><label
        class="field-label"
        :for="'output-answer-' + lesson.id"
        >你预测的输出</label
      ><AppField
        multiline
        :id="'output-answer-' + lesson.id"
        v-model="answer"
        :rows="Math.max(3, Math.min(9, example.expectedLogs.length + 1))"
        maxlength="10000"
        class="output-answer"
        spellcheck="false"
        placeholder="第一条输出&#10;第二条输出&#10;…"
      ></AppField>
      <div class="section-line output-submit">
        <span class="muted tiny">{{
          lastOutput
            ? "此前" +
              (lastOutput.passed ? "已通过" : "尚未通过") +
              " · 可反复尝试"
            : "逐行核对；容许单/双引号、格式空格和对象键顺序不同"
        }}</span
        ><button
          class="btn primary small"
          :disabled="submitting || !answer.trim()"
          @click="verifyOutput"
        >
          {{ submitting ? "验证中…" : "验证答案"
          }}<Icon name="CheckCheck" :size="16" />
        </button>
      </div>
      <div
        v-if="feedback"
        class="output-feedback"
        :class="{ passed: feedback.passed }"
      >
        <div class="row">
          <Icon
            :name="feedback.passed ? 'CheckCircle2' : 'CircleAlert'"
            :size="20"
          /><strong>{{
            feedback.passed ? "输出判断正确" : "还有输出需要核对"
          }}</strong>
        </div>
        <p v-if="feedbackAnswer !== answer" class="run-stale">
          答案已修改，请再次验证。
        </p>
        <p class="output-match-summary" role="status">
          已匹配 {{ feedback.matched }} / {{ feedback.total }} 行
          <span v-if="feedback.lines.some((line) => line.actual === null)">
            · 还有输出未填写，请按顺序补全。</span
          >
          <span
            v-else-if="feedback.lines.some((line) => line.expected === null)"
          >
            · 填写的行数超过了原始代码的输出次数。</span
          >
        </p>
        <div
          v-for="(line, i) in feedback.lines"
          :key="i"
          class="output-comparison"
        >
          <span class="line-index">{{ i + 1 }}</span
          ><Icon :name="line.passed ? 'Check' : 'X'" :size="15" />
          <div>
            <pre>你的答案：{{ line.actual ?? "（缺少这一行）" }}</pre>
            <pre v-if="!line.passed">
参考输出：{{ line.expected ?? "（不应有这一行）" }}</pre>
          </div>
        </div>
        <p>{{ output.explanation }}</p>
        <small>已保存本次随堂记录；不计入选择题正确率。</small>
      </div>
    </div>
    <div
      v-else-if="fill"
      id="lesson-fill-panel"
      role="tabpanel"
      aria-labelledby="lesson-fill-tab"
    >
      <div class="lesson-example-caption">
        <h3>补上关键的一步</h3>
        <p>{{ fill.prompt }}</p>
        <AppDisclosure class="fill-hint">
          <template #title>给我一点提示</template>
          <p>{{ fill.hint }}</p>
        </AppDisclosure>
      </div>
      <div class="lesson-editor-shell">
        <div class="workbench-toolbar">
          <span
            >{{ language === "python" ? "exercise.py" : "exercise.js" }} ·
            {{ fill.tests.length }} 个用例</span
          >
          <div class="row wrap">
            <button class="text-btn" @click="reset">
              {{ resetPending ? "确认重置" : "重置" }}</button
            ><button
              v-if="resetPending"
              class="text-btn"
              @click="resetPending = false"
            >
              取消</button
            ><button v-if="running" class="btn small" @click="stop()">
              停止</button
            ><button
              class="btn primary small"
              :disabled="running"
              @click="execute"
            >
              <Icon name="Play" :size="15" />运行并验证
            </button>
          </div>
        </div>
        <CodeEditor
          :key="fill.id"
          v-model="fillCode"
          :label="'随堂补全 ' + languageName + ' 代码'"
          :language="language"
          :height="280"
          @run="execute"
        />
        <p v-if="running && phase" class="workbench-save-hint" role="status">
          {{ phase }}
        </p>
        <RunOutput
          :language="language"
          :result="result"
          :logs="logs"
          :running="running"
          :stale="stale"
        />
      </div>
      <p class="workbench-save-hint" role="status">
        {{ saveStatus || "代码草稿自动保存；运行后按题目用例验证。" }}
      </p>
      <AppDisclosure class="example-explanation">
        <template #title>查看参考补全与解释</template>
        <CodeBlock :language="language" :code="fill.solution" />
        <p>{{ fill.explanation }}</p>
      </AppDisclosure>
    </div>
  </section>
</template>
