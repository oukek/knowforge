<script setup>
import AppChoice from "./AppChoice.vue";
import AppField from "./AppField.vue";
import { ref, watch, computed } from "vue";
import {
  store,
  mutate,
  bookmark,
  ratingLabels,
  typeLabel,
  moduleFor,
  toast,
} from "../store";
import Icon from "./Icon.vue";
import Markdown from "./Markdown.vue";
import NoteEditor from "./NoteEditor.vue";
import InterviewContext from "./InterviewContext.vue";
import AiActions from "./AiActions.vue";
const props = defineProps({ question: Object, reviewMode: Boolean });
const emit = defineEmits(["graded"]);
const selected = ref(null),
  written = ref(""),
  revealed = ref(false),
  result = ref(null),
  busy = ref(false),
  checked = ref([]);
watch(
  () => props.question.id,
  () => {
    selected.value = null;
    written.value = "";
    revealed.value = false;
    result.value = null;
    checked.value = [];
  },
  { immediate: true },
);
const q = computed(() => props.question);
async function submit(selfRating) {
  if (busy.value) return;
  if (q.value.type === "choice" && selected.value === null) {
    toast("请先选择一个答案");
    return;
  }
  busy.value = true;
  const data = await mutate("/attempts/" + q.value.id, "POST", {
    answer: q.value.type === "choice" ? selected.value : written.value,
    ...(q.value.type !== "choice" ? { selfRating } : {}),
  });
  busy.value = false;
  if (data) {
    result.value = data.result;
    revealed.value = true;
    emit("graded");
  }
}
</script>
<template>
  <article class="question-panel">
    <div class="section-line">
      <div class="row wrap">
        <span class="badge">{{ typeLabel[q.type] }}</span
        ><span class="badge subtle">{{ q.priority }}</span
        ><span class="muted tiny">{{ moduleFor(q.moduleId)?.title }}</span>
      </div>
      <button
        class="icon-btn"
        :aria-label="
          store.state.bookmarks.includes(q.id) ? '取消收藏题目' : '收藏题目'
        "
        @click="bookmark(q.id)"
      >
        <Icon
          name="Bookmark"
          :class="{ filled: store.state.bookmarks.includes(q.id) }"
        />
      </button>
    </div>
    <h2 class="question-title">{{ q.prompt }}</h2>
    <InterviewContext
      v-if="q.origin?.kind === 'public-report-adapted'"
      :question="q"
    />
    <p v-if="q.provenance === 'ai-generated'" class="tiny muted">
      个人 AI 生成题 · 请结合关联资料复核答案与评分标准。
    </p>
    <template v-if="q.type === 'choice'"
      ><fieldset class="options">
        <legend class="sr-only">选择一个答案</legend>
        <AppChoice
          v-for="(option, i) in q.options"
          :key="i"
          class="option"
          :class="{
            selected: selected === i,
            correct: result && i === q.correct,
            incorrect: result && selected === i && i !== q.correct,
          }"
          type="radio"
          :name="q.id"
          :value="i"
          v-model="selected"
          :disabled="!!result"
          ><span class="option-letter">{{ String.fromCharCode(65 + i) }}</span
          ><span>{{ option }}</span
          ><Icon
            v-if="result && i === q.correct"
            name="CheckCircle2"
            :size="18"
        /></AppChoice>
      </fieldset>
      <button
        v-if="!result"
        class="btn primary"
        :disabled="busy || selected === null"
        @click="submit()"
      >
        {{ busy ? "提交中…" : "提交答案"
        }}<Icon name="ArrowRight" :size="16" /></button
    ></template>
    <template v-else
      ><label class="field-label" for="own-answer">先独立回答，再对照要点</label
      ><AppField
        multiline
        id="own-answer"
        v-model="written"
        rows="7"
        maxlength="30000"
        placeholder="用你自己的语言说明结论、机制、方案与边界。可以先口述再记录要点。"
      ></AppField
      ><button v-if="!revealed" class="btn primary" @click="revealed = true">
        <Icon name="Eye" :size="17" />展开参考答案
      </button></template
    >
    <div v-if="revealed" class="answer-area">
      <div
        class="answer-status"
        :class="{ success: result?.passed, danger: result && !result.passed }"
      >
        <Icon
          :name="
            result
              ? result.passed
                ? 'CheckCircle2'
                : 'CircleAlert'
              : 'BookOpen'
          "
          :size="20"
        /><strong>{{
          result
            ? q.type === "choice"
              ? result.passed
                ? "回答正确"
                : "这里值得再复习"
              : "已记录自评 · " + ratingLabels[result.rating]
            : "参考回答"
        }}</strong
        ><span v-if="result?.kind === 'objective'" class="tiny">自动判分</span
        ><span v-else class="tiny">开放题需自己判断</span>
      </div>
      <Markdown :content="q.answer" />
      <section v-if="q.followUps?.length" class="interview-followups">
        <h4>继续追问</h4>
        <ol>
          <li v-for="item in q.followUps" :key="item">{{ item }}</li>
        </ol>
      </section>
      <template v-if="q.type !== 'choice'"
        ><h4>对照评分要点</h4>
        <div class="rubric">
          <AppChoice
            v-for="(item, i) in q.rubric"
            :key="i"
            type="checkbox"
            v-model="checked"
            :value="i"
            ><span>{{ item }}</span></AppChoice
          >
        </div>
        <p class="muted tiny">
          勾选用于辅助自查，不进行语义自动打分。已覆盖 {{ checked.length }} /
          {{ q.rubric.length }} 项。
        </p>
        <div class="rating-grid">
          <button
            v-for="(label, i) in ratingLabels"
            :key="label"
            class="btn small"
            :class="{ 'chosen-rating': result?.rating === i }"
            :disabled="busy"
            @click="submit(i)"
          >
            {{ label }}
          </button>
        </div></template
      >
      <div v-if="result" class="subtle-box tiny">
        已保存记录并安排间隔复习。{{
          result.passed ? "独立掌握后将延长间隔。" : "薄弱题已加入复习队列。"
        }}
      </div>
    </div>
    <AiActions :question="q" :answer="written" />
    <div class="question-footer">
      <RouterLink :to="'/learn/' + q.lessonId" class="text-link"
        ><Icon name="BookOpen" :size="16" />回到关联知识点</RouterLink
      ><span class="muted tiny">根据知识点构造的练习题 · 非官方真题</span>
    </div>
    <NoteEditor :target-id="q.id" />
  </article>
</template>
