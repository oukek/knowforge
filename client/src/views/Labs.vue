<script setup>
import AppSelect from "../components/AppSelect.vue";
import AppField from "../components/AppField.vue";
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
import {
  generatedAcmCases,
  acmJudgeCount,
} from "../../../shared/acm-cases.mjs";
const route = useRoute(),
  router = useRouter();
const labs = computed(() => store.catalog.labs),
  lab = computed(() => labs.value.find((l) => l.id === route.params.id));
const moduleId = ref(""),
  training = ref(""),
  labMode = ref(""),
  category = ref(""),
  difficulty = ref("");
const filteredLabs = computed(() =>
  labs.value
    .filter(
      (item) =>
        (!moduleId.value || item.moduleId === moduleId.value) &&
        (!category.value || item.category === category.value) &&
        (!difficulty.value || item.difficulty === difficulty.value) &&
        (!training.value || (item.pool || "foundation") === training.value) &&
        (!labMode.value ||
          (item.mode === "stdin" ? "stdin" : "function") === labMode.value),
    )
    .sort(
      (a, b) =>
        Number(b.mode === "stdin") - Number(a.mode === "stdin") ||
        Number(b.pool === "transfer") - Number(a.pool === "transfer") ||
        ({ 入门: 0, 基础: 1, 进阶: 2, 挑战: 3 }[a.difficulty] ?? 2) -
          ({ 入门: 0, 基础: 1, 进阶: 2, 挑战: 3 }[b.difficulty] ?? 2),
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
  resetPending = ref(false),
  customInput = ref(""),
  lastInput = ref(null),
  lastRunCustom = ref(false);
const {
  running,
  result: results,
  logs,
  phase,
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
    customInput.value = lab.value?.samples?.[0]?.input || "";
    lastInput.value = null;
    lastRunCustom.value = false;
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
async function run(custom = false) {
  if (!lab.value || running.value) return;
  const current = lab.value,
    source = code.value;
  lastSource.value = source;
  lastInput.value = customInput.value;
  lastRunCustom.value = custom === true;
  const value = await executeCode(
    {
      code: source,
      signature: current.signature,
      mode: current.mode,
      customInput: custom === true,
      caseTimeLimitMs: current.caseTimeLimitMs,
      tests:
        custom === true
          ? [{ name: "自定义输入（只运行，不判题）", input: customInput.value }]
          : [
              ...current.tests,
              ...(current.mode === "stdin"
                ? generatedAcmCases(current.id)
                : []),
            ],
    },
    current.timeLimitMs,
  );
  if (custom !== true && value.results && !value.cancelled)
    await mutate("/attempts/code-" + current.id, "POST", {
      answer: source,
      passedTests: value.results.filter((test) => test.passed).length,
      totalTests: acmJudgeCount(current),
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
          {{ labs.length }} 个手写实验，含
          {{ labs.filter((l) => l.mode === "stdin").length }} 道 ACM
          标准输入输出题，覆盖并发、数据结构与工程边界。
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
        中运行，超时会终止。ACM 模式模拟同步 Node 标准输入输出，支持
        fs.readFileSync(0, "utf8")、console.log 和
        process.stdout.write；不提供完整 Node 环境。Python 补全练习位于
        Python、爬虫、API、AI 与 Agent 资料的“边读边试”。
      </p>
    </div>
    <div class="info-banner">
      <Icon name="BookOpen" :size="20" />
      <p>
        算法基础薄弱：先学读题与复杂度 → 排序 → 贪心 →
        动态规划。每节都有原理、手推过程、反例及可运行练习。<RouterLink
          to="/learn?collection=algorithm-foundations"
          class="text-link"
          >进入算法入门路线</RouterLink
        >
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
      <AppSelect
        v-model="labMode"
        label="答题模式"
        :options="[
          { value: '', label: '全部答题模式' },
          { value: 'stdin', label: 'ACM 标准输入输出' },
          { value: 'function', label: '函数实现' },
        ]"
      />
      <AppSelect
        v-model="category"
        label="算法分类"
        :options="[
          { value: '', label: '全部算法分类' },
          ...[...new Set(labs.map((l) => l.category).filter(Boolean))].map(
            (value) => ({ value, label: value }),
          ),
        ]"
      />
      <AppSelect
        v-model="difficulty"
        label="算法难度"
        :options="[
          { value: '', label: '全部难度' },
          ...[...new Set(labs.map((l) => l.difficulty).filter(Boolean))].map(
            (value) => ({ value, label: value }),
          ),
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
        <span v-if="l.pool === 'transfer'" class="tiny green-text">{{
          l.mode === "stdin"
            ? "ACM · " + l.difficulty
            : "算法迁移 · 不变量与边界"
        }}</span>
        <p>{{ l.prompt }}</p>
        <div class="card-meta">
          <span
            >{{ acmJudgeCount(l) }} 个用例 <i>·</i>
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
        <span class="eyebrow">{{
          lab.mode === "stdin"
            ? "ACM · STANDARD INPUT / OUTPUT"
            : "JAVASCRIPT CHALLENGE"
        }}</span>
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
        <template v-if="lab.inputFormat">
          <h3>{{ lab.mode === "stdin" ? "输入格式" : "函数输入" }}</h3>
          <Markdown :content="lab.inputFormat" />
          <h3>{{ lab.mode === "stdin" ? "输出格式" : "返回值" }}</h3>
          <Markdown :content="lab.outputFormat" />
          <h3>数据范围与约束</h3>
          <Markdown :content="lab.constraints" />
          <article
            v-for="(sample, i) in lab.samples"
            :key="i"
            class="acm-sample"
          >
            <h3>
              {{ lab.mode === "stdin" ? "样例" : "调用样例" }} {{ i + 1 }}
            </h3>
            <div class="acm-sample-columns">
              <div>
                <strong>{{ lab.mode === "stdin" ? "输入" : "调用" }}</strong>
                <pre>{{ sample.input }}</pre>
              </div>
              <div>
                <strong>{{ lab.mode === "stdin" ? "输出" : "返回" }}</strong>
                <pre>{{ sample.output }}</pre>
              </div>
            </div>
            <p>{{ sample.explanation }}</p>
            <button
              v-if="lab.mode === 'stdin'"
              class="text-btn"
              @click="customInput = sample.input"
            >
              填入运行区
            </button>
          </article>
        </template>
        <h3>需要通过的用例</h3>
        <ul class="test-names">
          <li v-for="test in lab.tests" :key="test.name">
            <Icon name="CircleDot" :size="15" />{{ test.name }}
          </li>
        </ul>
        <p v-if="lab.judge" class="tiny muted">
          另含
          {{ lab.judge.randomCases }}
          组固定种子的随机小数据（独立算法对照），以及
          {{ lab.judge.stressCases }} 组约束上限数据，提交共执行
          {{ lab.judge.caseCount }} 组。每组最多
          {{ lab.caseTimeLimitMs / 1000 }} 秒，整次最多
          {{ lab.timeLimitMs / 1000 }}
          秒；设备速度会影响耗时。学习判题在本地执行，不能代替正确性证明。
        </p>
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
            ><button
              class="btn primary small"
              :disabled="running"
              @click="run()"
            >
              <Icon name="Play" :size="15" />{{
                running
                  ? "运行中…"
                  : lab.mode === "stdin"
                    ? "提交验证"
                    : "运行用例"
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
          @run="run()"
        />
        <div class="editor-status">
          <span>JavaScript · 2 spaces</span
          ><span>草稿自动保存到当前浏览器</span>
        </div>
        <div v-if="lab.mode === 'stdin'" class="acm-input-panel">
          <label for="custom-stdin">自定义标准输入</label>
          <AppField
            multiline
            id="custom-stdin"
            v-model="customInput"
            rows="5"
            spellcheck="false"
            maxlength="4194304"
          />
          <div class="section-line">
            <span class="tiny muted"
              >仅运行，不记通过；提交验证执行固定、随机对照和规模用例。忽略行尾空白，保留行内格式。</span
            ><button class="btn small" :disabled="running" @click="run(true)">
              运行输入
            </button>
          </div>
        </div>
        <p v-if="running && phase" role="status" class="tiny green-text">
          {{ phase }}
        </p>
        <RunOutput
          :result="results"
          :logs="logs"
          :running="running"
          :stale="
            lastSource !== null &&
            (lastSource !== code ||
              (lastRunCustom && lastInput !== customInput))
          "
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
        <Markdown v-if="lab.analysis" :content="lab.analysis" />
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

<style>
.acm-sample {
  margin: 20px 0;
  border: 1px solid #d7e3d9;
  border-radius: 8px;
  padding: 14px;
  min-width: 0;
}
.acm-sample h3 {
  margin-top: 0;
}
.acm-sample-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.acm-sample-columns strong,
.acm-input-panel label,
.stdio-diff span {
  font-size: 12px;
  color: #54705e;
}
.acm-sample-columns pre,
.stdio-diff pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #edf3ee;
  border: 1px solid #dae5dc;
  border-radius: 4px;
  padding: 10px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  line-height: 1.7;
}
.acm-input-panel {
  padding: 14px;
  border-top: 1px solid #d7e3d9;
}
.acm-input-panel textarea {
  display: block;
  width: 100%;
  margin: 8px 0;
  resize: vertical;
  font: 13px/1.7 monospace;
  min-height: 110px;
}
.acm-input-panel .section-line {
  gap: 12px;
  align-items: flex-start;
}
.acm-input-panel .btn {
  flex-shrink: 0;
}
@media (max-width: 767px) {
  .acm-sample-columns {
    grid-template-columns: 1fr;
  }
  .acm-input-panel .section-line {
    flex-direction: column;
  }
}
</style>
