<script setup>
import { computed } from "vue";
import Icon from "./Icon.vue";
import AppDisclosure from "./AppDisclosure.vue";
import { toast } from "../store.js";
const props = defineProps({ run: Object, detail: Object, detailError: String });
const finished = computed(() => props.run && props.run.status !== "running");
const passed = computed(
  () =>
    props.run?.status === "succeeded" &&
    (props.run.testFeature === "variants"
      ? props.run.result?.questions?.length === 1
      : props.run.result?.ok === true),
);
const failure = computed(() => props.run?.failure || props.detail?.failure);
const heading = computed(() =>
  passed.value
    ? props.run.testFeature === "variants"
      ? "举一反三测试通过"
      : "基础连接测试通过"
    : props.run?.errorCode === "AI_CANCELLED"
      ? "测试已取消"
      : props.run?.status === "pending"
        ? "测试中断，结果待核对"
        : "模型测试失败",
);
const notes = computed(() =>
  passed.value
    ? props.run.testFeature === "variants"
      ? "生成了 1 道题，已通过 JSON、字段、题数及重复检查。测试题未加入学习题库。"
      : '目标模型返回了有效的 {"ok":true}。基础连接通过不代表出题功能通过，请再执行举一反三测试。'
    : failure.value?.title ||
      props.run?.error ||
      "未取得有效测试结果，请查看诊断信息。",
);
const attempts = computed(() => props.detail?.attempts || []);
const diagnostic = computed(() =>
  JSON.stringify(
    {
      runId: props.run?.id,
      status: props.run?.status,
      testFeature: props.run?.testFeature,
      model: props.run?.model,
      durationMs: props.run?.durationMs,
      failure: failure.value,
      attempts: attempts.value.map((a) => ({
        number: a.number,
        model: a.actualModel || a.model,
        protocol: a.config?.protocol,
        format: a.config?.format,
        tokenParameter: a.config?.tokenParameter,
        outputLimit: a.outputLimit ?? a.config?.outputLimit,
        status: a.status,
        code: a.errorCode,
        httpStatus: a.upstreamStatus,
        upstreamCode: a.upstreamCode,
        requestId: a.requestId,
        finishReason: a.finishReason,
        networkCode: a.networkCode,
        providerError: a.providerError,
        validationIssues: a.validationIssues,
      })),
    },
    null,
    2,
  ),
);
async function copy() {
  try {
    await navigator.clipboard.writeText(diagnostic.value);
    toast("已复制诊断信息");
  } catch {
    toast("复制未完成，可展开诊断信息后手动复制");
  }
}
</script>
<template>
  <section
    v-if="finished"
    class="ai-model-test-result"
    :class="{ passed }"
    aria-label="模型测试结果"
  >
    <div class="ai-test-verdict" role="status">
      <Icon :name="passed ? 'CheckCircle2' : 'XCircle'" :size="23" />
      <h3>{{ heading }}</h3>
    </div>
    <p>{{ notes }}</p>
    <p v-if="!passed && failure?.suggestion">{{ failure.suggestion }}</p>
    <dl class="ai-test-facts">
      <div>
        <dt>实际模型</dt>
        <dd>{{ run.model || "未返回" }}</dd>
      </div>
      <div>
        <dt>耗时</dt>
        <dd>
          {{
            run.durationMs == null
              ? "未知"
              : (run.durationMs / 1000).toFixed(2) + " 秒"
          }}
        </dd>
      </div>
      <div v-if="failure?.httpStatus">
        <dt>上游 HTTP</dt>
        <dd>{{ failure.httpStatus }}</dd>
      </div>
      <div v-if="failure?.code">
        <dt>错误码</dt>
        <dd>{{ failure.code }}</dd>
      </div>
    </dl>
    <p class="tiny">
      调用编号：<code>{{ run.id }}</code>
    </p>
    <p v-if="detailError" class="tiny muted">
      诊断明细暂未加载：{{ detailError }}。可到后台调用记录按编号查看。
    </p>
    <AppDisclosure title="查看诊断与模型返回">
      <p v-if="!detail && !detailError" class="tiny muted">
        正在读取后台诊断信息…
      </p>
      <article v-for="a in attempts" :key="a.id" class="ai-test-attempt">
        <p>
          <strong
            >第 {{ a.number }} 次 · {{ a.providerName }} ·
            {{ a.actualModel || a.model }}</strong
          >
        </p>
        <p>
          协议 {{ a.config?.protocol }} · 输出模式 {{ a.config?.format }} ·
          输出上限 {{ a.outputLimit ?? a.config?.outputLimit }} Token
        </p>
        <p>
          结束原因 {{ a.finishReason || "未返回" }} · 请求 ID
          <code>{{ a.requestId || "未返回" }}</code>
        </p>
        <p v-if="a.upstreamStatus || a.upstreamCode">
          HTTP {{ a.upstreamStatus || "未知" }} · 服务商错误码
          {{ a.upstreamCode || "未返回" }}
        </p>
        <p v-if="a.networkCode">网络错误码：{{ a.networkCode }}</p>
        <p v-if="a.providerError" class="ai-test-provider-error">
          服务商返回：{{ a.providerError }}
        </p>
        <ul v-if="a.validationIssues?.length">
          <li v-for="(issue, i) in a.validationIssues" :key="i">
            字段 {{ issue.path || "(根对象)" }} ·
            {{ issue.message || issue.code }}
          </li>
        </ul>
        <AppDisclosure
          v-if="a.responseText"
          title="模型原始输出（仅管理员可见）"
        >
          <pre>{{ a.responseText }}</pre>
        </AppDisclosure>
      </article>
      <button class="btn small" @click="copy">
        <Icon name="Copy" :size="14" />复制诊断信息
      </button>
      <pre>{{ diagnostic }}</pre>
    </AppDisclosure>
  </section>
</template>
<style scoped>
.ai-model-test-result {
  border: 1px solid #e4c4bc;
  background: #fff7f4;
  border-radius: 10px;
  padding: 18px;
  margin: 18px 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ai-model-test-result.passed {
  border-color: #c4dccc;
  background: #f0f7f2;
}
.ai-test-verdict {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #a14036;
}
.passed .ai-test-verdict {
  color: #176b58;
}
.ai-test-verdict h3 {
  margin: 0;
  font-size: 17px;
}
.ai-model-test-result p,
.ai-model-test-result li {
  font-size: 13px;
  line-height: 1.85;
  margin: 10px 0;
}
.ai-test-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 26px;
  margin: 16px 0;
}
.ai-test-facts dt {
  font-size: 11px;
  color: #617467;
}
.ai-test-facts dd {
  margin: 3px 0 0;
  font-size: 13px;
  font-weight: 600;
}
.ai-test-attempt {
  border-top: 1px solid #dce5df;
  margin-top: 12px;
  padding-top: 8px;
}
.ai-model-test-result pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.7;
  background: #fff;
  border: 1px solid #dce5df;
  border-radius: 6px;
  padding: 12px;
  max-height: 320px;
  overflow: auto;
}
.ai-test-provider-error {
  white-space: pre-wrap;
}
@media (max-width: 600px) {
  .ai-model-test-result {
    padding: 14px;
  }
}
</style>
