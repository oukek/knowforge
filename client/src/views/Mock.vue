<script setup>
import AppDisclosure from "../components/AppDisclosure.vue";
import AppChoice from "../components/AppChoice.vue";
import AppField from "../components/AppField.vue";
import AppSelect from "../components/AppSelect.vue";
import { ref, computed, watch, onBeforeUnmount } from "vue";
import {
  store,
  modules,
  questions,
  mutate,
  toast,
  typeLabel,
  ratingLabels,
  dateLabel,
} from "../store";
import Icon from "../components/Icon.vue";
import Markdown from "../components/Markdown.vue";
const mode = ref("objective"),
  count = ref(10),
  minutes = ref(15),
  selectedModules = ref([]),
  busy = ref(false),
  exam = ref(null),
  answers = ref({}),
  index = ref(0),
  now = ref(Date.now()),
  saved = ref(""),
  selfRated = ref({});
let draftTimer,
  draftVersion = 0;
const interval = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => {
  clearInterval(interval);
  clearTimeout(draftTimer);
  saveDraft();
});
const history = computed(() => store.state.exams.slice(0, 20));
const activeExams = computed(() =>
  store.state.exams.filter((x) => x.status === "active"),
);
const examQuestions = computed(() =>
  exam.value
    ? exam.value.questionIds.map((id) =>
        questions.value.find((q) => q.id === id),
      )
    : [],
);
const current = computed(() => examQuestions.value[index.value]);
const unanswered = computed(() =>
  exam.value
    ? exam.value.questionIds.filter(
        (id) => answers.value[id] === undefined || answers.value[id] === "",
      ).length
    : 0,
);
const remaining = computed(() =>
  exam.value
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(exam.value.startedAt) +
            exam.value.minutes * 60000 -
            now.value) /
            1000,
        ),
      )
    : 0,
);
const clock = computed(
  () =>
    `${Math.floor(remaining.value / 60)
      .toString()
      .padStart(2, "0")}:${(remaining.value % 60).toString().padStart(2, "0")}`,
);
watch(remaining, (value) => {
  if (value === 0 && exam.value?.status === "active") submit(true);
});
watch(
  answers,
  () => {
    if (exam.value?.status !== "active") return;
    saved.value = "尚未保存";
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 500);
  },
  { deep: true },
);
async function saveDraft() {
  if (!exam.value || exam.value.status !== "active") return;
  const id = exam.value.id,
    version = ++draftVersion;
  const result = await mutate("/exams/" + id + "/draft", "PUT", {
    answers: { ...answers.value },
  });
  if (result && version === draftVersion) saved.value = "草稿已保存";
}
async function start() {
  busy.value = true;
  const result = await mutate("/exams", "POST", {
    mode: mode.value,
    count: count.value,
    minutes: minutes.value,
    moduleIds: selectedModules.value,
  });
  busy.value = false;
  if (result) {
    answers.value = {};
    exam.value = result.exam;
    index.value = 0;
    saved.value = "新试卷";
    now.value = Date.now();
  }
}
function load(value) {
  exam.value = JSON.parse(JSON.stringify(value));
  answers.value = { ...value.answers };
  index.value = 0;
  now.value = Date.now();
  selfRated.value = {};
  if (value.status === "active" && remaining.value === 0) submit(true);
}
async function submit(auto = false) {
  if (busy.value || exam.value?.status !== "active") return;
  busy.value = true;
  clearTimeout(draftTimer);
  const result = await mutate("/exams/" + exam.value.id + "/submit", "POST", {
    answers: { ...answers.value },
    selfRatings: {},
  });
  busy.value = false;
  if (result) {
    exam.value = result.exam;
    if (auto) toast("时间到，已自动交卷");
  }
}
async function assess(q, value) {
  const data = await mutate("/attempts/" + q.id, "POST", {
    answer: answers.value[q.id] || "",
    selfRating: value,
  });
  if (data) {
    selfRated.value = { ...selfRated.value, [q.id]: value };
    toast("已保存开放题自评，并安排复习");
  }
}
const objectiveCount = computed(
  () => exam.value?.results?.filter((x) => x.kind === "objective").length || 0,
);
</script>
<template>
  <div class="page-enter">
    <template v-if="!exam"
      ><div class="page-heading">
        <div>
          <div class="eyebrow">MOCK INTERVIEW</div>
          <h1>给思考一个时间边界。</h1>
          <p>
            先独立作答，再逐题复盘。模拟记录帮助发现短板，不预测真实招聘结果。
          </p>
        </div>
      </div>
      <div v-if="activeExams.length" class="resume-banner">
        <Icon name="History" :size="22" />
        <div>
          <strong>有 {{ activeExams.length }} 份未提交的练习</strong>
          <p>
            最近开始于
            {{ dateLabel(activeExams[0].startedAt) }}，计时仍按开始时间计算。
          </p>
        </div>
        <button class="btn primary small" @click="load(activeExams[0])">
          继续这份练习
        </button>
      </div>
      <div class="mock-setup">
        <section class="setup-main">
          <h2>这次，练什么？</h2>
          <div class="mode-cards">
            <button
              class="mode-card"
              :class="{ selected: mode === 'objective' }"
              @click="mode = 'objective'"
            >
              <Icon name="ListChecks" :size="25" /><strong>基础自测</strong>
              <p>单选题自动判分<br />适合检查概念和边界</p>
              <span class="badge">客观分数</span></button
            ><button
              class="mode-card"
              :class="{ selected: mode === 'interview' }"
              @click="mode = 'interview'"
            >
              <Icon name="MessagesSquare" :size="25" /><strong>综合模拟</strong>
              <p>原理、场景与选择题<br />练习表达与方案判断</p>
              <span class="badge subtle">开放题自评</span>
            </button>
          </div>
          <div class="section-line">
            <h3>覆盖专题</h3>
            <button class="text-btn" @click="selectedModules = []">
              全部专题
            </button>
          </div>
          <p class="muted tiny">
            不选时从全部专题抽取；单选模式下部分专题题量有限。
          </p>
          <div class="module-choices">
            <AppChoice
              v-for="m in modules"
              :key="m.id"
              :class="{ selected: selectedModules.includes(m.id) }"
              type="checkbox"
              v-model="selectedModules"
              :value="m.id"
              ><Icon :name="m.icon" :size="16" />{{ m.title }}</AppChoice
            >
          </div>
        </section>
        <aside class="setup-aside">
          <h3>练习配置</h3>
          <label class="field-label" for="exam-count">题目数量</label
          ><AppSelect
            id="exam-count"
            v-model="count"
            label="题目数量"
            :options="
              [5, 10, 20, 30].map((value) => ({ value, label: `${value} 道` }))
            "
          /><label class="field-label" for="exam-minutes">限时</label
          ><AppSelect
            id="exam-minutes"
            v-model="minutes"
            label="限时"
            :options="
              [5, 15, 30, 60].map((value) => ({
                value,
                label: `${value} 分钟`,
              }))
            "
          />
          <p class="muted tiny">
            范围内题量不足时使用现有题目，至少需要 3
            道。时间到自动交卷；刷新后可以恢复已保存草稿。
          </p>
          <button class="btn primary wide" :disabled="busy" @click="start">
            {{ busy ? "组卷中…" : "开始模拟"
            }}<Icon name="ArrowRight" :size="17" />
          </button>
        </aside>
      </div>
      <section v-if="history.length" class="history-section">
        <h2>我的模拟记录</h2>
        <button
          v-for="e in history"
          :key="e.id"
          class="history-row"
          @click="load(e)"
        >
          <Icon
            :name="e.status === 'active' ? 'Clock3' : 'FileCheck2'"
            :size="20"
          />
          <div>
            <strong
              >{{ e.mode === "objective" ? "基础自测" : "综合模拟" }} ·
              {{ e.questionIds.length }} 道</strong
            ><small>{{ dateLabel(e.startedAt) }}</small>
          </div>
          <span class="badge subtle">{{
            e.status === "active"
              ? "未提交"
              : e.objectiveScore === null
                ? "待自评"
                : "客观题 " + e.objectiveScore + " 分"
          }}</span
          ><Icon name="ChevronRight" :size="17" />
        </button>
      </section>
    </template>
    <template v-else-if="exam.status === 'active'"
      ><div class="exam-top">
        <div>
          <span class="eyebrow">{{
            exam.mode === "objective" ? "FOUNDATION CHECK" : "INTERVIEW SESSION"
          }}</span>
          <h1>独立作答，专注当下。</h1>
        </div>
        <div class="exam-timer" :class="{ urgent: remaining < 60 }">
          <Icon name="Timer" :size="22" /><strong>{{ clock }}</strong
          ><span>剩余时间</span>
        </div>
      </div>
      <div class="exam-layout">
        <section class="exam-question">
          <div class="section-line">
            <span class="badge"
              >第 {{ index + 1 }} / {{ examQuestions.length }} 题</span
            ><span class="tiny muted"
              >{{ typeLabel[current.type] }} · {{ current.priority }}</span
            >
          </div>
          <h2>{{ current.prompt }}</h2>
          <fieldset v-if="current.type === 'choice'" class="options">
            <legend class="sr-only">选择答案</legend>
            <AppChoice
              v-for="(option, i) in current.options"
              :key="i"
              class="option"
              :class="{ selected: answers[current.id] === i }"
              type="radio"
              :name="current.id"
              :value="i"
              v-model="answers[current.id]"
              ><span class="option-letter">{{
                String.fromCharCode(65 + i)
              }}</span
              ><span>{{ option }}</span></AppChoice
            >
          </fieldset>
          <AppField
            multiline
            v-else
            :key="current.id"
            v-model="answers[current.id]"
            rows="12"
            maxlength="30000"
            aria-label="本题回答"
            placeholder="写出你的结论、机制、方案和边界…"
          ></AppField>
          <div class="section-line exam-navigation">
            <button class="btn" :disabled="index === 0" @click="index--">
              <Icon name="ArrowLeft" :size="16" />上一题</button
            ><span class="muted tiny">{{ saved }}</span
            ><button
              class="btn"
              :disabled="index === examQuestions.length - 1"
              @click="index++"
            >
              下一题<Icon name="ArrowRight" :size="16" />
            </button>
          </div>
        </section>
        <aside class="exam-sheet">
          <h3>答题卡</h3>
          <div class="answer-sheet">
            <button
              v-for="(q, i) in examQuestions"
              :key="q.id"
              :class="{
                answered: answers[q.id] !== undefined && answers[q.id] !== '',
                current: i === index,
              }"
              @click="index = i"
              :aria-label="'第 ' + (i + 1) + ' 题'"
            >
              {{ i + 1 }}
            </button>
          </div>
          <p class="muted tiny">
            已答 {{ examQuestions.length - unanswered }} /
            {{ examQuestions.length }} 题。<br />作答期间不展示参考答案。
          </p>
          <button
            class="btn primary wide"
            :disabled="busy"
            @click="submit(false)"
          >
            {{
              busy
                ? "提交中…"
                : unanswered
                  ? "交卷 · " + unanswered + " 题未答"
                  : "完成并交卷"
            }}
          </button>
        </aside>
      </div></template
    >
    <template v-else
      ><div class="section-line">
        <div>
          <span class="eyebrow">SESSION REVIEW</span>
          <h1>这一次，看见了哪些短板？</h1>
        </div>
        <button class="btn" @click="exam = null">开始新的练习</button>
      </div>
      <div class="exam-report">
        <div class="report-number">
          <strong>{{
            exam.objectiveScore === null ? "—" : exam.objectiveScore
          }}</strong
          ><span>客观题得分 / 100</span>
        </div>
        <div>
          <h2>{{ exam.questionIds.length }} 道题，值得再走一遍。</h2>
          <p>
            客观题 {{ objectiveCount }} 道 · 开放题
            {{ exam.questionIds.length - objectiveCount }} 道
          </p>
          <p class="muted tiny">
            开放题不混入客观分数；展开答案后按评分要点自评。完成于
            {{ dateLabel(exam.endedAt) }}。
          </p>
        </div>
      </div>
      <div class="report-questions">
        <AppDisclosure
          v-for="(q, i) in examQuestions"
          :key="q.id"
          class="report-item"
        >
          <template #title>
            <span class="question-number">{{ i + 1 }}</span
            ><strong>{{ q.prompt }}</strong
            ><span
              v-if="q.type === 'choice'"
              class="badge"
              :class="{ danger: answers[q.id] !== q.correct }"
              >{{ answers[q.id] === q.correct ? "答对" : "待巩固" }}</span
            ><span v-else class="badge subtle">{{
              selfRated[q.id] === undefined
                ? "待自评"
                : ratingLabels[selfRated[q.id]]
            }}</span>
          </template>
          <div class="report-body">
            <h4>你的回答</h4>
            <p class="written-answer">
              {{
                q.type === "choice"
                  ? answers[q.id] === undefined || answers[q.id] === null
                    ? "未作答"
                    : q.options[answers[q.id]]
                  : answers[q.id] || "未作答"
              }}
            </p>
            <h4>
              参考回答{{
                q.type === "choice"
                  ? " · " + String.fromCharCode(65 + q.correct)
                  : ""
              }}
            </h4>
            <Markdown :content="q.answer" /><template v-if="q.type !== 'choice'"
              ><h4>对照要点</h4>
              <ul>
                <li v-for="r in q.rubric" :key="r">{{ r }}</li>
              </ul>
              <div class="rating-grid">
                <button
                  class="btn small"
                  v-for="(label, v) in ratingLabels"
                  :key="label"
                  :class="{ 'chosen-rating': selfRated[q.id] === v }"
                  @click="assess(q, v)"
                >
                  {{ label }}
                </button>
              </div></template
            ><RouterLink :to="'/learn/' + q.lessonId" class="text-link"
              >复习关联知识点<Icon name="ArrowUpRight" :size="16"
            /></RouterLink>
          </div>
        </AppDisclosure></div
    ></template>
  </div>
</template>
