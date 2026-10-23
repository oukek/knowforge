<script setup>
defineProps({ value: Object });
</script>
<template>
  <section v-if="value" class="ai-evaluation" aria-label="AI 评阅结果">
    <div class="section-line">
      <h3>AI 评阅 · {{ value.score }} 分</h3>
      <span class="badge subtle">辅助评价</span>
    </div>
    <p>{{ value.summary }}</p>
    <p v-if="value.relevance === 'off_topic'" class="ai-error">
      回答偏离当前题目，请围绕题意重新作答。
    </p>
    <div class="ai-dimensions">
      <div v-for="item in value.dimensions" :key="item.name">
        <span>{{ item.name }}</span
        ><strong>{{ item.score }}</strong>
        <p>{{ item.note }}</p>
      </div>
    </div>
    <section
      v-for="[field, title] in [
        ['covered', '已覆盖'],
        ['missing', '待补充'],
        ['errors', '需要修正'],
        ['suggestions', '改进建议'],
      ]"
      :key="field"
    >
      <template v-if="value[field]?.length"
        ><h4>{{ title }}</h4>
        <ul>
          <li v-for="(item, i) in value[field]" :key="i">{{ item }}</li>
        </ul></template
      >
    </section>
    <section v-if="value.evidence?.length">
      <h4>回答中的依据</h4>
      <blockquote v-for="(item, i) in value.evidence" :key="i">
        {{ item }}
      </blockquote>
    </section>
    <p v-if="value.followUp"><strong>继续思考：</strong>{{ value.followUp }}</p>
    <p class="tiny muted">
      AI 可能遗漏合理解法，请结合课程和评分要点复核。分数保留 AI 评阅来源。
    </p>
  </section>
</template>
