<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import Icon from "./Icon.vue";
const props = defineProps({ run: Object, busy: Boolean, connection: String });
const active = computed(() => props.busy || props.run?.status === "running");
const clock = ref(Date.now()),
  submittedAt = ref(Date.now());
let timer;
watch(
  () => [active.value, props.run?.id],
  () => {
    clearInterval(timer);
    clock.value = Date.now();
    if (!props.run) submittedAt.value = clock.value;
    if (active.value)
      timer = setInterval(() => {
        clock.value = Date.now();
      }, 1000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(timer));
const phase = computed(
  () => props.run?.progress?.phase || (props.run ? "requesting" : "preparing"),
);
const stages = ["提交任务", "模型处理", "校验结果", "保存记录"];
const position = computed(
  () =>
    ({
      preparing: 0,
      requesting: 1,
      retrying: 1,
      validating: 2,
      saving: 3,
      cancelling: 1,
    })[phase.value] ?? 1,
);
const title = computed(
  () =>
    ({
      preparing: "正在准备学习任务",
      requesting:
        props.run?.feature === "variants"
          ? "AI 正在生成迁移练习"
          : props.run?.feature === "interview"
            ? "面试官正在评阅回答"
            : "AI 正在处理本次任务",
      retrying: "正在自动切换可用模型",
      validating: "正在检查结果格式与内容",
      saving: "正在保存结果与结算额度",
      cancelling: "正在取消调用并核对用量",
    })[phase.value] || "任务正在后台处理",
);
const hint = computed(
  () =>
    ({
      preparing: "确认题目与回答，并预占本次所需额度。",
      requesting:
        "正在请求模型并等待完整结果；离开页面后可从 AI 历史继续查看。",
      retrying: "本次尝试未完成，系统正在选择其他可用模型，请稍候。",
      validating: "检查输出是否完整、符合当前题目要求，再记录学习结果。",
      saving: "结果正在写入学习记录，实际消耗将显示在任务下方。",
      cancelling: "正在结束本次任务，结果与额度处理完成后会自动更新。",
    })[phase.value],
);
const elapsed = computed(() => {
  const start = Date.parse(props.run?.createdAt) || submittedAt.value;
  const seconds = Math.max(0, Math.floor((clock.value - start) / 1000));
  return seconds < 60
    ? `${seconds} 秒`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
});
const connectionText = computed(
  () =>
    ({
      live: "实时状态已连接",
      connecting: "正在连接实时状态…",
      reconnecting: "正在恢复实时连接…",
      polling: "实时连接恢复中，已改为定时更新状态",
      offline: "网络暂不可用，正在自动重连；任务仍保留在后台",
    })[props.connection] || "正在提交任务…",
);
</script>
<template>
  <section
    v-if="active"
    class="ai-task-progress"
    aria-label="AI 任务进度"
    aria-busy="true"
  >
    <div class="ai-task-progress-heading">
      <span class="ai-task-spinner" aria-hidden="true"
        ><Icon name="LoaderCircle" :size="21"
      /></span>
      <strong role="status">{{ title }}</strong>
      <span class="ai-task-elapsed" aria-hidden="true"
        >已等待 {{ elapsed }}</span
      >
    </div>
    <ol class="ai-task-stages" aria-label="处理阶段">
      <li
        v-for="(label, i) in stages"
        :key="label"
        :class="{ done: i < position, current: i === position }"
        :aria-current="i === position ? 'step' : undefined"
      >
        <span class="ai-task-stage-mark" aria-hidden="true"
          ><Icon v-if="i < position" name="Check" :size="12" /><span v-else>{{
            i + 1
          }}</span></span
        >{{ label }}
      </li>
    </ol>
    <p>{{ hint }}</p>
    <div class="ai-task-connection" role="status">
      <span :class="{ live: connection === 'live' }" aria-hidden="true"></span
      >{{ connectionText
      }}<span v-if="run?.progress?.attempt > 1" class="ai-task-attempt"
        >第 {{ run.progress.attempt }} 次尝试</span
      >
    </div>
  </section>
</template>
<style scoped>
.ai-task-progress {
  border: 1px solid #cdded5;
  border-radius: 10px;
  background: #f2f7f4;
  padding: 18px;
  margin: 18px 0;
  color: #253b34;
  min-width: 0;
}
.ai-task-progress-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ai-task-progress-heading strong {
  font-size: 14px;
  line-height: 1.7;
}
.ai-task-spinner {
  color: #176b58;
  display: flex;
  animation: ai-task-spin 1.25s linear infinite;
}
.ai-task-elapsed {
  font-size: 12px;
  color: #617467;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.ai-task-stages {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 0;
  list-style: none;
  margin: 18px 0 14px;
  gap: 8px;
}
.ai-task-stages li {
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 3px solid #dce6df;
  padding-top: 9px;
  color: #75867c;
  font-size: 12px;
}
.ai-task-stages li.current {
  border-color: #176b58;
  color: #176b58;
  font-weight: 600;
}
.ai-task-stages li.done {
  border-color: #9ab9a8;
  color: #496d5b;
}
.ai-task-stage-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid #cdded5;
  border-radius: 50%;
  flex-shrink: 0;
  font-size: 10px;
}
.current .ai-task-stage-mark {
  background: #176b58;
  border-color: #176b58;
  color: #fff;
}
.ai-task-progress p {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.8;
  color: #617467;
}
.ai-task-connection {
  display: flex;
  gap: 7px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11px;
  color: #617467;
}
.ai-task-connection > span:first-child {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b28d4a;
  flex-shrink: 0;
}
.ai-task-connection > span.live:first-child {
  background: #176b58;
}
.ai-task-attempt {
  margin-left: auto;
}
@keyframes ai-task-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 480px) {
  .ai-task-progress {
    padding: 14px;
  }
  .ai-task-elapsed {
    flex-basis: 100%;
    margin-left: 31px;
  }
  .ai-task-stages {
    gap: 5px;
  }
  .ai-task-stages li {
    font-size: 11px;
    gap: 4px;
    flex-wrap: wrap;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ai-task-spinner {
    animation: none;
  }
}
</style>
