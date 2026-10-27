<script setup>
import { ref, watch } from "vue";
import { ai, useAiTask } from "../ai.js";
import { request, store } from "../store.js";
import AppSelect from "./AppSelect.vue";
import AppDisclosure from "./AppDisclosure.vue";
import Icon from "./Icon.vue";
import AiEvaluation from "./AiEvaluation.vue";
import AiRunMeta from "./AiRunMeta.vue";
import AiTaskProgress from "./AiTaskProgress.vue";
const props = defineProps({
  question: Object,
  lesson: Object,
  answer: { type: String, default: "" },
});
const { run, busy, error, connection, start, cancel, stop, resume } =
  useAiTask();
const count = ref(1),
  difficulty = ref("进阶"),
  direction = ref("改变约束");
let targetVersion = 0;
watch(
  () => props.question?.id || props.lesson?.id,
  async () => {
    const version = ++targetVersion;
    const userId = store.user?.id;
    stop();
    run.value = null;
    error.value = "";
    // Restore observation after navigating back or refreshing this question.
    const query = new URLSearchParams({ status: "running" });
    if (props.question?.id) query.set("questionId", props.question.id);
    else if (props.lesson?.id) query.set("lessonId", props.lesson.id);
    else return;
    try {
      const { rows } = await request("/ai/runs?" + query);
      if (
        version === targetVersion &&
        userId === store.user?.id &&
        !busy.value &&
        !run.value &&
        rows[0]
      )
        resume(rows[0].id);
    } catch {
      /* Recovery is optional; starting a new task still reports errors. */
    }
  },
  { immediate: true },
);
function grade() {
  return start("/ai/grade", {
    questionId: props.question.id,
    answer: props.answer,
  });
}
function variants() {
  return start("/ai/variants", {
    lessonId: props.question?.lessonId || props.lesson.id,
    ...(props.question ? { questionId: props.question.id } : {}),
    count: count.value,
    difficulty: difficulty.value,
    direction: direction.value,
  });
}
</script>
<template>
  <section class="ai-actions" aria-label="AI 学习辅助">
    <div class="section-line">
      <h3>
        <Icon name="Sparkles" :size="18" />{{
          question ? "针对这一题，再进一步" : "沿着这个知识点，继续练习"
        }}
      </h3>
      <RouterLink
        :to="
          question
            ? '/ai?questionId=' + question.id
            : '/ai?lessonId=' + lesson.id
        "
        class="text-link"
        >相关 AI 历史</RouterLink
      >
    </div>
    <p class="tiny muted" v-if="!ai.configured">
      管理员尚未配置 AI 服务。普通学习与自评可继续使用。
    </p>
    <p class="tiny muted" v-else>
      {{
        ai.account.exempt
          ? "免费资格生效，本次免扣个人额度"
          : "可用 " + ai.account.available + " 额度"
      }}。成功调用按用量结算；同一回答复用已有结果。
    </p>
    <p v-if="ai.reason" class="ai-error">{{ ai.reason }}</p>
    <div class="row wrap">
      <button
        v-if="question && !['choice', 'coding'].includes(question.type)"
        class="btn primary small"
        :disabled="
          busy ||
          !ai.available ||
          (!ai.account.exempt && ai.account.available <= 0) ||
          answer.trim().length < 10 ||
          answer.length > 3000
        "
        @click="grade"
      >
        <Icon name="Sparkles" :size="16" />{{
          busy && run?.feature === "grade" ? "后台评阅中…" : "AI 评阅我的回答"
        }}
      </button>
      <button
        class="btn small"
        :disabled="
          busy ||
          !ai.available ||
          (!ai.account.exempt && ai.account.available <= 0)
        "
        @click="variants"
      >
        <Icon name="Lightbulb" :size="16" />举一反三 · 生成题目
      </button>
      <button v-if="busy && run" class="text-btn" @click="cancel">
        取消本次调用
      </button>
    </div>
    <p
      v-if="question && !['choice', 'coding'].includes(question.type)"
      class="tiny muted"
    >
      AI 评阅需填写 10–3000 个字符；更长回答仍可使用原有自评。
    </p>
    <AppDisclosure title="调整举一反三的方向与难度"
      ><div class="ai-form-row">
        <AppSelect
          v-model="count"
          label="生成题数"
          :options="[1, 2, 3].map((value) => ({ value, label: value + ' 道' }))"
        />
        <AppSelect
          v-model="difficulty"
          label="生成题难度"
          :options="
            ['入门', '进阶', '挑战'].map((value) => ({ value, label: value }))
          "
        />
        <AppSelect
          v-model="direction"
          label="迁移方向"
          :options="
            ['改变约束', '故障排查', '反例分析', '方案比较'].map((value) => ({
              value,
              label: value,
            }))
          "
        /></div
    ></AppDisclosure>
    <AiTaskProgress :run="run" :busy="busy" :connection="connection" />
    <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    <AiRunMeta :run="run" />
    <AiEvaluation v-if="run?.feature === 'grade'" :value="run.result" />
    <div
      v-if="run?.feature === 'variants' && run.result"
      class="ai-generated-list"
    >
      <article v-for="q in run.result.questions" :key="q.id">
        <span class="badge subtle">AI 生成 · {{ q.difficulty }}</span>
        <h4>{{ q.prompt }}</h4>
        <RouterLink :to="'/practice/' + q.id" class="text-link"
          >开始作答 →</RouterLink
        >
      </article>
    </div>
  </section>
</template>
