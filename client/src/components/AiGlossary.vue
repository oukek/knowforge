<script setup>
import { computed, ref, watch } from "vue";
import AppDisclosure from "./AppDisclosure.vue";
import AppField from "./AppField.vue";
import AppSelect from "./AppSelect.vue";
import Icon from "./Icon.vue";
const props = defineProps({
  items: { type: Array, default: () => [] },
  lessonCount: { type: Number, default: 0 },
});
const query = ref(""),
  category = ref(""),
  limit = ref(12);
const categories = computed(() => [
  ...new Set(props.items.map((x) => x.category)),
]);
const filtered = computed(() =>
  props.items.filter(
    (x) =>
      (!category.value || x.category === category.value) &&
      [x.term, x.chinese, x.definition, x.distinction]
        .join(" ")
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
  ),
);
watch([query, category], () => (limit.value = 12));
</script>
<template>
  <section class="ai-foundation-guide">
    <div class="section-line">
      <div>
        <div class="eyebrow">AI FROM ZERO</div>
        <h2>先建立概念，再读深入专题。</h2>
      </div>
      <span class="badge subtle">{{ lessonCount }} 节系统基础</span>
    </div>
    <p>
      建议按课程顺序学习：概念地图 → 模型机制 → 训练与推理 → AI 应用与 RAG →
      工具与 Agent → 评估。每课都有可运行实验和随堂验证。
    </p>
    <div class="row wrap foundation-links">
      <RouterLink class="text-btn" to="/learn/ai-concept-map"
        ><Icon name="BookOpen" :size="16" />从第一课开始</RouterLink
      >
      <RouterLink class="text-btn" to="/practice?module=aibasics"
        ><Icon name="ListChecks" :size="16" />练 AI 基础迁移题</RouterLink
      >
      <RouterLink class="text-btn" to="/learn?module=agents"
        ><Icon name="Workflow" :size="16" />继续 Agent 深入专题</RouterLink
      >
    </div>
    <AppDisclosure
      :title="`概念速查 · ${items.length} 个词条（中英文、辨析与关联课程）`"
    >
      <div class="glossary-filters">
        <AppField
          v-model="query"
          aria-label="搜索 AI 概念"
          placeholder="搜索 LLM、MCP、推理、向量…"
        />
        <AppSelect
          v-model="category"
          label="AI 概念分类"
          :options="[
            { value: '', label: '全部分类' },
            ...categories.map((value) => ({ value, label: value })),
          ]"
        />
        <span class="tiny muted" aria-live="polite"
          >{{ filtered.length }} 个词条</span
        >
      </div>
      <ul class="glossary-grid">
        <li
          v-for="term in filtered.slice(0, limit)"
          :key="term.id"
          class="glossary-card"
        >
          <span class="tiny muted">{{ term.category }}</span>
          <h3>
            {{ term.term }} <span>{{ term.chinese }}</span>
          </h3>
          <p>{{ term.definition }}</p>
          <p class="glossary-distinction">辨析：{{ term.distinction }}</p>
          <RouterLink :to="'/learn/' + term.lessonId" class="text-link"
            >阅读完整讲解 <Icon name="ArrowRight" :size="14"
          /></RouterLink>
        </li>
      </ul>
      <p v-if="!filtered.length" class="muted">
        没有匹配的概念，试试缩写或中文名称。
      </p>
      <button
        v-if="filtered.length > limit"
        class="btn small"
        @click="limit += 12"
      >
        再显示 12 个词条
      </button>
    </AppDisclosure>
  </section>
</template>
<style>
.ai-foundation-guide {
  padding: 22px 24px;
  margin: 0 0 24px;
  border: 1px solid #d6e3d5;
  background: #f5f8f2;
  border-radius: 10px;
  min-width: 0;
}
.ai-foundation-guide h2 {
  font-size: 18px;
  margin: 3px 0 0;
}
.ai-foundation-guide > p {
  font-size: 12px;
  line-height: 1.9;
  color: #617465;
  margin: 12px 0;
}
.foundation-links {
  gap: 18px;
  margin-bottom: 15px;
}
.ai-foundation-guide .app-disclosure {
  border-top: 1px solid #dce6d9;
  padding-top: 12px;
}
.glossary-filters {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 14px 0;
}
.glossary-filters > .app-field {
  flex: 1;
  min-width: 180px;
}
.glossary-grid {
  list-style: none;
  padding: 0;
  margin: 0 0 15px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.glossary-card {
  padding: 17px 18px;
  border: 1px solid #dce5d8;
  background: #fff;
  border-radius: 7px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.glossary-card h3 {
  font-size: 15px;
  margin: 7px 0 10px;
  line-height: 1.6;
}
.glossary-card h3 > span {
  font-size: 12px;
  font-weight: 500;
  color: #65816a;
  margin-left: 5px;
}
.glossary-card p {
  font-size: 12px;
  line-height: 1.85;
  margin: 0 0 10px;
}
.glossary-distinction {
  color: #657568;
}
.glossary-card .text-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}
@media (max-width: 767px) {
  .ai-foundation-guide {
    padding: 18px 16px;
  }
  .ai-foundation-guide > .section-line {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 10px;
  }
  .glossary-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .glossary-filters {
    align-items: stretch;
  }
  .glossary-filters > .app-field {
    flex-basis: 100%;
    min-width: 0;
  }
  .foundation-links {
    gap: 12px;
  }
  .ai-foundation-guide h2 {
    font-size: 17px;
  }
}
</style>
