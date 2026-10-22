<script setup>
import AppDatePicker from "../components/AppDatePicker.vue";
import AppSelect from "../components/AppSelect.vue";
import { ref, computed } from "vue";
import {
  store,
  lessons,
  modules,
  doneCount,
  mutate,
  localDay,
  toast,
  moduleFor,
} from "../store";
import Icon from "../components/Icon.vue";
const dailyMinutes = ref(store.state.settings.dailyMinutes || 45),
  planDays = ref(store.state.settings.planDays || 21),
  startDate = ref(store.state.settings.startDate || localDay()),
  selected = ref(0),
  trackId = ref(store.state.settings.trackId || "all"),
  busy = ref(false);
const ordered = computed(() => {
  const track = store.catalog.tracks.find((t) => t.id === trackId.value);
  const priority = track?.moduleIds ?? modules.value.map((m) => m.id);
  return lessons.value
    .filter((l) => priority.includes(l.moduleId))
    .sort(
      (a, b) =>
        priority.indexOf(a.moduleId) - priority.indexOf(b.moduleId) ||
        a.order - b.order,
    );
});
const allocation = computed(() => {
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate.value)
    ? startDate.value
    : localDay();
  const slots = Array.from({ length: planDays.value }, (_, i) => {
    const date = new Date(validStart + "T00:00:00+08:00");
    date.setUTCDate(date.getUTCDate() + i);
    return { day: i + 1, date: localDay(date), lessons: [], minutes: 0 };
  });
  const backlog = [];
  let day = 0;
  for (const l of ordered.value) {
    if (
      day < slots.length &&
      slots[day].minutes + l.estimatedMinutes > dailyMinutes.value - 10 &&
      slots[day].lessons.length
    )
      day++;
    if (day >= slots.length) {
      backlog.push(l);
      continue;
    }
    slots[day].lessons.push(l);
    slots[day].minutes += l.estimatedMinutes;
  }
  return { slots, backlog };
});
const schedule = computed(() => allocation.value.slots);
const current = computed(
  () => schedule.value[Math.min(selected.value, schedule.value.length - 1)],
);
const totalMinutes = computed(() =>
  ordered.value.reduce((s, l) => s + l.estimatedMinutes, 0),
);
const capacity = computed(() => dailyMinutes.value * planDays.value);
const overflow = computed(() => allocation.value.backlog.length > 0);
async function save() {
  busy.value = true;
  const data = await mutate("/settings", "PUT", {
    dailyMinutes: dailyMinutes.value,
    planDays: planDays.value,
    startDate: startDate.value,
    trackId: trackId.value,
  });
  busy.value = false;
  if (data) toast("学习计划已保存");
}
</script>
<template>
  <div class="page-enter">
    <div class="page-heading">
      <div>
        <div class="eyebrow">YOUR STUDY RHYTHM</div>
        <h1>认真安排，也允许调整。</h1>
        <p>
          以知识点和练习产出安排进度。计划是时间估计，真实掌握需要独立检验。
        </p>
      </div>
      <span class="badge">已完成 {{ doneCount }} / {{ lessons.length }}</span>
    </div>
    <section class="plan-settings">
      <div>
        <label class="field-label" for="plan-track">学习主线</label
        ><AppSelect
          id="plan-track"
          v-model="trackId"
          label="学习主线"
          :options="[
            { value: 'all', label: '全部专题' },
            ...store.catalog.tracks.map((track) => ({
              value: track.id,
              label: track.title,
            })),
          ]"
          @change="selected = 0"
        />
      </div>
      <div>
        <label class="field-label" for="daily-time">每日可用时间</label
        ><AppSelect
          id="daily-time"
          v-model="dailyMinutes"
          label="每日可用时间"
          :options="
            [30, 45, 60, 90, 120].map((value) => ({
              value,
              label: `${value} 分钟`,
            }))
          "
        />
      </div>
      <div>
        <label class="field-label" for="plan-days">计划周期</label
        ><AppSelect
          id="plan-days"
          v-model="planDays"
          label="计划周期"
          :options="
            [7, 14, 21, 30].map((value) => ({
              value,
              label: value === 7 ? '7 天 · 聚焦复习' : `${value} 天`,
            }))
          "
          @change="selected = 0"
        />
      </div>
      <div>
        <label class="field-label" for="start-date">开始日期</label
        ><AppDatePicker id="start-date" v-model="startDate" label="开始日期" />
      </div>
      <button class="btn primary" @click="save" :disabled="busy || !startDate">
        {{ busy ? "保存中…" : "保存计划" }}
      </button>
    </section>
    <div class="info-banner" :class="{ warning: overflow }">
      <Icon :name="overflow ? 'CircleAlert' : 'Info'" :size="21" />
      <p v-if="overflow">
        当前主线预估研读 {{ totalMinutes }} 分钟，另需练习与复习。当前周期安排
        {{ ordered.length - allocation.backlog.length }} 篇，另有
        {{ allocation.backlog.length }}
        篇待续排。建议延长周期或增加每日时间，避免把未完成内容堆到最后一天。
      </p>
      <p v-else>
        每天预留 10
        分钟给到期复习与手写；表内时间为研读估计。模拟面试、深入源码和项目准备需要另外预留时间。
      </p>
    </div>
    <section v-if="allocation.backlog.length" class="plan-backlog">
      <strong>待下一周期继续 · {{ allocation.backlog.length }} 篇</strong>
      <p>
        从
        {{ allocation.backlog[0].title }}
        继续。当前按所选学习主线编排；可切换 Python、AI
        应用或其他方向，下一周期继续待排内容。
      </p>
    </section>
    <div class="plan-layout">
      <aside class="plan-calendar">
        <button
          v-for="(day, i) in schedule"
          :key="i"
          :class="{
            current: selected === i,
            complete:
              day.lessons.length &&
              day.lessons.every(
                (l) => store.state.progress[l.id]?.status === 'done',
              ),
          }"
          @click="selected = i"
        >
          <span>DAY {{ String(day.day).padStart(2, "0") }}</span
          ><strong>{{ day.date.slice(5).replace("-", " / ") }}</strong
          ><small
            >{{
              day.lessons.filter(
                (l) => store.state.progress[l.id]?.status === "done",
              ).length
            }}
            / {{ day.lessons.length }} 篇</small
          >
        </button>
      </aside>
      <section class="plan-detail">
        <div class="section-line">
          <div>
            <span class="eyebrow">DAY {{ current.day }}</span>
            <h2>
              {{
                current.lessons.length
                  ? "今天，把这些知识点串起来。"
                  : "留一些空间，回顾与演练。"
              }}
            </h2>
            <p class="muted">
              {{ current.date }} · 预估研读
              {{ current.minutes }} 分钟，另预留复习时间
            </p>
          </div>
        </div>
        <div class="plan-tasks">
          <RouterLink
            v-for="l in current.lessons"
            :key="l.id"
            :to="'/learn/' + l.id"
            ><span
              class="task-check"
              :class="{ done: store.state.progress[l.id]?.status === 'done' }"
              ><Icon
                v-if="store.state.progress[l.id]?.status === 'done'"
                name="Check"
                :size="14"
            /></span>
            <div>
              <strong>{{ l.title }}</strong
              ><small
                >{{ moduleFor(l.moduleId)?.title }} · {{ l.priority }} ·
                {{ l.estimatedMinutes }} 分钟</small
              >
            </div>
            <Icon name="ChevronRight" :size="17"
          /></RouterLink>
        </div>
        <div class="plan-review-task">
          <Icon name="RotateCcw" :size="22" />
          <div>
            <strong>再花 10 分钟，主动回忆</strong>
            <p>复习到期题，口述一个原理，或重新写一次今天的核心实现。</p>
          </div>
          <RouterLink to="/review" class="text-link"
            >去复习<Icon name="ArrowRight" :size="16"
          /></RouterLink>
        </div>
        <div class="plan-tip">
          <Icon name="Lightbulb" :size="18" />
          <p>
            如果时间有限：优先 JS
            异步、网络安全、小程序机制和你真实项目中的薄弱项。AI
            和跨端按岗位与简历需要取舍。
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
