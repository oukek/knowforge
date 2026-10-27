<script setup>
import { computed, ref, watch, useId } from "vue";
import { featureLabel } from "../ai.js";
import { dateLabel, toast } from "../store.js";
import {
  number,
  runState,
  billingState,
  awaitingCharge,
} from "./admin-call-display.js";
import Icon from "./Icon.vue";
import AppDisclosure from "./AppDisclosure.vue";
const props = defineProps({ run: Object });
const tab = ref("overview");
const tabId = useId();
function tabKey(event) {
  const order = ["overview", "attempts", "payload"];
  let index = order.indexOf(tab.value);
  if (event.key === "ArrowRight") index = (index + 1) % 3;
  else if (event.key === "ArrowLeft") index = (index + 2) % 3;
  else if (event.key === "Home") index = 0;
  else if (event.key === "End") index = 2;
  else return;
  event.preventDefault();
  tab.value = order[index];
  event.currentTarget.parentElement
    .querySelectorAll('[role="tab"]')
    [index].focus();
}
watch(
  () => props.run.id,
  () => {
    tab.value = "overview";
  },
);
const hasActions = computed(
  () =>
    props.run.billingStatus === "pending" ||
    (props.run.billingStatus === "settled" &&
      Number(props.run.chargedPoints) > 0) ||
    (props.run.attempts?.length && props.run.status !== "running"),
);
const cost = computed(() =>
  props.run.upstreamCostReview?.actualCostCny != null
    ? "¥" + number(props.run.upstreamCostReview.actualCostCny)
    : props.run.estimatedCostCny != null
      ? "¥" + number(props.run.estimatedCostCny)
      : "—",
);
const pretty = (value) => JSON.stringify(value, null, 2);
async function copyId() {
  try {
    await navigator.clipboard.writeText(props.run.id);
    toast("已复制调用编号");
  } catch {
    toast("复制未完成，请手动复制调用编号");
  }
}
</script>
<template>
  <div class="run-detail">
    <header class="run-hero">
      <span class="run-feature-icon"
        ><Icon
          :name="
            run.feature === 'interview'
              ? 'MessagesSquare'
              : run.feature === 'variants'
                ? 'Lightbulb'
                : run.feature === 'grade'
                  ? 'FileCheck2'
                  : 'Server'
          "
          :size="23"
      /></span>
      <div>
        <span class="run-feature-name"
          >{{ featureLabel[run.feature] || run.feature
          }}<template v-if="run.feature === 'test'">
            ·
            {{
              run.testFeature === "variants" ? "出题能力测试" : "基础连接"
            }}</template
          ></span
        >
        <h2>{{ run.context?.title || "服务配置与模型测试" }}</h2>
        <div class="run-id">
          <code>{{ run.id }}</code
          ><button class="run-copy" aria-label="复制调用编号" @click="copyId">
            <Icon name="Copy" :size="13" />
          </button>
        </div>
      </div>
      <div class="run-hero-status">
        <span class="run-badge" :data-tone="runState(run)[1]">{{
          runState(run)[0]
        }}</span
        ><span class="run-badge secondary" :data-tone="billingState(run)[1]">{{
          billingState(run)[0]
        }}</span>
      </div>
    </header>
    <dl class="run-facts">
      <div>
        <dt>发起账号</dt>
        <dd>
          <code>{{ run.userId }}</code>
        </dd>
      </div>
      <div>
        <dt>实际模型</dt>
        <dd>{{ run.actualModel || run.config?.model || "尚未返回" }}</dd>
      </div>
      <div>
        <dt>发起时间</dt>
        <dd>{{ dateLabel(run.createdAt) }}</dd>
      </div>
      <div>
        <dt>处理耗时</dt>
        <dd>
          {{
            run.durationMs == null
              ? "处理中或未记录"
              : (run.durationMs / 1000).toFixed(2) + " 秒"
          }}
        </dd>
      </div>
    </dl>
    <div class="run-tabs" role="tablist" aria-label="调用详情分区">
      <button
        v-for="[value, label] in [
          ['overview', '概览与核对'],
          ['attempts', '上游调用链'],
          ['payload', '请求与返回'],
        ]"
        :key="value"
        role="tab"
        :id="tabId + '-' + value"
        :aria-controls="tabId + '-panel-' + value"
        :aria-selected="tab === value"
        :tabindex="tab === value ? 0 : -1"
        :class="{ active: tab === value }"
        @click="tab = value"
        @keydown="tabKey"
      >
        {{ label
        }}<span v-if="value === 'attempts'">{{
          run.attempts?.length || 0
        }}</span>
      </button>
    </div>
    <section
      v-if="tab === 'overview'"
      class="run-tab-panel"
      role="tabpanel"
      :id="tabId + '-panel-overview'"
      :aria-labelledby="tabId + '-overview'"
      aria-label="概览与核对"
    >
      <div class="run-amounts">
        <article>
          <span>{{
            Number(run.refundedPoints) > 0 ? "原扣额度" : "用户实扣"
          }}</span
          ><strong
            >{{ awaitingCharge(run) ? "待结算" : number(run.chargedPoints)
            }}<small v-if="!awaitingCharge(run)">额度</small></strong
          >
          <p v-if="Number(run.refundedPoints) > 0">
            已冲正 {{ number(run.refundedPoints) }} 额度
          </p>
          <p v-else-if="run.billingMode === 'platform'">
            平台调试，不扣个人额度
          </p>
          <p v-else-if="run.billingMode === 'exempt'">
            免费资格 ·
            {{
              run.duePoints === null
                ? "应扣用量待核对"
                : "豁免 " + number(run.waivedPoints || 0)
            }}
          </p>
          <p v-else>成功交付后按实际用量结算</p>
        </article>
        <article>
          <span>本次预占</span
          ><strong>{{ number(run.reservedPoints) }}<small>额度</small></strong>
          <p>
            {{
              run.billingStatus === "pending"
                ? "用量待核对，暂时保留预占"
                : run.status === "running"
                  ? "任务完成后核销或释放"
                  : "这是任务发起时的预占金额"
            }}
          </p>
        </article>
        <article>
          <span>{{
            run.upstreamCostReview?.actualCostCny != null
              ? "已核对上游成本"
              : "预估上游成本"
          }}</span
          ><strong>{{ cost }}</strong>
          <p>
            {{
              run.upstreamCostReview?.actualCostCny != null
                ? "以管理员核对账单为准"
                : run.estimatedCostCny == null
                  ? "未配置采购价或未取得用量"
                  : run.costIncomplete
                    ? "部分尝试未能估价，待核对"
                    : "含失败重试，仅供账单核对"
            }}
          </p>
        </article>
      </div>
      <div v-if="run.error" class="run-notice danger">
        <Icon name="CircleAlert" :size="18" />
        <div>
          <strong>{{ run.failure?.title || run.error }}</strong>
          <p>
            {{
              run.failure?.suggestion ||
              "请查看上游调用链，确认本次失败的具体原因。"
            }}
          </p>
          <span
            >{{ run.errorCode || "AI_ERROR"
            }}{{
              run.failure?.httpStatus ? " · HTTP " + run.failure.httpStatus : ""
            }}</span
          ><button class="run-inline-link" @click="tab = 'attempts'">
            查看上游诊断<Icon name="ArrowRight" :size="13" />
          </button>
        </div>
      </div>
      <div
        v-if="run.billingNote || run.chargeCapped"
        class="run-notice warning"
      >
        <Icon name="Info" :size="18" />
        <div>
          <strong>{{
            run.chargeCapped ? "已按预占封顶，未向用户追加扣费" : "本次结算说明"
          }}</strong>
          <p>
            {{
              run.billingNote ||
              "服务商用量超过预占估算，请检查模型计量口径和费率。"
            }}
          </p>
        </div>
      </div>
      <section class="run-usage-panel">
        <div class="run-block-heading">
          <h3>本次结算用量</h3>
          <span>Token</span>
        </div>
        <dl class="run-token-grid">
          <div>
            <dt>输入</dt>
            <dd>{{ number(run.usage?.input) }}</dd>
          </div>
          <div>
            <dt>输出</dt>
            <dd>{{ number(run.usage?.output) }}</dd>
          </div>
          <div>
            <dt>缓存输入</dt>
            <dd>{{ number(run.usage?.cached) }}</dd>
          </div>
          <div>
            <dt>推理输出</dt>
            <dd>{{ number(run.usage?.reasoning) }}</dd>
          </div>
        </dl>
        <p>
          {{
            run.usage
              ? "缓存已包含在输入中，推理已包含在输出中；不重复计数。"
              : "尚未取得可确认的结算用量，不按零用量处理。"
          }}
        </p>
      </section>
      <section v-if="hasActions" class="run-actions">
        <div class="run-block-heading">
          <h3>费用核对与调整</h3>
          <span><Icon name="FileCheck2" :size="13" />操作将记录审计</span>
        </div>
        <slot name="actions" />
      </section>
    </section>
    <section
      v-else-if="tab === 'attempts'"
      class="run-tab-panel"
      role="tabpanel"
      :id="tabId + '-panel-attempts'"
      :aria-labelledby="tabId + '-attempts'"
      aria-label="上游调用链"
    >
      <div class="run-chain-heading">
        <div>
          <h3>{{ run.attempts?.length || 0 }} 次上游尝试</h3>
          <p>含自动切换与失败重试，上游消耗可能大于用户结算用量。</p>
        </div>
        <span v-if="run.failoverCount" class="run-badge" data-tone="warning"
          >自动切换 {{ run.failoverCount }} 次</span
        >
      </div>
      <div v-if="run.attempts?.length" class="run-chain-total">
        已知累计输入 <strong>{{ number(run.upstreamUsage?.input) }}</strong> /
        输出 <strong>{{ number(run.upstreamUsage?.output) }}</strong> Token
      </div>
      <div v-if="!run.attempts?.length" class="run-section-empty">
        <Icon name="Route" :size="26" />
        <p>本次任务尚未记录上游尝试。</p>
      </div>
      <ol class="run-attempt-list">
        <li v-for="a in run.attempts || []" :key="a.id">
          <span
            class="run-attempt-index"
            :class="{
              success: a.status === 'succeeded',
              failed: a.status === 'failed',
            }"
            ><Icon
              v-if="a.status === 'succeeded'"
              name="Check"
              :size="14"
            /><span v-else>{{ a.number }}</span></span
          >
          <article class="run-attempt-card">
            <header>
              <div>
                <span>{{ a.providerName }}</span>
                <h4>{{ a.actualModel || a.model }}</h4>
              </div>
              <span
                class="run-badge"
                :data-tone="
                  a.status === 'succeeded'
                    ? 'success'
                    : a.status === 'failed'
                      ? 'danger'
                      : 'progress'
                "
                >{{
                  a.status === "succeeded"
                    ? "有效结果"
                    : a.status === "failed"
                      ? "本次失败"
                      : "调用中或中断"
                }}</span
              >
            </header>
            <dl class="run-attempt-facts">
              <div>
                <dt>耗时</dt>
                <dd>
                  {{
                    a.durationMs == null
                      ? "—"
                      : (a.durationMs / 1000).toFixed(2) + " 秒"
                  }}
                </dd>
              </div>
              <div>
                <dt>结束原因</dt>
                <dd>{{ a.finishReason || "未返回" }}</dd>
              </div>
              <div>
                <dt>输出上限</dt>
                <dd>
                  {{ number(a.outputLimit ?? a.config?.outputLimit) }} Token
                </dd>
              </div>
              <div>
                <dt>请求 ID</dt>
                <dd>
                  <code>{{ a.requestId || "未返回" }}</code>
                </dd>
              </div>
            </dl>
            <p v-if="a.usage" class="run-attempt-usage">
              输入 {{ number(a.usage.input) }} · 输出
              {{ number(a.usage.output) }} · 缓存 {{ number(a.usage.cached) }} ·
              推理 {{ number(a.usage.reasoning) }} Token
            </p>
            <p v-else class="run-attempt-usage">
              {{
                a.noCharge
                  ? "上游明确拒绝或未发送，不结算"
                  : "上游用量未知，需核对服务商账单"
              }}
            </p>
            <div v-if="a.error" class="run-attempt-error">
              <strong>{{ a.error }}</strong>
              <p v-if="a.providerError">{{ a.providerError }}</p>
              <span
                >{{ a.errorCode
                }}{{ a.upstreamStatus ? " · HTTP " + a.upstreamStatus : ""
                }}{{ a.upstreamCode ? " · " + a.upstreamCode : "" }}</span
              ><span v-if="a.networkCode">网络错误码 {{ a.networkCode }}</span>
            </div>
            <ul v-if="a.validationIssues?.length" class="run-field-errors">
              <li v-for="(issue, i) in a.validationIssues" :key="i">
                <code>{{ issue.path || "(根对象)" }}</code
                ><span>{{ issue.message || issue.code }}</span>
              </li>
            </ul>
            <AppDisclosure v-if="a.responseText" title="查看本次模型原始输出">
              <pre class="run-json">{{ a.responseText }}</pre>
            </AppDisclosure>
          </article>
        </li>
      </ol>
    </section>
    <section
      v-else
      class="run-tab-panel run-payload"
      aria-label="请求与返回"
      role="tabpanel"
      :id="tabId + '-panel-payload'"
      :aria-labelledby="tabId + '-payload'"
    >
      <div class="run-chain-heading">
        <div>
          <h3>原始记录</h3>
          <p>按需展开消息、上下文和模型返回，用于排查与复核。</p>
        </div>
      </div>
      <dl class="run-payload-ids">
        <div>
          <dt>上游请求编号</dt>
          <dd>
            <code>{{ run.upstreamRequestId || "未返回" }}</code>
          </dd>
        </div>
        <div>
          <dt>提示模板版本</dt>
          <dd>
            <code>{{ run.templateVersion || "未记录" }}</code>
          </dd>
        </div>
      </dl>
      <AppDisclosure title="实际发送的消息与题目快照">
        <pre class="run-json">{{
          pretty({
            messages: run.messages,
            context: run.context,
            templateVersion: run.templateVersion,
          })
        }}</pre></AppDisclosure
      ><AppDisclosure title="模型返回内容与用量明细">
        <pre class="run-json">{{
          pretty({
            responseText: run.responseText,
            result: run.result,
            usage: run.usage,
            reconciliation: run.reconciliation,
            error: run.error,
            providerError: run.providerError,
          })
        }}</pre></AppDisclosure
      ><AppDisclosure title="每次上游尝试的完整记录">
        <pre class="run-json">{{ pretty(run.attempts || []) }}</pre>
      </AppDisclosure>
    </section>
  </div>
</template>
<style scoped>
.run-detail {
  color: #253b34;
  min-width: 0;
  --run-line: #e2e9e4;
  --run-muted: #7b8e82;
}
.run-hero {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  padding: 2px 0 20px;
}
.run-feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  background: #edf4ef;
  color: #37735a;
  border-radius: 11px;
  border: 1px solid #dce9e0;
}
.run-hero > div:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.run-feature-name {
  font-size: 11px;
  color: #78907f;
}
.run-hero h2 {
  font-size: 19px;
  margin: 5px 0 7px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  letter-spacing: -0.3px;
}
.run-id {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: #91a096;
}
.run-id code {
  overflow-wrap: anywhere;
}
.run-copy {
  color: #789586;
  display: flex;
  align-items: center;
  padding: 5px;
  flex-shrink: 0;
}
.run-hero-status {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 185px;
  margin-top: 3px;
}
.run-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  padding: 4px 9px;
  border-radius: 5px;
  color: #708277;
  background: #f0f3f1;
  width: fit-content;
  white-space: nowrap;
}
.run-badge[data-tone="success"] {
  color: #287450;
  background: #eaf4ed;
}
.run-badge[data-tone="progress"] {
  color: #54739c;
  background: #edf2fa;
}
.run-badge[data-tone="danger"] {
  color: #a15342;
  background: #fcefe9;
}
.run-badge[data-tone="warning"] {
  color: #997229;
  background: #faf1da;
}
.run-badge.secondary {
  border: 1px solid #e3eae5;
}
.run-facts {
  display: grid;
  grid-template-columns: 1.35fr 1.2fr 1fr 0.9fr;
  gap: 18px;
  margin: 0;
  padding: 17px 0;
  border-top: 1px solid var(--run-line);
}
.run-facts div {
  min-width: 0;
}
.run-facts dt,
.run-attempt-facts dt,
.run-payload-ids dt {
  color: #8c9c91;
  font-size: 10px;
  margin-bottom: 6px;
}
.run-facts dd,
.run-attempt-facts dd,
.run-payload-ids dd {
  margin: 0;
  font-size: 11px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.run-facts code {
  font-size: 10px;
}
.run-tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--run-line);
  margin: 4px 0 22px;
}
.run-tabs button {
  padding: 12px 0;
  border-bottom: 2px solid transparent;
  font-size: 12px;
  color: #7b8e82;
  display: flex;
  align-items: center;
  gap: 7px;
}
.run-tabs button.active {
  border-color: #176b58;
  color: #176b58;
  font-weight: 600;
}
.run-tabs button > span {
  font-size: 10px;
  background: #edf3ef;
  border-radius: 4px;
  padding: 0 5px;
}
.run-amounts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin-bottom: 20px;
}
.run-amounts article {
  padding: 17px;
  border: 1px solid var(--run-line);
  border-radius: 9px;
  background: #f9fbfa;
  min-width: 0;
}
.run-amounts article:first-child {
  background: #eff6f1;
  border-color: #d4e4da;
}
.run-amounts article > span {
  color: #6d8676;
  font-size: 11px;
}
.run-amounts strong {
  display: block;
  margin: 10px 0 7px;
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -0.6px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.run-amounts small {
  font-size: 10px;
  color: #7b8e82;
  margin-left: 5px;
  font-weight: 400;
  letter-spacing: 0;
}
.run-amounts p {
  font-size: 10px;
  color: #829689;
  line-height: 1.8;
  margin: 0;
}
.run-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 15px 17px;
  border-radius: 8px;
  margin: 14px 0;
  border: 1px solid #ebd6cd;
  background: #fff8f5;
  color: #9c5a47;
}
.run-notice > :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}
.run-notice > div {
  min-width: 0;
}
.run-notice strong {
  font-size: 12px;
}
.run-notice p {
  font-size: 11px;
  line-height: 1.9;
  margin: 5px 0 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.run-notice span {
  font-size: 10px;
  opacity: 0.8;
}
.run-notice.warning {
  background: #fffcf4;
  border-color: #eadfc0;
  color: #8e753f;
}
.run-inline-link {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #8c5b43;
  font-size: 11px;
  padding: 0;
  margin-top: 10px;
}
.run-block-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.run-block-heading h3 {
  font-size: 13px;
  margin: 0;
}
.run-block-heading > span {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #8b9c90;
  font-size: 10px;
}
.run-usage-panel {
  padding: 18px;
  border: 1px solid var(--run-line);
  border-radius: 9px;
  margin-top: 19px;
}
.run-token-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 15px;
  margin: 17px 0;
}
.run-token-grid dt {
  font-size: 10px;
  color: #829789;
}
.run-token-grid dd {
  font-variant-numeric: tabular-nums;
  font-size: 19px;
  margin: 6px 0 0;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.run-usage-panel > p {
  margin: 0;
  font-size: 10px;
  color: #8c9f92;
  line-height: 1.8;
}
.run-actions {
  margin-top: 24px;
}
.run-actions > .run-block-heading {
  margin-bottom: 13px;
}
.run-actions :deep(.call-review-card) {
  padding: 17px;
  background: #fffcf2;
  border: 1px solid #e9dcb9;
  border-radius: 9px;
  margin-top: 12px;
}
.run-actions :deep(h4) {
  font-size: 13px;
  margin: 0 0 7px;
}
.run-actions :deep(p) {
  font-size: 11px;
  line-height: 1.9;
  color: #7f8d80;
  margin: 7px 0 14px;
}
.run-actions :deep(.call-action-disclosure) {
  border: 1px solid var(--run-line);
  border-radius: 8px;
  padding: 11px 16px;
  margin-top: 10px;
  background: #fff;
}
.run-actions :deep(.app-disclosure-trigger) {
  font-size: 12px;
}
.run-actions :deep(.call-action-fields) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;
  margin: 14px 0;
}
.run-actions :deep(label) {
  display: grid;
  gap: 6px;
  font-size: 11px;
  color: #66816e;
}
.run-actions :deep(.call-action-fields .app-field) {
  width: 100%;
  min-width: 0;
}
.run-actions :deep(.call-action-fields .app-field-control) {
  font-size: 12px;
}
.run-actions :deep(.call-action-wide) {
  grid-column: 1/-1;
}
.run-actions :deep(.call-action-footer) {
  display: flex;
  justify-content: flex-end;
}
.run-actions :deep(.call-action-footer .btn) {
  font-size: 12px;
}
.run-actions :deep(.call-reviewed) {
  background: #f2f7f3;
  border: 1px solid #dae8de;
  padding: 15px 17px;
  border-radius: 8px;
  margin-top: 12px;
}
.run-actions :deep(.call-reviewed strong) {
  font-size: 12px;
  color: #367255;
}
.run-actions :deep(.call-reviewed p) {
  margin-bottom: 0;
}
.run-chain-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.run-chain-heading h3 {
  font-size: 14px;
  margin: 0;
}
.run-chain-heading p {
  font-size: 11px;
  color: var(--run-muted);
  margin: 7px 0 0;
  line-height: 1.8;
}
.run-chain-total {
  padding: 11px 14px;
  border: 1px solid #e2eae5;
  border-radius: 6px;
  background: #f6f9f7;
  font-size: 11px;
  color: #789181;
  margin: 15px 0 20px;
}
.run-chain-total strong {
  color: #3b634b;
  font-weight: 500;
}
.run-attempt-list {
  list-style: none;
  padding: 0 0 0 30px;
  margin: 20px 0 0;
}
.run-attempt-list > li {
  position: relative;
  padding-bottom: 16px;
}
.run-attempt-list > li:not(:last-child)::before {
  content: "";
  position: absolute;
  left: -19px;
  top: 30px;
  bottom: -4px;
  width: 1px;
  background: #dce7df;
}
.run-attempt-index {
  position: absolute;
  left: -30px;
  top: 16px;
  width: 23px;
  height: 23px;
  border-radius: 50%;
  border: 1px solid #d9e3dc;
  background: #f3f6f4;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #79917f;
  font-size: 10px;
}
.run-attempt-index.success {
  background: #eaf4ed;
  color: #39875d;
  border-color: #d0e4d6;
}
.run-attempt-index.failed {
  background: #fcf0e9;
  color: #b77a5f;
  border-color: #ebd7c8;
}
.run-attempt-card {
  border: 1px solid var(--run-line);
  border-radius: 9px;
  padding: 16px 18px;
}
.run-attempt-card > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.run-attempt-card > header > div {
  min-width: 0;
}
.run-attempt-card > header > div > span {
  font-size: 10px;
  color: #86a08c;
}
.run-attempt-card h4 {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.run-attempt-facts {
  display: grid;
  grid-template-columns: 0.7fr 0.9fr 0.8fr 1.6fr;
  gap: 12px;
  padding: 13px 0;
  margin: 13px 0 0;
  border-top: 1px solid #edf1ee;
}
.run-attempt-facts > div {
  min-width: 0;
}
.run-attempt-facts code {
  font-size: 10px;
}
.run-attempt-usage {
  color: #819488;
  font-size: 10px;
  margin: 2px 0 10px;
  line-height: 1.9;
}
.run-attempt-card :deep(.app-disclosure-trigger) {
  font-size: 11px;
  color: #6d8b77;
}
.run-attempt-error {
  border-left: 2px solid #d5a486;
  padding: 10px 12px;
  background: #fff9f5;
  margin: 12px 0;
  color: #a2644b;
  overflow-wrap: anywhere;
}
.run-attempt-error strong {
  font-size: 11px;
  font-weight: 500;
}
.run-attempt-error p {
  font-size: 11px;
  line-height: 1.8;
  margin: 6px 0;
  white-space: pre-wrap;
}
.run-attempt-error > span {
  display: block;
  font-size: 10px;
  margin-top: 5px;
  opacity: 0.8;
}
.run-field-errors {
  list-style: none;
  padding: 0;
  margin: 12px 0;
  border: 1px solid #eddccf;
  border-radius: 5px;
}
.run-field-errors li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 9px 11px;
  font-size: 10px;
  color: #ab785e;
  overflow-wrap: anywhere;
}
.run-field-errors li + li {
  border-top: 1px solid #f0e4dc;
}
.run-json {
  font:
    11px/1.9 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 14px;
  background: #f4f7f5;
  border: 1px solid #e1e9e3;
  border-radius: 7px;
  max-height: 390px;
  overflow: auto;
}
.run-payload > :deep(.app-disclosure) {
  border: 1px solid var(--run-line);
  border-radius: 8px;
  padding: 11px 16px;
  margin: 11px 0;
}
.run-payload :deep(.app-disclosure-trigger) {
  font-size: 12px;
}
.run-payload-ids {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 19px 0;
}
.run-section-empty {
  text-align: center;
  padding: 45px 20px;
  color: #91a396;
  font-size: 12px;
}
.run-section-empty :deep(svg) {
  margin-bottom: 8px;
}
@media (max-width: 700px) {
  .run-hero {
    flex-wrap: wrap;
    gap: 11px;
    padding-bottom: 15px;
  }
  .run-feature-icon {
    width: 37px;
    height: 37px;
    border-radius: 9px;
  }
  .run-feature-icon :deep(svg) {
    width: 19px;
  }
  .run-hero h2 {
    font-size: 16px;
  }
  .run-hero-status {
    flex-basis: 100%;
    max-width: none;
    justify-content: flex-start;
    margin: 0 0 0 48px;
  }
  .run-id {
    font-size: 9px;
  }
  .run-facts {
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .run-facts dd {
    font-size: 10px;
  }
  .run-tabs {
    gap: 0;
    justify-content: space-between;
    margin-bottom: 18px;
  }
  .run-tabs button {
    font-size: 11px;
    padding: 11px 0;
    gap: 4px;
  }
  .run-amounts {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .run-amounts article {
    padding: 14px;
  }
  .run-amounts article:last-child {
    grid-column: 1/-1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
  }
  .run-amounts article:last-child strong {
    text-align: right;
    margin: 0;
    font-size: 21px;
  }
  .run-amounts article:last-child p {
    grid-column: 1/-1;
    margin-top: 5px;
  }
  .run-amounts strong {
    font-size: 22px;
  }
  .run-token-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 17px;
  }
  .run-usage-panel {
    padding: 15px;
  }
  .run-notice {
    padding: 13px;
    gap: 8px;
  }
  .run-actions :deep(.call-action-fields) {
    grid-template-columns: 1fr;
  }
  .run-actions :deep(.call-action-wide) {
    grid-column: auto;
  }
  .run-actions :deep(.call-action-footer .btn) {
    width: 100%;
    justify-content: center;
  }
  .run-actions :deep(.call-review-card),
  .run-actions :deep(.call-action-disclosure) {
    padding: 13px;
  }
  .run-block-heading > span {
    font-size: 9px;
  }
  .run-attempt-list {
    padding-left: 23px;
  }
  .run-attempt-index {
    left: -24px;
    width: 19px;
    height: 19px;
  }
  .run-attempt-list > li:not(:last-child)::before {
    left: -15px;
  }
  .run-attempt-card {
    padding: 13px;
  }
  .run-attempt-card h4 {
    font-size: 12px;
  }
  .run-attempt-facts {
    grid-template-columns: 1fr 1fr;
    gap: 13px;
  }
  .run-chain-heading {
    align-items: flex-start;
  }
  .run-chain-heading .run-badge {
    font-size: 9px;
  }
  .run-payload-ids {
    grid-template-columns: 1fr;
  }
  .run-badge {
    font-size: 10px;
  }
}
</style>
