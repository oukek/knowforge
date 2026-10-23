<script setup>
import AppSelect from "../components/AppSelect.vue";
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  store,
  mutate,
  safeStorageGet,
  safeStorageSet,
  moduleFor,
} from "../store";
import Icon from "../components/Icon.vue";
import Markdown from "../components/Markdown.vue";
import CodeBlock from "../components/CodeBlock.vue";
import NoteEditor from "../components/NoteEditor.vue";
import CodeEditor from "../components/CodeEditor.vue";
import RunOutput from "../components/RunOutput.vue";
import { useCodeRunner } from "../composables/useCodeRunner";
const route = useRoute(),
  router = useRouter();
const labs = computed(() => store.catalog.labs),
  lab = computed(() => labs.value.find((l) => l.id === route.params.id));
const moduleId = ref(""),
  training = ref("");
const filteredLabs = computed(() =>
  labs.value
    .filter(
      (item) =>
        (!moduleId.value || item.moduleId === moduleId.value) &&
        (!training.value || (item.pool || "foundation") === training.value),
    )
    .sort(
      (a, b) => Number(b.pool === "transfer") - Number(a.pool === "transfer"),
    ),
);
const labModules = computed(() =>
  store.catalog.modules.filter((item) =>
    labs.value.some((entry) => entry.moduleId === item.id),
  ),
);
const code = ref(""),
  showSolution = ref(false),
  hintCount = ref(0),
  resetPending = ref(false);
const {
  running,
  result: results,
  logs,
  run: executeCode,
  stop,
  clear,
} = useCodeRunner();
const lastSource = ref(null);
watch(
  () => route.params.id,
  () => {
    clear();
    lastSource.value = null;
    code.value = lab.value
      ? (safeStorageGet("wxg-code-" + lab.value.id) ?? lab.value.starter)
      : "";
    results.value = null;
    showSolution.value = false;
    hintCount.value = 0;
    resetPending.value = false;
  },
  { immediate: true },
);
watch(code, (value) => {
  if (lab.value) safeStorageSet("wxg-code-" + lab.value.id, value);
});
function reset() {
  if (!resetPending.value) {
    resetPending.value = true;
    return;
  }
  code.value = lab.value.starter;
  clear();
  lastSource.value = null;
  resetPending.value = false;
}
async function run() {
  if (!lab.value || running.value) return;
  const current = lab.value,
    source = code.value;
  lastSource.value = source;
  const value = await executeCode(
    { code: source, signature: current.signature, tests: current.tests },
    current.timeLimitMs,
  );
  if (value.results && !value.cancelled)
    await mutate("/attempts/code-" + current.id, "POST", {
      answer: source,
      passedTests: value.results.filter((test) => test.passed).length,
      totalTests: current.tests.length,
    });
}
const passed = computed(
  () =>
    new Set(
      store.state.attempts
        .filter((x) => x.kind === "coding" && x.passed)
        .map((x) => x.questionId),
    ),
);
</script>
<template>
  <div v-if="!route.params.id" class="page-enter">
    <div class="page-heading">
      <div>
        <div class="eyebrow">CODE & VERIFY</div>
        <h1>把理解，写成可以运行的代码。</h1>
        <p>
          {{ labs.length }} 个手写实验，覆盖并发、数据结构、流式解析与工程边界。
        </p>
      </div>
      <span class="lab-environment"
        ><span class="status-dot"></span>浏览器 Worker · JavaScript</span
      >
    </div>
    <div class="info-banner">
      <Icon name="FlaskConical" :size="20" />
      <p>
        每道题都有输入契约、边界用例、分步提示和参考实现。代码在浏览器 Worker
        中运行，4 秒超时会终止，Node 服务端不执行你的代码。Python 补全练习位于
        Python、爬虫、API、AI 与 Agent 资料的“边读边试”。
      </p>
    </div>
    <div class="filter-bar">
      <AppSelect
        v-model="moduleId"
        label="实验专题"
        :options="[
          { value: '', label: '全部实验专题' },
          ...labModules.map((item) => ({ value: item.id, label: item.title })),
        ]"
      />
      <AppSelect
        v-model="training"
        label="实验训练范围"
        :options="[
          { value: '', label: '全部实验（新增算法优先）' },
          { value: 'transfer', label: '算法迁移挑战' },
          { value: 'foundation', label: '基础手写实验' },
        ]"
      />
      <span class="muted tiny">{{ filteredLabs.length }} 个实验</span>
    </div>
    <div class="lab-grid">
      <RouterLink
        v-for="(l, i) in filteredLabs"
        :key="l.id"
        :to="'/labs/' + l.id"
        class="lab-card"
        ><div class="section-line">
          <span class="lab-number">{{ String(i + 1).padStart(2, "0") }}</span
          ><span
            class="badge"
            :class="{ subtle: !passed.has('code-' + l.id) }"
            >{{ passed.has("code-" + l.id) ? "已通过" : "待挑战" }}</span
          >
        </div>
        <h2>{{ l.title }}</h2>
        <span v-if="l.pool === 'transfer'" class="tiny green-text"
          >算法迁移 · 不变量与边界</span
        >
        <p>{{ l.prompt }}</p>
        <div class="card-meta">
          <span
            >{{ l.tests.length }} 个用例 <i>·</i>
            {{ moduleFor(l.moduleId)?.title }}</span
          ><Icon name="ArrowUpRight" :size="18" /></div
      ></RouterLink>
    </div>
    <div v-if="!filteredLabs.length" class="empty-state">
      <p>当前筛选没有实验，调整专题或训练范围再试。</p>
    </div>
  </div>
  <div v-else-if="lab" class="lab-workspace page-enter">
    <div class="section-line">
      <RouterLink to="/labs" class="back-link"
        ><Icon name="ArrowLeft" :size="16" />全部手写实验</RouterLink
      ><AppSelect
        :model-value="lab.id"
        label="切换代码实验"
        :options="labs.map((l) => ({ value: l.id, label: l.title }))"
        @change="router.push('/labs/' + $event)"
      />
    </div>
    <div class="lab-title">
      <div>
        <span class="eyebrow">JAVASCRIPT CHALLENGE</span>
        <h1>{{ lab.title }}</h1>
      </div>
      <RouterLink :to="'/learn/' + lab.lessonId" class="text-link"
        >关联知识点<Icon name="ArrowUpRight" :size="16"
      /></RouterLink>
    </div>
    <div class="coding-layout">
      <section class="lab-description">
        <h3>实现要求</h3>
        <Markdown :content="lab.prompt" /><code class="signature">{{
          lab.signature
        }}</code>
        <h3>需要通过的用例</h3>
        <ul class="test-names">
          <li v-for="test in lab.tests" :key="test.name">
            <Icon name="CircleDot" :size="15" />{{ test.name }}
          </li>
        </ul>
        <h3>逐步提示</h3>
        <div
          v-for="hint in lab.hints.slice(0, hintCount)"
          :key="hint"
          class="hint-box"
        >
          {{ hint }}
        </div>
        <button
          class="text-btn"
          v-if="hintCount < lab.hints.length"
          @click="hintCount++"
        >
          <Icon name="Lightbulb" :size="16" />查看提示 {{ hintCount + 1 }} /
          {{ lab.hints.length }}
        </button>
        <div class="lab-boundary tiny muted">
          实验只覆盖题目声明的契约。通过这些用例不等同于覆盖所有规范或生产场景。
        </div>
      </section>
      <section class="editor-section">
        <div class="editor-toolbar">
          <span><span class="file-dot"></span>solution.js</span>
          <div class="row">
            <button class="text-btn" @click="reset">
              {{ resetPending ? "确认重置草稿" : "重置" }}</button
            ><button
              v-if="resetPending"
              class="text-btn"
              @click="resetPending = false"
            >
              取消</button
            ><button class="btn primary small" :disabled="running" @click="run">
              <Icon name="Play" :size="15" />{{
                running ? "运行中…" : "运行用例"
              }}</button
            ><button v-if="running" class="btn small" @click="stop()">
              停止
            </button>
          </div>
        </div>
        <CodeEditor
          :key="lab.id"
          v-model="code"
          label="JavaScript 代码"
          :height="382"
          @run="run"
        />
        <div class="editor-status">
          <span>JavaScript · 2 spaces</span
          ><span>草稿自动保存到当前浏览器</span>
        </div>
        <RunOutput
          :result="results"
          :logs="logs"
          :running="running"
          :stale="lastSource !== null && lastSource !== code"
        />
      </section>
    </div>
    <section class="solution-section">
      <button class="btn" @click="showSolution = !showSolution">
        <Icon :name="showSolution ? 'EyeOff' : 'BookOpen'" :size="17" />{{
          showSolution ? "收起参考实现" : "查看参考实现与复杂度"
        }}
      </button>
      <div v-if="showSolution" class="solution-body">
        <p>{{ lab.complexity }}</p>
        <CodeBlock :code="lab.solution" />
        <p class="muted tiny">先对照不变量和边界理解，再尝试自己重新写一遍。</p>
      </div>
    </section>
    <NoteEditor :target-id="lab.id" />
  </div>
  <div v-else class="empty-state">
    <h1>实验不存在</h1>
    <RouterLink to="/labs" class="btn">返回实验室</RouterLink>
  </div>
</template>
