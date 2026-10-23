<script setup>
import AppChoice from "../components/AppChoice.vue";
import AppField from "../components/AppField.vue";
import AppSelect from "../components/AppSelect.vue";
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { store, modules, questions, typeLabel, moduleFor } from "../store";
import Icon from "../components/Icon.vue";
import QuestionPanel from "../components/QuestionPanel.vue";
const route = useRoute(),
  router = useRouter();
const questionPool = ref(
  ["transfer", "foundation", "all"].includes(route.query.pool)
    ? route.query.pool
    : "transfer",
);
const poolQuestions = computed(() =>
  questions.value.filter(
    (q) => questionPool.value === "all" || q.pool === questionPool.value,
  ),
);
const query = ref(""),
  type = ref(route.query.type || ""),
  moduleId = ref(route.query.module || ""),
  priority = ref(""),
  onlyNew = ref(false),
  page = ref(1);
const size = 20;
const attempted = computed(
  () => new Set(store.state.attempts.map((x) => x.questionId)),
);
const filtered = computed(() =>
  poolQuestions.value.filter(
    (q) =>
      (!type.value || q.type === type.value) &&
      (!moduleId.value || q.moduleId === moduleId.value) &&
      (!priority.value || q.priority === priority.value) &&
      (!onlyNew.value || !attempted.value.has(q.id)) &&
      [q.prompt, ...q.keywords]
        .join(" ")
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
);
const pageRows = computed(() =>
  filtered.value.slice((page.value - 1) * size, page.value * size),
);
const pages = computed(() => Math.ceil(filtered.value.length / size));
const current = computed(() =>
  questions.value.find((x) => x.id === route.params.id),
);
watch(
  current,
  (q) => {
    if (q?.type === "coding") router.replace("/labs/" + q.labId);
    if (q && questionPool.value !== "all" && questionPool.value !== q.pool)
      questionPool.value = q.pool;
  },
  { immediate: true },
);
const currentIndex = computed(() =>
  filtered.value.findIndex((x) => x.id === current.value?.id),
);
watch(
  [query, type, moduleId, priority, onlyNew, questionPool],
  () => (page.value = 1),
);
function open(q) {
  router.push(q.type === "coding" ? "/labs/" + q.labId : "/practice/" + q.id);
}
function random() {
  const list = filtered.value.filter((q) => q.id !== current.value?.id);
  if (list.length) open(list[Math.floor(Math.random() * list.length)]);
}
</script>
<template>
  <div v-if="!route.params.id" class="page-enter">
    <div class="page-heading">
      <div>
        <div class="eyebrow">INTERVIEW PRACTICE</div>
        <h1>问得深入，答得有据。</h1>
        <p>
          默认练迁移题：改变约束、分析故障、比较方案。基础自测单独归档，客观题自动判分，开放题对照证据自评。
        </p>
      </div>
      <button class="btn primary" :disabled="!filtered.length" @click="random">
        <Icon name="Shuffle" :size="17" />随机练一题
      </button>
    </div>
    <div class="type-tabs">
      <button
        v-for="[key, label] in [['', '全部题型'], ...Object.entries(typeLabel)]"
        :key="key"
        :class="{ active: type === key }"
        @click="type = key"
      >
        {{ label
        }}<span>{{
          poolQuestions.filter((q) => !key || q.type === key).length
        }}</span>
      </button>
    </div>
    <div class="filter-bar">
      <AppSelect
        v-model="questionPool"
        label="题目训练范围"
        :options="[
          { value: 'transfer', label: '迁移训练（推荐）' },
          { value: 'foundation', label: '基础自测' },
          { value: 'all', label: '全部题目' },
        ]"
      />
      <div class="input-search">
        <Icon name="Search" :size="18" /><AppField
          v-model="query"
          aria-label="搜索面试题"
          placeholder="搜索题目或关键词…"
        />
      </div>
      <AppSelect
        v-model="moduleId"
        label="筛选题目专题"
        :options="[
          { value: '', label: '全部专题' },
          ...modules.map((m) => ({ value: m.id, label: m.title })),
        ]"
      />
      <AppSelect
        v-model="priority"
        label="筛选题目优先级"
        :options="[
          { value: '', label: '全部优先级' },
          ...['P0', 'P1', 'P2'].map((value) => ({ value, label: value })),
        ]"
      /><AppChoice class="check-label" type="checkbox" v-model="onlyNew"
        >只看未练</AppChoice
      >
    </div>
    <div class="table-summary">
      <span
        >共 <strong>{{ filtered.length }}</strong> 道题目</span
      ><span class="muted tiny">题目为知识点练习构造，未标榜“面试真题”</span>
    </div>
    <div class="question-list">
      <button
        v-for="(q, i) in pageRows"
        :key="q.id"
        @click="open(q)"
        class="question-list-row"
      >
        <span class="question-number">{{
          String((page - 1) * size + i + 1).padStart(2, "0")
        }}</span>
        <div class="question-row-main">
          <h3>{{ q.prompt }}</h3>
          <div class="row wrap">
            <span
              class="tiny"
              :style="{ color: moduleFor(q.moduleId).color }"
              >{{ moduleFor(q.moduleId).title }}</span
            ><span class="tiny muted">{{
              q.keywords.slice(0, 3).join(" · ")
            }}</span>
          </div>
        </div>
        <span class="badge subtle">{{ typeLabel[q.type] }}</span
        ><span class="tiny muted">{{ q.priority }}</span
        ><Icon
          :name="attempted.has(q.id) ? 'CheckCircle2' : 'ChevronRight'"
          :class="{ 'green-text': attempted.has(q.id) }"
          :size="18"
        />
      </button>
    </div>
    <div v-if="!filtered.length" class="empty-state">
      <Icon name="SearchX" :size="32" />
      <h2>这个范围暂时没有题目</h2>
      <button
        class="btn"
        @click="
          query = '';
          type = '';
          moduleId = '';
          priority = '';
          onlyNew = false;
        "
      >
        重置筛选
      </button>
    </div>
    <div v-if="pages > 1" class="pagination">
      <button class="btn small" :disabled="page === 1" @click="page--">
        上一页</button
      ><span>{{ page }} / {{ pages }}</span
      ><button class="btn small" :disabled="page === pages" @click="page++">
        下一页
      </button>
    </div>
  </div>
  <div v-else-if="current" class="question-page page-enter">
    <div class="section-line">
      <RouterLink to="/practice" class="back-link"
        ><Icon name="ArrowLeft" :size="16" />返回题库</RouterLink
      ><button class="btn small" @click="random">
        <Icon name="Shuffle" :size="15" />换一道题
      </button>
    </div>
    <QuestionPanel :question="current" :key="current.id" />
    <div class="row end">
      <button
        v-if="currentIndex < filtered.length - 1"
        class="btn"
        @click="open(filtered[currentIndex + 1])"
      >
        下一题<Icon name="ArrowRight" :size="16" />
      </button>
    </div>
  </div>
  <div v-else class="empty-state">
    <h1>题目不存在</h1>
    <RouterLink to="/practice" class="btn">返回题库</RouterLink>
  </div>
</template>
