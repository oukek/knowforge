<script setup>
import { computed } from "vue";
import { store } from "../store";
import AppDisclosure from "./AppDisclosure.vue";
import Icon from "./Icon.vue";
const props = defineProps({ question: Object });
const sources = computed(() =>
  props.question.origin.sourceIds
    .map((id) => store.catalog.sources.find((s) => s.id === id))
    .filter(Boolean),
);
const technical = computed(() =>
  (props.question.technicalSourceIds ?? [])
    .map((id) => store.catalog.sources.find((s) => s.id === id))
    .filter(Boolean),
);
const types = {
  "candidate-recollection": "候选人自述",
  "community-roundup": "社区汇总 / 解读",
  "edited-recollection": "经编辑润色的面经",
};
function dates(source) {
  const sorted = [...(source.interviewDates ?? [])].sort();
  return sorted.length
    ? sorted.length === 1
      ? sorted[0]
      : `${sorted[0]} 至 ${sorted.at(-1)}（来源内多轮记录）`
    : "未核实完整面试日期";
}
</script>
<template>
  <aside class="interview-context" aria-label="公开面经来源说明">
    <div class="row wrap">
      <span class="badge">{{ question.company }}</span
      ><span class="badge subtle">公开面经考点改编</span>
    </div>
    <p>{{ question.origin.adaptation }}</p>
    <AppDisclosure title="查看出处、日期与证据边界">
      <article
        v-for="source in sources"
        :key="source.id"
        class="interview-source"
      >
        <a :href="source.url" target="_blank" rel="noopener noreferrer"
          >{{ source.title }} <Icon name="ArrowUpRight" :size="14"
        /></a>
        <p>{{ types[source.sourceType] || "公开资料" }} · {{ source.role }}</p>
        <p>
          来源内面试日期：{{ dates(source) }}<br />发布日期：{{
            source.publishedAt || "页面未明确给出完整日期"
          }}
          · 核对公开内容：{{ source.checkedAt }}
        </p>
        <p>
          {{ source.dateNote
          }}<span v-if="source.visibility === 'public-excerpt'">
            仅采用公开可见部分。</span
          >
        </p>
      </article>
      <p class="interview-boundary">
        公司归属与经历为发布者自述或汇总，未经公司确认；本项目不据有限来源推断“高频”或命中率。
      </p>
      <div v-if="technical.length" class="row wrap interview-technical">
        <span>答案技术参考：</span
        ><a
          v-for="source in technical"
          :key="source.id"
          :href="source.url"
          target="_blank"
          rel="noopener noreferrer"
          >{{ source.title }}</a
        >
      </div>
    </AppDisclosure>
  </aside>
</template>
<style>
.interview-context {
  border: 1px solid #d9e3d4;
  background: #f4f7f0;
  padding: 16px 18px;
  border-radius: 8px;
  margin: 16px 0 22px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.interview-context > p,
.interview-source p,
.interview-boundary {
  font-size: 11px;
  line-height: 1.9;
  color: #657565;
  margin: 10px 0;
}
.interview-context .app-disclosure-trigger {
  font-size: 12px;
  color: #365d42;
}
.interview-source {
  padding: 12px 0;
  border-top: 1px solid #dce5d8;
}
.interview-source > a {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  color: #365d42;
  font-size: 12px;
  font-weight: 600;
  text-decoration: underline;
}
.interview-technical {
  font-size: 11px;
  gap: 8px;
  line-height: 1.8;
}
.interview-technical a {
  color: #376446;
  text-decoration: underline;
}
.interview-followups {
  padding: 14px 18px;
  border-left: 3px solid #b5cbb5;
  background: #f4f7f1;
  margin: 18px 0;
}
.interview-followups h4 {
  margin: 0 0 10px;
}
.interview-followups li {
  font-size: 12px;
  line-height: 1.9;
  margin: 6px 0;
}
@media (max-width: 767px) {
  .interview-context {
    padding: 14px;
  }
  .interview-source > a {
    display: inline;
  }
}
</style>
