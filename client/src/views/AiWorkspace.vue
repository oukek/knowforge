<script setup>
import { ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { request, modules, store, dateLabel } from "../store.js";
import { ai, refreshAi, featureLabel, aiStateLabel, useAiTask } from "../ai.js";
import AppField from "../components/AppField.vue";
import AppSelect from "../components/AppSelect.vue";
import AppDisclosure from "../components/AppDisclosure.vue";
import AiEvaluation from "../components/AiEvaluation.vue";
import AiRunMeta from "../components/AiRunMeta.vue";
import MyAiCredits from "../components/MyAiCredits.vue";
import Icon from "../components/Icon.vue";
const route = useRoute(),
  router = useRouter();
const tab = ref(route.query.tab === "interview" ? "interview" : "history");
const history = ref({ rows: [], total: 0, page: 1 }),
  ledger = ref({ rows: [], total: 0, page: 1 }),
  sessions = ref([]);
const feature = ref(""),
  status = ref(""),
  page = ref(1),
  ledgerPage = ref(1),
  selected = ref(null),
  message = ref(""),
  loading = ref(false);
const mode = ref("practice"),
  difficulty = ref("进阶"),
  count = ref(5),
  moduleId = ref(""),
  session = ref(null),
  answer = ref("");
const task = useAiTask(),
  run = task.run,
  busy = task.busy,
  taskError = task.error;
let historyVersion = 0,
  detailVersion = 0;
async function loadHistory() {
  const version = ++historyVersion;
  try {
    const query = new URLSearchParams({ page: page.value });
    for (const [key, value] of Object.entries({
      feature: feature.value,
      status: status.value,
      questionId: route.query.questionId,
      lessonId: route.query.lessonId,
    }))
      if (value) query.set(key, value);
    const data = await request("/ai/runs?" + query);
    if (version === historyVersion) history.value = data;
  } catch (e) {
    message.value = e.message;
  }
}
async function loadLedger() {
  try {
    ledger.value = await request("/ai/ledger?page=" + ledgerPage.value);
  } catch (e) {
    message.value = e.message;
  }
}
async function loadSessions() {
  try {
    sessions.value = (await request("/ai/interviews")).rows;
  } catch (e) {
    message.value = e.message;
  }
}
async function loadSession(id) {
  try {
    session.value = await request("/ai/interviews/" + id);
    if (session.value.activeRunId) task.resume(session.value.activeRunId);
  } catch (e) {
    message.value = e.message;
  }
}
async function startInterview() {
  loading.value = true;
  message.value = "";
  try {
    session.value = await request("/ai/interviews", "POST", {
      mode: mode.value,
      difficulty: difficulty.value,
      count: count.value,
      moduleId: moduleId.value,
    });
    answer.value = "";
    await loadSessions();
  } catch (e) {
    message.value = e.message;
  } finally {
    loading.value = false;
  }
}
async function submitTurn() {
  if (!session.value) return;
  await task.start("/ai/interviews/" + session.value.id + "/turns", {
    answer: answer.value,
    turn: session.value.turns.length,
  });
}
async function endInterview() {
  loading.value = true;
  try {
    session.value = await request(
      "/ai/interviews/" + session.value.id + "/end",
      "POST",
      {},
    );
    await loadSessions();
  } catch (e) {
    message.value = e.message;
  } finally {
    loading.value = false;
  }
}
async function refreshAll() {
  await Promise.all([refreshAi(), loadHistory(), loadLedger(), loadSessions()]);
  if (selected.value) {
    selected.value = await request("/ai/runs/" + selected.value.id);
    if (selected.value.status === "running") task.resume(selected.value.id);
  }
}
async function cancelSelected() {
  try {
    await request("/ai/runs/" + selected.value.id + "/cancel", "POST", {});
    task.resume(selected.value.id);
  } catch (e) {
    message.value = e.message;
  }
}
watch([feature, status], () => {
  page.value = 1;
  void loadHistory();
});
watch(page, loadHistory);
watch(ledgerPage, loadLedger);
watch([() => route.query.questionId, () => route.query.lessonId], () => {
  page.value = 1;
  void loadHistory();
});
watch(
  () => route.query.run,
  async (id) => {
    const version = ++detailVersion;
    selected.value = null;
    if (typeof id !== "string") return;
    try {
      const value = await request("/ai/runs/" + encodeURIComponent(id));
      if (version !== detailVersion) return;
      selected.value = value;
      tab.value = "history";
      if (value.status === "running") task.resume(id);
    } catch (e) {
      message.value = e.message;
    }
  },
  { immediate: true },
);
watch(run, async (value) => {
  if (!value) return;
  if (route.query.run === value.id) selected.value = value;
  if (value.status !== "running") {
    if (value.sessionId && session.value?.id === value.sessionId) {
      const prior = session.value.turns.length;
      await loadSession(value.sessionId);
      if (session.value.turns.length > prior) answer.value = "";
    }
    await Promise.all([loadHistory(), loadLedger(), loadSessions()]);
  }
});
onMounted(async () => {
  await Promise.all([
    refreshAi().catch(() => {}),
    loadHistory(),
    loadLedger(),
    loadSessions(),
  ]);
});
</script>
<template>
  <div class="page-enter ai-workspace">
    <div class="page-heading">
      <div>
        <div class="eyebrow">AI LEARNING JOURNAL</div>
        <h1>让回答经得起追问。</h1>
        <p>针对题目评阅，围绕知识点延伸；每次练习都有记录。</p>
      </div>
      <button class="btn small" @click="refreshAll">刷新记录</button>
    </div>
    <div class="ai-balance-strip">
      <div>
        <span>{{ ai.account.exempt ? "免费资格生效" : "有效可用额度" }}</span
        ><strong>{{
          ai.account.exempt ? "免扣费" : ai.account.available
        }}</strong>
      </div>
      <div>
        <span>预占中</span><strong>{{ ai.account.reserved }}</strong>
      </div>
      <p>
        额度由管理员发放；成功调用按用量结算，免费用户免扣。失败调用释放预占。
      </p>
    </div>
    <p v-if="!ai.configured" class="info-banner">
      AI 服务尚未配置，请联系管理员。<RouterLink
        v-if="store.user?.role === 'admin'"
        :to="{ name: 'admin' }"
        >前往管理后台</RouterLink
      >
    </p>
    <div class="type-tabs">
      <button
        v-for="[value, label] in [
          ['history', '调用历史'],
          ['interview', 'AI 面试官'],
          ['ledger', '我的额度与流水'],
        ]"
        :key="value"
        :class="{ active: tab === value }"
        @click="tab = value"
      >
        {{ label }}
      </button>
    </div>
    <p v-if="ai.reason" class="ai-error">{{ ai.reason }}</p>
    <p v-if="message || taskError" class="ai-error" role="alert">
      {{ message || taskError }}
    </p>
    <template v-if="tab === 'history'">
      <div class="ai-form-row">
        <AppSelect
          v-model="feature"
          label="AI 功能筛选"
          :options="[
            { value: '', label: '全部功能' },
            ...Object.entries(featureLabel).map(([value, label]) => ({
              value,
              label,
            })),
          ]"
        />
        <AppSelect
          v-model="status"
          label="AI 状态筛选"
          :options="[
            { value: '', label: '全部状态' },
            ...Object.entries(aiStateLabel).map(([value, label]) => ({
              value,
              label,
            })),
          ]"
        />
        <span class="tiny muted">共 {{ history.total }} 条</span>
        <RouterLink
          v-if="route.query.questionId || route.query.lessonId"
          to="/ai"
          class="text-link"
          >清除知识点 / 题目关联筛选</RouterLink
        >
      </div>
      <div class="ai-record-list">
        <button
          v-for="item in history.rows"
          :key="item.id"
          class="ai-record-row"
          @click="
            router.replace({
              path: '/ai',
              query: { ...route.query, run: item.id },
            })
          "
        >
          <div>
            <span class="tiny muted"
              >{{ featureLabel[item.feature] }} ·
              {{ aiStateLabel[item.status] }}</span
            ><strong>{{ item.title }}</strong
            ><span class="tiny muted"
              >{{ dateLabel(item.createdAt) }} · {{ item.model }}</span
            >
          </div>
          <div class="ai-record-usage">
            <span>{{
              item.usage ? item.usage.total + " Token" : "用量待返回"
            }}</span
            ><strong
              >{{
                item.status === "running" ||
                item.billingStatus === "pending" ||
                item.chargedPoints === null ||
                item.chargedPoints === undefined
                  ? "预占 " + item.reservedPoints
                  : item.chargedPoints
              }}
              额度</strong
            >
          </div>
        </button>
      </div>
      <p v-if="!history.rows.length" class="ai-empty">
        还没有相关调用。可以从题目里的“AI 评阅”或“举一反三”开始。
      </p>
      <div class="ai-pagination">
        <button class="btn small" :disabled="page <= 1" @click="page--">
          上一页</button
        ><span>{{ page }}</span
        ><button
          class="btn small"
          :disabled="page * 30 >= history.total"
          @click="page++"
        >
          下一页
        </button>
      </div>
      <article v-if="selected" class="ai-detail">
        <div class="section-line">
          <h2>{{ featureLabel[selected.feature] }}记录</h2>
          <button
            class="text-btn"
            @click="
              router.replace({
                path: '/ai',
                query: { ...route.query, run: undefined },
              })
            "
          >
            收起详情
          </button>
        </div>
        <AiRunMeta :run="selected" /><button
          v-if="selected.status === 'running'"
          class="btn small"
          @click="cancelSelected"
        >
          取消任务
        </button>
        <div class="row wrap">
          <RouterLink
            v-if="selected.lessonId"
            :to="'/learn/' + selected.lessonId"
            class="text-link"
            >关联知识点</RouterLink
          ><RouterLink
            v-if="selected.questionId"
            :to="'/practice/' + selected.questionId"
            class="text-link"
            >关联题目</RouterLink
          ><button
            v-if="selected.sessionId"
            class="text-btn"
            @click="
              tab = 'interview';
              loadSession(selected.sessionId);
            "
          >
            打开关联面试
          </button>
        </div>
        <section v-if="selected.answer">
          <h3>当时的回答</h3>
          <p class="ai-answer-text">{{ selected.answer }}</p>
        </section>
        <AiEvaluation
          :value="
            selected.feature === 'grade'
              ? selected.result
              : selected.result?.evaluation
          "
        />
        <div
          v-if="selected.feature === 'variants' && selected.result"
          class="ai-generated-list"
        >
          <article v-for="q in selected.result.questions" :key="q.id">
            <h3>{{ q.prompt }}</h3>
            <RouterLink :to="'/practice/' + q.id" class="text-link"
              >继续练习这道生成题 →</RouterLink
            >
          </article>
        </div>
        <p
          v-if="selected.feature === 'interview' && !selected.result"
          class="tiny muted"
        >
          面试模式的评阅在结束后展示。
        </p>
      </article>
    </template>
    <template v-if="tab === 'interview'">
      <section v-if="!session" class="ai-detail">
        <h2>选择这次面试的范围</h2>
        <p class="muted">
          每道主题最多追问一次。练习模式即时点评，面试模式结束后统一复盘。
        </p>
        <div class="ai-form-row">
          <AppSelect
            v-model="mode"
            label="AI 面试模式"
            :options="[
              { value: 'practice', label: '练习模式 · 即时点评' },
              { value: 'interview', label: '面试模式 · 结束后复盘' },
            ]"
          />
          <AppSelect
            v-model="moduleId"
            label="AI 面试专题"
            :options="[
              { value: '', label: '全部专题' },
              ...modules.map((m) => ({ value: m.id, label: m.title })),
            ]"
          />
          <AppSelect
            v-model="difficulty"
            label="AI 面试难度"
            :options="
              ['入门', '进阶', '挑战'].map((value) => ({ value, label: value }))
            "
          />
          <AppSelect
            v-model="count"
            label="AI 面试主题数"
            :options="
              [2, 5, 10].map((value) => ({ value, label: value + ' 个主题' }))
            "
          />
        </div>
        <button
          class="btn primary"
          :disabled="
            loading ||
            !ai.available ||
            (!ai.account.exempt && ai.account.available <= 0)
          "
          @click="startInterview"
        >
          <Icon name="MessagesSquare" :size="17" />开始面试
        </button>
      </section>
      <section v-else class="ai-detail">
        <div class="section-line">
          <h2>{{ session.status === "active" ? "面试进行中" : "面试复盘" }}</h2>
          <button class="text-btn" :disabled="busy" @click="session = null">
            返回面试列表
          </button>
        </div>
        <p class="tiny muted">
          {{ session.mode === "practice" ? "即时点评" : "结束后点评" }} · 已回答
          {{ session.turns.length }} 轮 ·
          {{ session.questionIds.length }} 个主题
        </p>
        <article
          v-for="(turn, i) in session.turns"
          :key="turn.runId"
          class="ai-interview-turn"
        >
          <h3>第 {{ i + 1 }} 轮 · 面试官</h3>
          <p>{{ turn.prompt }}</p>
          <h4>我的回答</h4>
          <p class="ai-answer-text">{{ turn.answer }}</p>
          <AppDisclosure
            v-if="turn.evaluation"
            :title="'查看本轮评阅 · ' + turn.evaluation.score + ' 分'"
            ><AiEvaluation :value="turn.evaluation"
          /></AppDisclosure>
        </article>
        <template v-if="session.status === 'active'"
          ><h3>当前问题</h3>
          <p class="ai-current-question">{{ session.currentPrompt }}</p>
          <label class="field-label" for="ai-interview-answer"
            >你的回答 · 10–3000 个字符</label
          ><AppField
            id="ai-interview-answer"
            v-model="answer"
            multiline
            rows="7"
            maxlength="3000"
            :disabled="busy"
            placeholder="先给结论，再解释机制、证据和边界。" />
          <p class="tiny muted">{{ answer.length }} / 3000</p>
          <div class="row wrap">
            <button
              class="btn primary"
              :disabled="busy || loading || answer.trim().length < 10"
              @click="submitTurn"
            >
              {{ busy ? "面试官正在评阅…" : "提交回答，继续面试" }}</button
            ><button
              class="btn"
              :disabled="busy || loading"
              @click="endInterview"
            >
              结束并生成复盘</button
            ><button v-if="busy && run" class="text-btn" @click="task.cancel()">
              取消当前调用
            </button>
          </div>
          <AiRunMeta v-if="run?.sessionId === session.id" :run="run"
        /></template>
        <section v-if="session.report" class="ai-report">
          <h3>综合评分 {{ session.report.score ?? "暂无" }}</h3>
          <p>
            已覆盖 {{ session.report.covered }} /
            {{ session.report.planned }} 个主题，按各主题最近一次回答计算。
          </p>
          <ul>
            <li v-for="(item, i) in session.report.missing" :key="i">
              {{ item }}
            </li>
          </ul>
        </section>
      </section>
      <section v-if="!session" class="ai-detail">
        <h2>最近面试</h2>
        <div class="ai-record-list">
          <button
            v-for="item in sessions"
            :key="item.id"
            class="ai-record-row"
            @click="loadSession(item.id)"
          >
            <span
              >{{ dateLabel(item.createdAt) }} ·
              {{ item.status === "active" ? "继续面试" : "查看复盘" }}</span
            ><span>{{ item.turns }} 轮 / {{ item.planned }} 个主题</span>
          </button>
        </div>
        <p v-if="!sessions.length" class="ai-empty">还没有面试记录。</p>
      </section>
    </template>
    <MyAiCredits v-if="tab === 'ledger'" />
  </div>
</template>
