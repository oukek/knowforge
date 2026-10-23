<script setup>
import AppField from "../components/AppField.vue";
import AppSelect from "../components/AppSelect.vue";
import { apiUrl } from "../api-config.js";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  store,
  modules,
  lessons,
  questions,
  moduleFor,
  lessonFor,
  progressFor,
  mutate,
  bookmark,
  toast,
} from "../store";
import Icon from "../components/Icon.vue";
import Markdown from "../components/Markdown.vue";
import CodeBlock from "../components/CodeBlock.vue";
import NoteEditor from "../components/NoteEditor.vue";
import LessonPractice from "../components/LessonPractice.vue";
const practicePanel = ref(null);
const route = useRoute(),
  router = useRouter();
const query = ref(""),
  priority = ref(""),
  status = ref(""),
  depth = ref("");
const moduleId = computed(() => route.query.module || "");
const lesson = computed(() => lessonFor(route.params.id));
const filtered = computed(() =>
  lessons.value
    .filter(
      (l) =>
        (!depth.value || l.depth === depth.value) &&
        (!moduleId.value || l.moduleId === moduleId.value) &&
        (!priority.value || l.priority === priority.value) &&
        (!status.value ||
          (store.state.progress[l.id]?.status || "new") === status.value) &&
        [l.title, l.summary, ...l.keywords]
          .join(" ")
          .toLowerCase()
          .includes(query.value.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (({ deep: 0, expanded: 1, foundation: 2 })[a.depth] ?? 2) -
        ({ deep: 0, expanded: 1, foundation: 2 }[b.depth] ?? 2),
    ),
);
const siblings = computed(() =>
  lessons.value.filter((l) => l.moduleId === lesson.value?.moduleId),
);
const related = computed(() =>
  questions.value
    .filter((q) => q.lessonId === lesson.value?.id)
    .sort(
      (a, b) => Number(b.pool === "transfer") - Number(a.pool === "transfer"),
    ),
);
const sourceLinks = computed(() =>
  store.catalog.sources.filter((x) => lesson.value?.sourceIds.includes(x.id)),
);
const next = computed(() => {
  const i = lessons.value.findIndex((l) => l.id === lesson.value?.id);
  return lessons.value[i + 1];
});
function scrollToPractice() {
  practicePanel.value?.openExample();
}
async function setStatus(value) {
  const result = await mutate("/progress/" + lesson.value.id, "PUT", {
    status: value,
  });
  if (result) toast(value === "done" ? "已标记为完成" : "已更新学习状态");
}
watch(
  () => route.params.id,
  () => {
    if (lesson.value && !store.state.progress[lesson.value.id])
      mutate("/progress/" + lesson.value.id, "PUT", { status: "learning" });
  },
  { immediate: true },
);
</script>
<template>
  <div v-if="!route.params.id" class="page-enter">
    <div class="page-heading">
      <div>
        <div class="eyebrow">KNOWLEDGE LIBRARY</div>
        <h1>先理解，再构建。</h1>
        <p>
          {{ lessons.length }}
          篇系统讲解，每篇都有可运行示例与自动验证练习。新增深入专题覆盖全栈、Agent
          框架与 FDE，基础导读可沿关联专题继续。
        </p>
      </div>
      <a :href="apiUrl('/export/handbook')" class="btn"
        ><Icon name="Download" :size="17" />下载完整手册</a
      >
    </div>
    <div class="module-strip">
      <button :class="{ active: !moduleId }" @click="router.push('/learn')">
        全部专题 <span>{{ lessons.length }}</span></button
      ><button
        v-for="m in modules"
        :key="m.id"
        :class="{ active: moduleId === m.id }"
        @click="router.push({ path: '/learn', query: { module: m.id } })"
      >
        {{ m.title }} <span>{{ m.lessonCount }}</span>
      </button>
    </div>
    <div class="filter-bar">
      <AppSelect
        v-model="depth"
        label="资料深度"
        :options="[
          { value: '', label: '全部深度（进阶优先）' },
          { value: 'deep', label: '深入专题' },
          { value: 'expanded', label: '机制深化' },
          { value: 'foundation', label: '基础导读' },
        ]"
      />
      <div class="input-search">
        <Icon name="Search" :size="18" /><AppField
          v-model="query"
          aria-label="搜索知识点"
          placeholder="搜索概念、关键词…"
        />
      </div>
      <AppSelect
        v-model="priority"
        label="筛选优先级"
        :options="[
          { value: '', label: '全部优先级' },
          { value: 'P0', label: 'P0 · 优先掌握' },
          { value: 'P1', label: 'P1 · 系统巩固' },
          { value: 'P2', label: 'P2 · 按需拓展' },
        ]"
      />
      <AppSelect
        v-model="status"
        label="筛选学习状态"
        :options="[
          { value: '', label: '全部状态' },
          { value: 'new', label: '尚未学习' },
          { value: 'learning', label: '学习中' },
          { value: 'done', label: '已完成' },
        ]"
      /><span class="muted tiny">{{ filtered.length }} 篇</span>
    </div>
    <div v-if="filtered.length" class="lesson-grid">
      <RouterLink
        v-for="l in filtered"
        :key="l.id"
        :to="'/learn/' + l.id"
        class="lesson-card"
        ><div class="section-line">
          <span
            class="topic-category"
            :style="{ color: moduleFor(l.moduleId).color }"
            ><Icon :name="moduleFor(l.moduleId).icon" :size="16" />{{
              moduleFor(l.moduleId).title
            }}</span
          ><Icon
            v-if="store.state.progress[l.id]?.status === 'done'"
            name="CheckCircle2"
            class="green-text"
            :size="18"
          /><span v-else class="badge subtle">{{ l.priority }}</span>
        </div>
        <h2>{{ l.title }}</h2>
        <span class="tiny green-text">{{
          l.depth === "deep"
            ? "深入专题 · 原理 / 案例 / 反例"
            : l.depth === "expanded"
              ? "机制深化"
              : "基础导读"
        }}</span>
        <p>{{ l.summary }}</p>
        <div class="keyword-row">
          <span v-for="k in l.keywords.slice(0, 3)" :key="k">{{ k }}</span>
        </div>
        <div class="card-meta">
          <span
            ><Icon name="Clock3" :size="14" />{{
              l.estimatedMinutes
            }}
            分钟研读</span
          ><span
            >{{
              store.state.progress[l.id]?.status === "done"
                ? "已完成"
                : store.state.progress[l.id]?.status === "learning"
                  ? "继续阅读"
                  : "开始阅读"
            }}<Icon name="ArrowRight" :size="15"
          /></span></div
      ></RouterLink>
    </div>
    <div v-else class="empty-state">
      <Icon name="SearchX" :size="32" />
      <h2>还没有匹配的知识点</h2>
      <p>调整专题、状态或搜索词再试试。</p>
      <button
        class="btn"
        @click="
          query = '';
          depth = '';
          priority = '';
          status = '';
          router.push('/learn');
        "
      >
        清除筛选
      </button>
    </div>
  </div>
  <div v-else-if="lesson" class="reading-layout page-enter">
    <aside class="reading-outline">
      <RouterLink
        :to="{ path: '/learn', query: { module: lesson.moduleId } }"
        class="back-link"
        ><Icon name="ArrowLeft" :size="16" />{{
          moduleFor(lesson.moduleId).title
        }}</RouterLink
      >
      <div class="outline-progress">
        <strong
          >{{ progressFor(lesson.moduleId).done }} /
          {{ siblings.length }}</strong
        ><span>知识点已完成</span>
      </div>
      <nav aria-label="本专题知识点">
        <RouterLink
          v-for="l in siblings"
          :key="l.id"
          :to="'/learn/' + l.id"
          :class="{ current: l.id === lesson.id }"
          ><span
            class="outline-dot"
            :class="{ done: store.state.progress[l.id]?.status === 'done' }"
            ><Icon
              v-if="store.state.progress[l.id]?.status === 'done'"
              name="Check"
              :size="10" /></span
          >{{ l.title }}</RouterLink
        >
      </nav>
    </aside>
    <article class="reading-article">
      <div class="article-heading">
        <div class="section-line">
          <div class="row wrap">
            <span class="badge">{{ lesson.priority }} · {{ lesson.level }}</span
            ><span class="muted tiny"
              >约 {{ lesson.estimatedMinutes }} 分钟 · 整理于
              {{ lesson.updatedAt }}</span
            >
          </div>
          <button
            class="icon-btn"
            :aria-label="
              store.state.bookmarks.includes(lesson.id)
                ? '取消收藏知识点'
                : '收藏知识点'
            "
            @click="bookmark(lesson.id)"
          >
            <Icon
              name="Bookmark"
              :class="{ filled: store.state.bookmarks.includes(lesson.id) }"
            />
          </button>
        </div>
        <h1>{{ lesson.title }}</h1>
        <p class="article-lead">{{ lesson.summary }}</p>
        <div class="keyword-row">
          <span v-for="k in lesson.keywords" :key="k">{{ k }}</span>
        </div>
      </div>
      <div class="article-practice-links">
        <button class="text-link" @click="scrollToPractice">
          <Icon name="Play" :size="15" />运行本课示例</button
        ><button class="text-link" @click="practicePanel?.openExercises()">
          <Icon name="ListChecks" :size="15" />做
          {{ lesson.exercises.length }} 道随堂练习
        </button>
      </div>
      <div v-if="lesson.relatedLessonIds?.length" class="info-banner">
        <div>
          <strong>继续深入与迁移</strong>
          <div class="row wrap">
            <RouterLink
              v-for="id in lesson.relatedLessonIds"
              :key="id"
              :to="'/learn/' + id"
              class="text-link"
              >{{ lessonFor(id)?.title }}</RouterLink
            >
          </div>
        </div>
      </div>
      <section
        v-for="(section, i) in lesson.sections"
        :key="section.title"
        class="article-section"
      >
        <div class="article-section-title">
          <span>{{ String(i + 1).padStart(2, "0") }}</span>
          <h2>{{ section.title }}</h2>
        </div>
        <Markdown :content="section.content" />
      </section>
      <LessonPractice
        v-if="lesson.playground"
        ref="practicePanel"
        :key="lesson.id"
        :lesson="lesson"
        :initial-tab="route.query.practice"
      />
      <section v-if="lesson.code" class="article-section">
        <h2>实现示例</h2>
        <CodeBlock :code="lesson.code" />
        <p class="muted tiny">
          示例帮助说明机制，适用范围以本知识点的边界说明为准。
        </p>
      </section>
      <section class="article-section">
        <h2>用问题检验理解</h2>
        <div class="related-questions">
          <RouterLink
            v-for="q in related"
            :key="q.id"
            :to="q.type === 'coding' ? '/labs/' + q.labId : '/practice/' + q.id"
            ><span class="badge subtle">{{
              q.type === "choice"
                ? "单选"
                : q.type === "coding"
                  ? "手写"
                  : q.type === "scenario"
                    ? "场景"
                    : "问答"
            }}</span
            ><span
              ><small class="muted"
                >{{ q.pool === "transfer" ? "迁移训练" : "基础自测" }} · </small
              >{{ q.prompt }}</span
            ><Icon name="ArrowUpRight" :size="16"
          /></RouterLink>
        </div>
      </section>
      <section v-if="sourceLinks.length" class="article-section source-links">
        <h2>继续查证与拓展</h2>
        <a
          v-for="s in sourceLinks"
          :key="s.id"
          :href="s.url"
          target="_blank"
          rel="noopener noreferrer"
          ><Icon name="ExternalLink" :size="16" /><span
            >{{ s.title }}<small>{{ s.scope }}</small></span
          ></a
        >
        <p class="muted tiny">
          来源状态与核对范围见“资料来源与数据”。平台规则按目标版本复核。
        </p>
      </section>
      <NoteEditor :target-id="lesson.id" />
      <div class="article-complete">
        <div>
          <strong>{{
            store.state.progress[lesson.id]?.status === "done"
              ? "这一篇，已经走过一遍。"
              : "能独立讲清原理和边界了吗？"
          }}</strong>
          <p class="muted tiny">
            阅读完成不等于掌握，试着先回答上面的关联问题。
          </p>
        </div>
        <button
          class="btn primary"
          @click="
            setStatus(
              store.state.progress[lesson.id]?.status === 'done'
                ? 'learning'
                : 'done',
            )
          "
        >
          <Icon
            :name="
              store.state.progress[lesson.id]?.status === 'done'
                ? 'RotateCcw'
                : 'Check'
            "
            :size="17"
          />{{
            store.state.progress[lesson.id]?.status === "done"
              ? "重新学习"
              : "标记完成"
          }}
        </button>
      </div>
      <RouterLink v-if="next" :to="'/learn/' + next.id" class="next-lesson"
        ><span
          >下一篇 <strong>{{ next.title }}</strong></span
        ><Icon name="ArrowRight" :size="20"
      /></RouterLink>
    </article>
  </div>
  <div v-else class="empty-state">
    <h1>知识点不存在</h1>
    <RouterLink to="/learn" class="btn">返回资料库</RouterLink>
  </div>
</template>
