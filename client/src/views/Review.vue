<script setup>
import AppField from "../components/AppField.vue";
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import {
  store,
  dueReviews,
  questions,
  lessons,
  typeLabel,
  dateLabel,
  moduleFor,
  mutate,
  ratingLabels,
} from "../store";
import Icon from "../components/Icon.vue";
import QuestionPanel from "../components/QuestionPanel.vue";
const router = useRouter(),
  tab = ref("due"),
  active = ref(null),
  query = ref("");
const inlineLookup = new Map(
  store.catalog.lessons.flatMap((lesson) =>
    (lesson.exercises ?? []).map((exercise) => [
      exercise.id,
      {
        ...exercise,
        lessonId: lesson.id,
        moduleId: lesson.moduleId,
        lessonTitle: lesson.title,
      },
    ]),
  ),
);
const tabs = computed(() => [
  ["due", "到期复习", dueReviews.value.length],
  ["wrong", "薄弱题", store.state.reviews.filter((x) => x.wrong).length],
  ["bookmarks", "我的收藏", store.state.bookmarks.length],
  [
    "notes",
    "学习笔记",
    Object.keys(store.state.notes).filter((k) =>
      store.state.notes[k].content.trim(),
    ).length,
  ],
  ["history", "作答记录", store.state.attempts.length],
  ["exercises", "随堂记录", store.state.exerciseAttempts?.length ?? 0],
]);
function target(id) {
  const l = lessons.value.find((x) => x.id === id);
  if (l)
    return {
      title: l.title,
      path: "/learn/" + id,
      kind: "知识点",
      moduleId: l.moduleId,
    };
  const q = questions.value.find((x) => x.id === id);
  if (q)
    return {
      title: q.prompt,
      path: q.type === "coding" ? "/labs/" + q.labId : "/practice/" + id,
      kind: typeLabel[q.type],
      question: q,
      moduleId: q.moduleId,
    };
  const lab = store.catalog.labs.find((x) => x.id === id);
  if (lab)
    return {
      title: lab.title,
      path: "/labs/" + id,
      kind: "实验笔记",
      moduleId: lab.moduleId,
    };
  return null;
}
const rows = computed(() => {
  let r = [];
  if (["due", "wrong"].includes(tab.value))
    r = (
      tab.value === "due"
        ? dueReviews.value
        : store.state.reviews.filter((x) => x.wrong)
    ).map((x) => ({ ...x, id: x.questionId, ...target(x.questionId) }));
  if (tab.value === "bookmarks")
    r = store.state.bookmarks.map((id) => ({ id, ...target(id) }));
  if (tab.value === "notes")
    r = Object.entries(store.state.notes)
      .filter(([, n]) => n.content.trim())
      .map(([id, n]) => ({ id, ...n, ...target(id) }));
  if (tab.value === "history")
    r = store.state.attempts.map((a) => ({
      ...a,
      id: a.id,
      ...target(a.questionId),
    }));
  if (tab.value === "exercises")
    r = (store.state.exerciseAttempts ?? []).map((attempt) => {
      const exercise = inlineLookup.get(attempt.exerciseId);
      return {
        ...attempt,
        id: "inline-" + attempt.id,
        title:
          (exercise?.lessonTitle ?? "知识点") +
          " · " +
          (exercise?.title ?? "随堂练习"),
        kind: attempt.type === "output" ? "预测输出" : "补全代码",
        moduleId: exercise?.moduleId,
        path: "/learn/" + attempt.lessonId + "?practice=" + attempt.type,
      };
    });
  return r.filter((x) =>
    x.title?.toLowerCase().includes(query.value.toLowerCase()),
  );
});
function open(row) {
  if (["due", "wrong"].includes(tab.value) && row.question?.type !== "coding")
    active.value = row.question;
  else router.push(row.path);
}
function next() {
  const item = rows.value.find(
    (x) =>
      x.question &&
      x.question.id !== active.value?.id &&
      x.question.type !== "coding",
  );
  if (item) active.value = item.question;
  else active.value = null;
}
</script>
<template>
  <div class="page-enter">
    <div class="page-heading">
      <div>
        <div class="eyebrow">SPACED PRACTICE</div>
        <h1>让薄弱的地方，慢慢变扎实。</h1>
        <p>从主动回忆开始。复习间隔依据表现调整，收藏和笔记也都在这里。</p>
      </div>
      <span class="badge">{{ dueReviews.length }} 道已到期</span>
    </div>
    <div class="type-tabs">
      <button
        v-for="[key, label, n] in tabs"
        :key="key"
        :class="{ active: tab === key }"
        @click="
          tab = key;
          active = null;
        "
      >
        {{ label }}<span>{{ n }}</span>
      </button>
    </div>
    <template v-if="active"
      ><div class="section-line review-back">
        <button class="text-btn" @click="active = null">
          <Icon name="ArrowLeft" :size="16" />返回复习队列</button
        ><button class="btn small" @click="next">
          下一道待复习<Icon name="ArrowRight" :size="16" />
        </button>
      </div>
      <QuestionPanel :key="active.id" :question="active" review-mode
    /></template>
    <template v-else
      ><div class="filter-bar">
        <div class="input-search">
          <Icon name="Search" :size="18" /><AppField
            v-model="query"
            aria-label="搜索复习内容"
            placeholder="搜索当前列表…"
          />
        </div>
        <p class="muted tiny" v-if="tab === 'due'">
          忘记 → 10 分钟 · 困难 → 1 天 · 独立回答 → 至少 2 天 · 很稳 → 至少 4 天
        </p>
      </div>
      <div v-if="rows.length" class="review-list">
        <button
          v-for="(r, i) in rows"
          :key="r.id + '-' + i"
          class="review-row"
          @click="open(r)"
        >
          <span class="review-icon"
            ><Icon
              :name="
                tab === 'notes'
                  ? 'NotebookPen'
                  : tab === 'bookmarks'
                    ? 'Bookmark'
                    : ['history', 'exercises'].includes(tab)
                      ? r.passed
                        ? 'CheckCircle2'
                        : 'CircleDot'
                      : 'RotateCcw'
              "
              :size="19"
          /></span>
          <div>
            <div class="row wrap">
              <span class="badge subtle">{{
                r.kind === "objective"
                  ? "单选"
                  : r.kind === "self"
                    ? "开放题自评"
                    : r.kind === "coding"
                      ? "代码实验"
                      : r.kind
              }}</span
              ><span class="tiny muted">{{
                moduleFor(r.moduleId)?.title
              }}</span>
            </div>
            <h3>{{ r.title }}</h3>
            <p v-if="r.content" class="note-preview">
              {{ r.content.slice(0, 180) }}
            </p>
            <p v-if="r.dueAt" class="tiny muted">
              {{ tab === "wrong" ? "下次复习：" : "到期："
              }}{{ dateLabel(r.dueAt) }} · 已连续掌握 {{ r.streak }} 次
            </p>
            <p v-if="r.createdAt" class="tiny muted">
              {{ dateLabel(r.createdAt) }} ·
              {{
                r.kind === "self"
                  ? "按要点自评"
                  : r.passed
                    ? "答对 / 通过"
                    : "待巩固"
              }}
            </p>
          </div>
          <Icon name="ChevronRight" :size="18" />
        </button>
      </div>
      <div v-else class="empty-state">
        <span class="empty-illustration"
          ><Icon
            :name="
              tab === 'due'
                ? 'Coffee'
                : tab === 'notes'
                  ? 'NotebookPen'
                  : 'Sprout'
            "
            :size="38"
        /></span>
        <h2>
          {{
            query
              ? "没有匹配内容"
              : tab === "due"
                ? "此刻，没有到期的复习"
                : tab === "wrong"
                  ? "薄弱题会在练习后汇集到这里"
                  : tab === "notes"
                    ? "把自己的理解，留在笔记里"
                    : tab === "history"
                      ? "第一份练习记录，从现在开始"
                      : tab === "exercises"
                        ? "读一篇资料，试一题随堂练习"
                        : "值得反复读的内容，可以收藏在这里"
          }}
        </h2>
        <p>
          {{
            tab === "due"
              ? "继续新内容，或回到薄弱题主动复习。"
              : tab === "exercises"
                ? "预测输出和代码补全的验证结果会保存在这里。"
                : "读完一个知识点，试着独立回答关联问题。"
          }}
        </p>
        <RouterLink
          :to="tab === 'exercises' ? '/learn' : '/practice'"
          class="btn primary"
          >{{ tab === "exercises" ? "去读资料" : "去练习题目"
          }}<Icon name="ArrowRight" :size="16"
        /></RouterLink></div
    ></template>
  </div>
</template>
