<script setup>
import { computed } from "vue";
import { featureLabel, aiStateLabel } from "../ai.js";
import { dateLabel } from "../store.js";
import {
  number,
  shortId,
  runState,
  billingState,
  awaitingCharge,
  sumCredits,
} from "./admin-call-display.js";
import Icon from "./Icon.vue";
import AppSelect from "./AppSelect.vue";
import AppDisclosure from "./AppDisclosure.vue";
const props = defineProps({ history: Object, summary: Object, busy: Boolean });
const feature = defineModel("feature"),
  status = defineModel("status"),
  page = defineModel("page");
defineEmits(["detail"]);
const totals = computed(() => {
  const rows = props.summary.rows || [];
  return {
    calls: rows.reduce((sum, row) => sum + Number(row.calls || 0), 0),
    pending: rows.reduce((sum, row) => sum + Number(row.pending || 0), 0),
    credits: sumCredits(rows, "points"),
    waived: sumCredits(rows, "waivedPoints"),
  };
});
const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.history.total / 30)),
);
const features = computed(() => [
  { value: "", label: "全部功能" },
  ...Object.entries(featureLabel).map(([value, label]) => ({ value, label })),
]);
const states = computed(() => [
  { value: "", label: "全部状态" },
  ...Object.entries(aiStateLabel).map(([value, label]) => ({ value, label })),
]);
const auditLabels = {
  "ai.pool.save": "更新服务池",
  "ai.scheduling.save": "更新统一调用设置",
  "ai.config.save": "更新 AI 配置",
  "ai.reconcile": "人工核对结算",
  "ai.upstream.cost.review": "核对上游成本",
  "ai.account.block": "调整账号状态",
  "ai.credits.grant": "发放额度",
  "ai.credits.reverse": "冲正用户扣费",
  "credit.grant": "发放用户额度",
  "credit.revoke": "收回用户额度",
  "credit.reverse": "冲正用户扣费",
  "billing.settings": "调整调用预算",
  "billing.defaults": "初始化资源包配置",
  "ai.health.reset": "恢复服务商或模型",
  "product.draft": "保存资源包草稿",
  "product.publish": "发布资源包",
  "product.archive": "下架资源包",
  "pricing.simulation.save": "保存定价测算",
};
const pretty = (value) => {
  try {
    return JSON.stringify(
      typeof value === "string" ? JSON.parse(value) : value,
      null,
      2,
    );
  } catch {
    return String(value);
  }
};
function reset() {
  feature.value = "";
  status.value = "";
}
</script>
<template>
  <div class="call-history">
    <section class="call-overview" aria-label="近 24 小时调用概览">
      <div class="call-section-heading">
        <div>
          <h2>调用概览</h2>
          <p>查看调用规模、用户额度与待处理事项。</p>
        </div>
        <span class="call-period"
          ><Icon name="Clock3" :size="14" />近 24 小时</span
        >
      </div>
      <div class="call-metrics">
        <article>
          <span><Icon name="Activity" :size="16" />总调用</span
          ><strong>{{ number(totals.calls) }}<small>次</small></strong>
          <p>含评阅、出题、面试与调试</p>
        </article>
        <article>
          <span><Icon name="Layers3" :size="16" />用户净扣除</span
          ><strong>{{ number(totals.credits) }}<small>额度</small></strong>
          <p>已扣额度扣除冲正金额</p>
        </article>
        <article>
          <span><Icon name="BadgeCheck" :size="16" />免费豁免</span
          ><strong>{{ number(totals.waived) }}<small>额度</small></strong>
          <p>免费资格产生的应扣用量</p>
        </article>
        <article
          class="call-pending-metric"
          :class="{ attention: totals.pending > 0 }"
        >
          <span><Icon name="FileCheck2" :size="16" />额度待核对</span
          ><strong>{{ number(totals.pending) }}<small>条</small></strong
          ><button
            v-if="totals.pending"
            class="call-inline-link"
            :disabled="busy"
            @click="status = 'pending'"
          >
            查看待核对记录<Icon name="ArrowRight" :size="13" />
          </button>
          <p v-else>暂无等待核对的用户额度</p>
        </article>
      </div>
      <div
        v-if="summary.rows.length"
        class="call-feature-strip"
        aria-label="各功能近 24 小时调用次数"
      >
        <span>功能分布</span
        ><span v-for="item in summary.rows" :key="item.feature"
          >{{ featureLabel[item.feature] || item.feature
          }}<strong>{{ number(item.calls) }}</strong></span
        >
      </div>
    </section>

    <section class="call-ledger" aria-label="AI 调用记录">
      <header class="call-ledger-heading">
        <div>
          <h2>
            调用记录<span>{{ number(history.total) }} 条</span>
          </h2>
          <p>任务执行与用户结算分别标记，上游费用在详情中核对。</p>
        </div>
        <span v-if="busy" class="call-refreshing" role="status"
          ><Icon name="LoaderCircle" :size="14" />正在更新</span
        >
      </header>
      <div class="call-filters">
        <div>
          <AppSelect
            v-model="feature"
            label="后台功能筛选"
            :options="features"
          /><AppSelect
            v-model="status"
            label="后台调用状态"
            :options="states"
          />
        </div>
        <button
          v-if="feature || status"
          class="call-reset"
          :disabled="busy"
          @click="reset"
        >
          <Icon name="RotateCcw" :size="13" />重置筛选</button
        ><span v-else class="call-filter-hint">全部时间 · 最新优先</span>
      </div>
      <table v-if="history.rows.length" class="call-table">
        <caption class="call-sr-only">
          AI 任务、执行状态、模型用量、用户额度与发起时间
        </caption>
        <thead>
          <tr>
            <th scope="col">学习任务 / 用户</th>
            <th scope="col">执行 / 结算</th>
            <th scope="col">模型 / 用量</th>
            <th scope="col">用户额度</th>
            <th scope="col">发起时间</th>
            <th scope="col"><span class="call-sr-only">操作</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in history.rows"
            :key="item.id"
            :class="{ 'needs-review': item.billingStatus === 'pending' }"
          >
            <td class="call-task-cell">
              <span class="call-feature-label">{{
                featureLabel[item.feature] || item.feature
              }}</span
              ><button
                class="call-task-title"
                :disabled="busy"
                @click="$emit('detail', item.id)"
              >
                {{ item.title || "服务配置与模型测试" }}</button
              ><span class="call-user" :title="item.userId"
                ><Icon name="UserRound" :size="12" /><code>{{
                  shortId(item.userId)
                }}</code></span
              >
            </td>
            <td class="call-status-cell">
              <span class="call-badge" :data-tone="runState(item)[1]"
                ><span></span>{{ runState(item)[0] }}</span
              ><span
                class="call-settlement"
                :data-tone="billingState(item)[1]"
                >{{ billingState(item)[0] }}</span
              >
            </td>
            <td class="call-model-cell">
              <strong>{{ item.model || "尚未返回模型" }}</strong
              ><span>{{
                item.usage ? number(item.usage.total) + " Token" : "用量待返回"
              }}</span
              ><span v-if="item.failoverCount" class="call-subtle-warning"
                >自动切换 {{ item.failoverCount }} 次</span
              >
            </td>
            <td class="call-credit-cell">
              <strong :class="{ provisional: awaitingCharge(item) }">{{
                number(
                  awaitingCharge(item)
                    ? item.reservedPoints
                    : item.chargedPoints,
                )
              }}</strong
              ><span>{{
                awaitingCharge(item)
                  ? "预占额度"
                  : Number(item.refundedPoints) > 0
                    ? "原扣额度"
                    : "实扣额度"
              }}</span
              ><span v-if="Number(item.refundedPoints) > 0"
                >已退还 {{ number(item.refundedPoints) }}</span
              ><span v-if="Number(item.waivedPoints) > 0"
                >豁免 {{ number(item.waivedPoints) }}</span
              ><span v-if="item.upstreamCostPending" class="call-subtle-warning"
                >上游成本待核对</span
              >
            </td>
            <td class="call-time-cell">
              <time :datetime="item.createdAt">{{
                dateLabel(item.createdAt)
              }}</time
              ><span class="call-duration">{{
                item.durationMs == null
                  ? "耗时待返回"
                  : item.durationMs < 1000
                    ? item.durationMs + " ms"
                    : (item.durationMs / 1000).toFixed(1) + " 秒"
              }}</span>
            </td>
            <td class="call-open-cell">
              <button
                class="call-open"
                :disabled="busy"
                :aria-label="
                  '查看调用详情：' + (item.title || featureLabel[item.feature])
                "
                @click="$emit('detail', item.id)"
              >
                <span>详情</span><Icon name="ArrowUpRight" :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="call-empty">
        <span
          ><Icon :name="feature || status ? 'SearchX' : 'History'" :size="27"
        /></span>
        <h3>
          {{
            feature || status ? "没有符合筛选条件的调用" : "还没有 AI 调用记录"
          }}
        </h3>
        <p>
          {{
            feature || status
              ? "试试其他功能或状态，也可以清除筛选查看全部记录。"
              : "用户开始 AI 评阅、出题或模拟面试后，记录会显示在这里。"
          }}
        </p>
        <button
          v-if="feature || status"
          class="btn small"
          :disabled="busy"
          @click="reset"
        >
          清除筛选
        </button>
      </div>
      <footer class="call-pagination">
        <span
          >第 <strong>{{ page }}</strong> / {{ pageCount }} 页<span
            class="call-page-size"
          >
            · 每页 30 条</span
          ></span
        >
        <div>
          <button
            class="btn small"
            :disabled="busy || page <= 1"
            @click="page--"
          >
            <Icon
              name="ChevronDown"
              :size="14"
              class="call-prev-icon"
            />上一页</button
          ><button
            class="btn small"
            :disabled="busy || page >= pageCount"
            @click="page++"
          >
            下一页<Icon name="ChevronRight" :size="14" />
          </button>
        </div>
      </footer>
    </section>

    <section class="call-admin-audit">
      <AppDisclosure title="管理操作审计"
        ><p class="call-audit-note">
          最近 30 条配置与额度操作，便于追溯调整依据。
        </p>
        <div v-if="!summary.audit.length" class="call-audit-note">
          暂无管理操作记录。
        </div>
        <article
          v-for="item in summary.audit"
          :key="item.id"
          class="call-audit-entry"
        >
          <AppDisclosure
            :title="
              (auditLabels[item.action] || item.action) +
              ' · ' +
              dateLabel(item.createdAt)
            "
            ><p class="call-audit-note">
              操作账号 <code>{{ item.userId }}</code>
            </p>
            <pre>{{ pretty(item.data) }}</pre>
          </AppDisclosure>
        </article></AppDisclosure
      >
    </section>
  </div>
</template>
<style scoped>
.call-history {
  --call-line: #e1e9e4;
  --call-muted: #74867c;
  color: #253b34;
  min-width: 0;
}
.call-section-heading,
.call-ledger-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.call-section-heading h2,
.call-ledger-heading h2 {
  font-size: 18px;
  margin: 0;
  letter-spacing: -0.3px;
}
.call-section-heading p,
.call-ledger-heading p {
  font-size: 12px;
  color: var(--call-muted);
  margin: 5px 0 0;
  line-height: 1.8;
}
.call-period {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #61786b;
  background: #edf3ef;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
}
.call-overview {
  margin: 28px 0 24px;
}
.call-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 17px 0 0;
}
.call-metrics article {
  border: 1px solid var(--call-line);
  border-radius: 11px;
  background: #fff;
  padding: 19px 20px 17px;
  min-width: 0;
}
.call-metrics article > span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #627a6d;
  font-size: 12px;
}
.call-metrics article > strong {
  display: block;
  font-size: 29px;
  line-height: 1.4;
  margin: 12px 0 8px;
  font-weight: 650;
  letter-spacing: -0.9px;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.call-metrics small {
  margin-left: 7px;
  font-size: 11px;
  font-weight: 400;
  color: var(--call-muted);
  letter-spacing: 0;
}
.call-metrics p {
  font-size: 11px;
  color: var(--call-muted);
  margin: 0;
}
.call-metrics .attention {
  background: #f9f4e8;
  border-color: #e8d7af;
}
.attention > strong {
  color: #956c21;
}
.call-inline-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8d681f;
  padding: 0;
  font-size: 11px;
  text-align: left;
}
.call-feature-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin: 14px 0 0;
  font-size: 11px;
  color: #5f7669;
}
.call-feature-strip > span:first-child {
  color: #8b9a91;
}
.call-feature-strip strong {
  margin-left: 7px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.call-ledger {
  border: 1px solid var(--call-line);
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.call-ledger-heading {
  padding: 22px 23px 18px;
}
.call-ledger-heading h2 > span {
  font-size: 11px;
  font-weight: 400;
  color: var(--call-muted);
  margin-left: 12px;
  letter-spacing: 0;
}
.call-refreshing {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #176b58;
  white-space: nowrap;
}
.call-refreshing :deep(svg) {
  animation: call-spin 1.2s linear infinite;
}
.call-filters {
  border-top: 1px solid #edf1ee;
  border-bottom: 1px solid var(--call-line);
  padding: 13px 23px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fcfdfc;
}
.call-filters > div {
  display: flex;
  gap: 10px;
  min-width: 0;
}
.call-filters :deep(.app-select) {
  width: 158px;
}
.call-filter-hint,
.call-reset {
  color: #809086;
  font-size: 11px;
  white-space: nowrap;
}
.call-reset {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #176b58;
}
.call-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  text-align: left;
}
.call-table th {
  background: #f4f7f5;
  font-size: 11px;
  font-weight: 500;
  color: #75897d;
  padding: 13px 12px;
  border-bottom: 1px solid var(--call-line);
}
.call-table th:first-child {
  width: 29%;
  padding-left: 23px;
}
.call-table th:nth-child(2) {
  width: 15%;
}
.call-table th:nth-child(3) {
  width: 20%;
}
.call-table th:nth-child(4) {
  width: 13%;
}
.call-table th:nth-child(5) {
  width: 15%;
}
.call-table th:last-child {
  width: 8%;
}
.call-table td {
  border-bottom: 1px solid #edf1ee;
  padding: 18px 12px;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.call-table td:first-child {
  padding-left: 23px;
}
.call-table tbody tr:last-child td {
  border-bottom: 0;
}
.call-table tbody tr:hover {
  background: #f8fbf9;
}
.call-table tbody tr.needs-review {
  background: #fffcf5;
}
.call-feature-label {
  font-size: 10px;
  color: #617e6e;
}
.call-task-title {
  display: block;
  padding: 3px 0 0;
  font-size: 13px;
  line-height: 1.75;
  font-weight: 600;
  text-align: left;
  width: 100%;
  overflow-wrap: anywhere;
}
.call-task-title:hover {
  color: #176b58;
}
.call-user {
  margin-top: 7px;
  font-size: 10px;
  color: #8a9990;
  display: flex;
  align-items: center;
  gap: 4px;
}
.call-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  border-radius: 5px;
  padding: 3px 7px;
  width: fit-content;
  white-space: nowrap;
  background: #f0f3f1;
  color: #708277;
}
.call-badge > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.call-badge[data-tone="success"] {
  background: #eaf4ed;
  color: #26704f;
}
.call-badge[data-tone="progress"] {
  background: #eaf0f8;
  color: #526e9c;
}
.call-badge[data-tone="danger"] {
  background: #fbeeea;
  color: #aa5c4a;
}
.call-badge[data-tone="warning"] {
  background: #faf0d8;
  color: #9b742d;
}
.call-settlement {
  display: block;
  margin-top: 7px;
  color: #8a9990;
  font-size: 10px;
}
.call-settlement[data-tone="warning"] {
  color: #9b742d;
  font-weight: 600;
}
.call-model-cell > strong {
  display: block;
  font-size: 11px;
  font-weight: 500;
}
.call-model-cell > span,
.call-credit-cell > span {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  color: #7d8f83;
}
.call-credit-cell > strong {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.4px;
  color: #2e5e46;
  font-variant-numeric: tabular-nums;
}
.call-credit-cell > strong.provisional {
  color: #9a7841;
}
.call-model-cell > .call-subtle-warning,
.call-credit-cell > .call-subtle-warning {
  color: #a08149;
}
.call-time-cell time {
  font-size: 11px;
  color: #657c6e;
  white-space: nowrap;
}
.call-duration {
  display: block;
  font-size: 10px;
  color: #96a299;
  margin-top: 6px;
}
.call-open {
  display: inline-flex;
  gap: 3px;
  padding: 5px 0;
  color: #6d8979;
  align-items: center;
  font-size: 11px;
}
.call-open > span {
  display: none;
}
.call-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 23px;
  border-top: 1px solid var(--call-line);
  color: #7c8d82;
  font-size: 11px;
}
.call-pagination > div {
  display: flex;
  gap: 8px;
}
.call-pagination .btn {
  font-size: 11px;
  padding: 7px 10px;
  min-height: 32px;
  gap: 4px;
}
.call-prev-icon {
  transform: rotate(90deg);
}
.call-empty {
  padding: 48px 20px;
  text-align: center;
}
.call-empty > span {
  width: 58px;
  height: 58px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  background: #f0f5f2;
  border: 1px solid #e3ece6;
  border-radius: 15px;
  color: #7e9d8a;
}
.call-empty h3 {
  font-size: 15px;
  margin: 16px 0 7px;
}
.call-empty p {
  font-size: 12px;
  color: #82958a;
  margin: 0 0 16px;
}
.call-admin-audit {
  margin-top: 18px;
  padding: 17px 23px;
  border: 1px solid var(--call-line);
  border-radius: 10px;
  background: #fff;
}
.call-admin-audit :deep(.app-disclosure-trigger) {
  font-size: 13px;
}
.call-audit-note {
  font-size: 11px;
  color: #7c9083;
  overflow-wrap: anywhere;
}
.call-audit-entry {
  border-top: 1px solid #edf1ee;
  padding: 9px 0;
}
.call-audit-entry pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #f4f7f5;
  border: 1px solid var(--call-line);
  border-radius: 6px;
  padding: 14px;
  font-size: 11px;
  max-height: 300px;
  overflow: auto;
}
.call-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@keyframes call-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1050px) {
  .call-metrics {
    gap: 9px;
  }
  .call-metrics article {
    padding: 16px;
  }
  .call-metrics article > strong {
    font-size: 25px;
  }
}
@media (max-width: 850px) {
  .call-table,
  .call-table tbody,
  .call-table tr {
    display: block;
  }
  .call-table thead {
    display: none;
  }
  .call-table tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px 16px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--call-line);
  }
  .call-table tbody tr:last-child {
    border-bottom: 0;
  }
  .call-table td,
  .call-table td:first-child {
    display: block;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .call-task-cell {
    grid-column: 1 / -1;
    grid-row: 1;
    padding-right: 95px !important;
  }
  .call-status-cell {
    grid-row: 1;
    grid-column: 2;
    justify-self: end;
    text-align: right;
    max-width: 95px;
  }
  .call-status-cell .call-badge {
    margin-left: auto;
  }
  .call-model-cell {
    grid-column: 1;
    grid-row: 2;
  }
  .call-credit-cell {
    grid-column: 2;
    grid-row: 2;
    text-align: right;
  }
  .call-time-cell {
    grid-column: 1;
    grid-row: 3;
    align-self: center;
  }
  .call-time-cell time {
    font-size: 10px;
  }
  .call-duration {
    display: inline;
    margin-left: 8px;
  }
  .call-open-cell {
    grid-column: 2;
    grid-row: 3;
    text-align: right;
    align-self: center;
  }
  .call-open {
    border: 1px solid #dce8df;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    min-height: 32px;
  }
  .call-open > span {
    display: inline;
  }
}
@media (max-width: 600px) {
  .call-overview {
    margin-top: 22px;
  }
  .call-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .call-metrics article {
    padding: 15px;
  }
  .call-metrics article > strong {
    font-size: 27px;
    margin: 9px 0 6px;
  }
  .call-metrics p {
    font-size: 10px;
  }
  .call-section-heading h2,
  .call-ledger-heading h2 {
    font-size: 17px;
  }
  .call-section-heading p {
    max-width: 220px;
  }
  .call-period {
    font-size: 10px;
    padding: 5px 8px;
  }
  .call-feature-strip {
    gap: 8px 14px;
  }
  .call-feature-strip > span:first-child {
    flex-basis: 100%;
  }
  .call-ledger-heading {
    padding: 18px 17px 15px;
    align-items: flex-start;
  }
  .call-ledger-heading p {
    font-size: 11px;
  }
  .call-filters {
    padding: 12px 17px;
    flex-wrap: wrap;
  }
  .call-filters > div {
    width: 100%;
  }
  .call-filters :deep(.app-select) {
    width: 50%;
    min-width: 0;
  }
  .call-filters :deep(.app-select-trigger) {
    min-width: 0;
    font-size: 12px;
  }
  .call-filter-hint {
    display: none;
  }
  .call-table tr {
    padding: 18px 17px;
  }
  .call-pagination {
    padding: 14px 17px;
    gap: 8px;
  }
  .call-page-size {
    display: none;
  }
  .call-admin-audit {
    padding: 14px 17px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .call-refreshing :deep(svg) {
    animation: none;
  }
}
</style>
