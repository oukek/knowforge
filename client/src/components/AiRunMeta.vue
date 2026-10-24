<script setup>
import { aiStateLabel } from "../ai.js";
defineProps({ run: Object });
</script>
<template>
  <div v-if="run" class="ai-run-meta" aria-live="polite">
    <span v-if="run.reused" class="badge subtle">复用记录，本次不重复扣点</span>
    <span class="badge subtle">{{ aiStateLabel[run.status] }}</span>
    <span v-if="run.failoverCount">已自动切换 {{ run.failoverCount }} 次</span>
    <span v-if="run.usage"
      >输入 {{ run.usage.input }} / 输出 {{ run.usage.output }} Token</span
    >
    <span v-else
      >实际用量{{ run.status === "running" ? "等待返回" : "未知" }}</span
    >
    <span v-if="run.chargedPoints !== null && run.chargedPoints !== undefined"
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
    <p v-if="run.actualRates" class="tiny muted">
      本次模型费率／千 Token：输入 {{ run.actualRates.inputRate }} · 缓存
      {{ run.actualRates.cachedRate }} · 输出
      {{ run.actualRates.outputRate }} 额度
    </p>
    <p v-if="run.billingNote" class="tiny muted">{{ run.billingNote }}</p>
    <span v-if="run.usage && (run.usage.cached || run.usage.reasoning)"
      >其中缓存输入 {{ run.usage.cached }} / 推理输出
      {{ run.usage.reasoning }} Token</span
    >
    <RouterLink :to="'/ai?run=' + run.id" class="text-link"
      >完整记录</RouterLink
    >
    <p v-if="run.error" class="ai-error">{{ run.error }}</p>
  </div>
</template>
