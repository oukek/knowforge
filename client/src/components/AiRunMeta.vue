<script setup>
import { aiStateLabel } from "../ai.js";
defineProps({ run: Object });
</script>
<template>
  <div v-if="run" class="ai-run-meta" aria-live="polite">
    <span v-if="run.reused" class="badge subtle">复用记录，本次不重复扣点</span>
    <span class="badge subtle">{{ aiStateLabel[run.status] }}</span>
    <span v-if="run.failoverCount">已自动切换 {{ run.failoverCount }} 次</span>
    <span v-if="run.status === 'running' || run.billingStatus === 'pending'"
      >{{ run.billingStatus === "pending" ? "待核对，预占" : "预占" }}
      {{ run.reservedPoints }} 额度</span
    >
    <span
      v-else-if="run.chargedPoints !== null && run.chargedPoints !== undefined"
      >{{ run.reused ? "原记录消耗" : "消耗" }}
      {{ run.chargedPoints }} 额度</span
    >
    <span v-else>预占 {{ run.reservedPoints }} 额度</span>
    <span v-if="run.billingStatus === 'pending'" class="badge subtle"
      >额度待核对</span
    >
    <span v-if="run.billingMode === 'exempt'"
      >免费资格 ·
      {{
        run.duePoints === null
          ? "应扣用量待核对"
          : "本次免扣 " + (run.waivedPoints || 0) + " 额度"
      }}</span
    >
    <span v-if="run.billingMode === 'platform'">平台调试 · 不扣个人额度</span>
    <span v-if="run.refundedPoints">已冲正 {{ run.refundedPoints }} 额度</span>
    <p v-if="run.billingNote" class="tiny muted">{{ run.billingNote }}</p>
    <RouterLink :to="'/ai?run=' + run.id" class="text-link"
      >完整记录</RouterLink
    >
    <p v-if="run.error" class="ai-error">{{ run.error }}</p>
  </div>
</template>
