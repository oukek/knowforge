<script setup>
import { computed } from "vue";
import {
  store,
  modules,
  lessons,
  questions,
  doneCount,
  dueReviews,
  progressFor,
  localDay,
  moduleFor,
} from "../store";
import Icon from "../components/Icon.vue";
const stats = computed(() => {
  const attempts = store.state.attempts,
    objective = attempts.filter((x) => x.kind === "objective");
  return {
    practiced: new Set(attempts.map((x) => x.questionId)).size,
    accuracy: objective.length
      ? Math.round(
          (objective.filter((x) => x.passed).length / objective.length) * 100,
        )
      : null,
    objective: objective.length,
    labs: new Set(
      attempts
        .filter((x) => x.kind === "coding" && x.passed)
        .map((x) => x.questionId),
    ).size,
  };
});
const percent = computed(() =>
  Math.round((doneCount.value / lessons.value.length) * 100),
);
const nextLesson = computed(() => {
  const track = store.catalog.tracks.find(
    (t) => t.id === store.state.settings.trackId,
  );
  const candidates = track
    ? lessons.value.filter((l) => track.moduleIds.includes(l.moduleId))
    : lessons.value;
  return (
    candidates.find((l) => store.state.progress[l.id]?.status === "learning") ||
    candidates.find((l) => store.state.progress[l.id]?.status !== "done") ||
    candidates[0] ||
    lessons.value[0]
  );
});
const week = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = localDay(d);
    return {
      day: ["日", "一", "二", "三", "四", "五", "六"][d.getDay()],
      count: store.state.activity.find((x) => x.day === key)?.actions || 0,
      today: i === 6,
    };
  }),
);
const maxActivity = computed(() =>
  Math.max(5, ...week.value.map((x) => x.count)),
);
const focusModules = computed(() =>
  modules.value
    .filter((x) => ["python", "crawler", "restapi", "llmapp"].includes(x.id))
    .sort(
      (a, b) =>
        ["python", "crawler", "restapi", "llmapp"].indexOf(a.id) -
        ["python", "crawler", "restapi", "llmapp"].indexOf(b.id),
    ),
);
const recent = computed(() =>
  store.state.attempts.slice(0, 3).map((x) => ({
    ...x,
    question: questions.value.find((q) => q.id === x.questionId),
  })),
);
</script>
<template>
  <div class="dashboard page-enter">
    <div class="page-heading">
      <div>
        <div class="eyebrow">TODAY'S LEARNING</div>
        <h1>把知识连起来，把问题想明白。</h1>
        <p>
          从前端到 Python、数据采集与 AI
          应用，用代码和问题建立完整工程知识体系。
        </p>
      </div>
      <RouterLink to="/plan" class="btn"
        ><Icon name="CalendarDays" :size="17" />我的学习计划</RouterLink
      >
    </div>
    <section class="dashboard-top">
      <div class="study-hero">
        <div class="hero-copy">
          <span class="hero-kicker"
            ><span class="status-dot"></span>全栈与 AI · 系统研习路径</span
          >
          <h2>理解机制。<br /><span>写出边界。</span></h2>
          <p>
            围绕 Python、API、AI 与前端工程，<br />把“看过了”变成“讲得清、写得出”。
          </p>
          <RouterLink :to="'/learn/' + nextLesson.id" class="btn primary"
            >{{ doneCount ? "继续研习" : "开始第一课"
            }}<Icon name="ArrowRight" :size="18"
          /></RouterLink>
          <div class="hero-resume">
            <span>本次推荐</span> {{ nextLesson.title }}
          </div>
        </div>
        <div class="mechanism-visual" aria-hidden="true">
          <div class="visual-label">THE LEARNING LOOP</div>
          <div class="loop-node node-read">
            <Icon name="BookOpen" :size="23" />
            <div><strong>理解</strong><small>UNDERSTAND</small></div>
            <span>01</span>
          </div>
          <div class="loop-wire wire-one"></div>
          <div class="loop-node node-code">
            <Icon name="SquareTerminal" :size="23" />
            <div><strong>实现</strong><small>IMPLEMENT</small></div>
            <span>02</span>
          </div>
          <div class="loop-wire wire-two"></div>
          <div class="loop-node node-explain">
            <Icon name="MessagesSquare" :size="23" />
            <div><strong>解释</strong><small>EXPLAIN</small></div>
            <span>03</span>
          </div>
          <span class="visual-note">每一个结论，都值得一次验证。</span>
        </div>
      </div>
      <div class="today-card">
        <div class="section-line">
          <h3>你的学习进展</h3>
          <span class="badge subtle">真实记录</span>
        </div>
        <div class="progress-center">
          <div class="progress-ring" :style="{ '--progress': percent + '%' }">
            <div>
              <strong>{{ percent }}<small>%</small></strong
              ><span>知识点完成</span>
            </div>
          </div>
        </div>
        <div class="progress-caption">
          已完成 <strong>{{ doneCount }}</strong> /
          {{ lessons.length }} 篇知识讲解
        </div>
        <div class="today-actions">
          <RouterLink to="/review"
            ><span><Icon name="RotateCcw" :size="17" />今日到期复习</span
            ><strong
              >{{ dueReviews.length
              }}<Icon name="ChevronRight" :size="15" /></strong></RouterLink
          ><RouterLink to="/labs"
            ><span><Icon name="Code2" :size="17" />手写实验通过</span
            ><strong
              >{{ stats.labs
              }}<small>/ {{ store.catalog.labs.length }}</small></strong
            ></RouterLink
          >
        </div>
      </div>
    </section>
    <section class="stat-grid">
      <div class="stat-item">
        <span class="stat-icon green"><Icon name="LibraryBig" /></span>
        <div>
          <span>系统知识点</span
          ><strong>{{ lessons.length }}<small>篇</small></strong>
        </div>
        <span class="stat-hint">{{ modules.length }} 个专题</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon blue"><Icon name="ListChecks" /></span>
        <div>
          <span>面试练习题</span
          ><strong>{{ questions.length }}<small>道</small></strong>
        </div>
        <span class="stat-hint"
          >含 {{ store.catalog.labs.length }} 道代码题</span
        >
      </div>
      <div class="stat-item">
        <span class="stat-icon amber"><Icon name="CheckCheck" /></span>
        <div>
          <span>已练习题目</span
          ><strong>{{ stats.practiced }}<small>道</small></strong>
        </div>
        <span class="stat-hint">去重题目数</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon purple"><Icon name="Target" /></span>
        <div>
          <span>选择题正确率</span
          ><strong
            >{{ stats.accuracy === null ? "—" : stats.accuracy
            }}<small v-if="stats.accuracy !== null">%</small></strong
          >
        </div>
        <span class="stat-hint">{{
          stats.objective
            ? stats.objective + " 次客观作答"
            : "完成首次答题后统计"
        }}</span>
      </div>
    </section>
    <section class="dashboard-bottom">
      <div class="priority-section">
        <div class="section-line">
          <div>
            <h2>先攻克这些核心专题</h2>
            <p class="muted">优先打好地基，再拓展知识的宽度。</p>
          </div>
          <RouterLink to="/learn" class="text-link"
            >查看全部专题<Icon name="ArrowRight" :size="16"
          /></RouterLink>
        </div>
        <div class="focus-grid">
          <RouterLink
            v-for="m in focusModules"
            :key="m.id"
            :to="{ path: '/learn', query: { module: m.id } }"
            class="focus-card"
            ><div class="section-line">
              <span
                class="module-icon"
                :style="{ color: m.color, background: m.color + '12' }"
                ><Icon :name="m.icon" :size="23" /></span
              ><span class="priority-tag">核心 · {{ m.priority }}</span>
            </div>
            <h3>{{ m.title }}</h3>
            <p>{{ m.subtitle }}</p>
            <div class="card-meta">
              <span
                >{{ m.lessonCount }} 篇讲解 <i>·</i>
                {{ m.questionCount }} 道题</span
              ><Icon name="ArrowUpRight" :size="17" />
            </div>
            <div class="mini-progress">
              <span
                :style="{
                  width: (progressFor(m.id).done / m.lessonCount) * 100 + '%',
                  background: m.color,
                }"
              ></span></div
          ></RouterLink>
        </div>
      </div>
      <aside class="dashboard-right">
        <section class="activity-card">
          <div class="section-line">
            <h3>最近 7 天</h3>
            <span class="muted tiny">学习动作</span>
          </div>
          <div class="activity-bars">
            <div
              v-for="(d, i) in week"
              :key="i"
              class="activity-day"
              :aria-label="
                (d.today ? '今天' : d.day) + '：' + d.count + ' 次学习动作'
              "
              role="img"
            >
              <span class="activity-number">{{ d.count || "" }}</span>
              <div class="activity-track">
                <span
                  :class="{ today: d.today }"
                  :style="{
                    height: Math.max(3, (d.count / maxActivity) * 100) + '%',
                  }"
                ></span>
              </div>
              <small :class="{ today: d.today }">{{
                d.today ? "今" : d.day
              }}</small>
            </div>
          </div>
          <p class="tiny muted">完成知识点、作答和复习都会记录。</p>
        </section>
        <section class="quick-practice">
          <div class="row">
            <span class="quick-icon"><Icon name="Timer" :size="23" /></span>
            <h3>给自己一场真实演练</h3>
          </div>
          <p>限时作答，独立思考。<br />从复盘里发现下一步。</p>
          <RouterLink to="/mock" class="text-link"
            >进入模拟面试<Icon name="ArrowRight" :size="16"
          /></RouterLink>
        </section>
      </aside>
    </section>
    <section v-if="recent.length" class="recent-section">
      <div class="section-line">
        <h2>最近练习</h2>
        <RouterLink to="/review" class="text-link"
          >查看记录<Icon name="ArrowRight" :size="16"
        /></RouterLink>
      </div>
      <RouterLink
        v-for="r in recent"
        :key="r.id"
        :to="
          r.question?.type === 'coding'
            ? '/labs/' + r.question.labId
            : '/practice/' + r.questionId
        "
        class="recent-row"
        ><Icon
          :name="r.passed ? 'CheckCircle2' : 'CircleDot'"
          :class="r.passed ? 'green-text' : 'amber-text'"
          :size="18" /><span>{{ r.question?.prompt }}</span
        ><small>{{
          r.kind === "self" ? "开放题自评" : r.passed ? "已答对" : "待巩固"
        }}</small
        ><Icon name="ChevronRight" :size="16"
      /></RouterLink>
    </section>
    <div class="source-note">
      <Icon name="BadgeCheck" :size="18" />
      <p>
        资料有出处，判断有边界。已单独标注原材料中待核实的说法。<RouterLink
          to="/sources"
          >查看资料校正与来源 <span>↗</span></RouterLink
        >
      </p>
    </div>
  </div>
</template>
