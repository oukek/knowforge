<script setup>
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  useId,
} from "vue";
import Icon from "./Icon.vue";

const props = defineProps({ state: Object });
const emit = defineEmits(["cancel", "retry"]);
const id = `python-runtime-${useId()}`;
const visible = ref(false),
  panel = ref(null),
  logPanel = ref(null),
  followLogs = ref(true),
  details = ref(false),
  now = ref(Date.now()),
  copied = ref("");
let revealTimer,
  clock,
  returnFocus,
  overflow,
  appInert,
  locked = false,
  collapsed = false,
  prepared = false;
const stages = [
  { id: "connect", title: "连接服务" },
  { id: "manifest", title: "获取清单" },
  { id: "download", title: "加载资源" },
  { id: "initialize", title: "初始化" },
];
const names = {
  "pyodide.js": "运行加载器",
  "pyodide.asm.mjs": "初始化模块",
  "pyodide.asm.wasm": "Python 核心",
  "python_stdlib.zip": "Python 标准库",
  "pyodide-lock.json": "包索引",
};
const loading = computed(() => props.state?.status === "loading");
const failed = computed(() => props.state?.status === "failed");
const complete = computed(() => props.state?.status === "ready");
const stageIndex = computed(() =>
  stages.findIndex((stage) => stage.id === props.state?.stage),
);
const resources = computed(() => props.state?.resources ?? []);
const ready = computed(
  () => resources.value.filter((file) => file.status === "ready").length,
);
const bytes = computed(() =>
  resources.value.reduce((sum, file) => sum + file.loaded, 0),
);
const elapsed = computed(() =>
  Math.max(
    0,
    Math.floor((now.value - (props.state?.startedAt ?? now.value)) / 1000),
  ),
);
const title = computed(() =>
  failed.value
    ? "Python 环境加载失败"
    : complete.value
      ? "Python 环境准备完成"
      : props.state?.status === "cancelled"
        ? "已取消环境加载"
        : "正在准备 Python 环境",
);
const summary = computed(() =>
  failed.value
    ? "查看错误与加载日志，修复网络或资源问题后重试。"
    : complete.value
      ? "本次环境已完成初始化，加载日志保留在这里。"
      : loading.value && props.state.stage === "initialize"
        ? "资源已就绪，正在初始化解释器。此阶段没有准确的进度百分比。"
        : "首次需要读取约 13 MB 运行资源；已缓存的资源会复用。你可以收起窗口继续阅读。",
);

function size(value) {
  if (!value) return "0 KB";
  return value >= 1048576
    ? (value / 1048576).toFixed(1) + " MB"
    : Math.ceil(value / 1024) + " KB";
}
function timestamp(value) {
  const seconds = Math.floor(value / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function lock(value) {
  const app = document.getElementById("app");
  if (value && !locked) {
    overflow = document.body.style.overflow;
    appInert = app?.inert;
    document.body.style.overflow = "hidden";
    if (app) app.inert = true;
    locked = true;
  } else if (!value && locked) {
    document.body.style.overflow = overflow;
    if (app) app.inert = appInert;
    locked = false;
  }
}
function focusPanel() {
  panel.value
    ?.querySelector("[data-initial-focus]")
    ?.focus({ preventScroll: true });
}
function collapse() {
  collapsed = true;
  visible.value = false;
}
function open() {
  collapsed = false;
  visible.value = true;
}
function keydown(event) {
  if (!visible.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    collapse();
  } else if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "k"
  ) {
    event.preventDefault();
    event.stopPropagation();
  } else if (event.key === "Tab") {
    const elements = [
      ...(panel.value?.querySelectorAll(
        'button:not(:disabled),[tabindex="0"]',
      ) ?? []),
    ].filter((el) => el.getClientRects().length);
    const first = elements[0],
      last = elements.at(-1);
    if (!elements.length) {
      event.preventDefault();
      return;
    }
    if (
      !panel.value?.contains(document.activeElement) ||
      (!event.shiftKey && document.activeElement === last)
    ) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  }
}
function containFocus(event) {
  if (visible.value && panel.value && !panel.value.contains(event.target))
    focusPanel();
}
watch(
  () => [props.state?.runId, props.state?.status],
  ([runId, status], previous) => {
    clearTimeout(revealTimer);
    clearInterval(clock);
    if (!props.state) {
      visible.value = false;
      return;
    }
    now.value = Date.now();
    if (runId !== previous?.[0]) {
      collapsed = false;
      details.value = false;
      copied.value = "";
      followLogs.value = true;
    }
    if (status === "loading") {
      clock = setInterval(() => {
        now.value = Date.now();
      }, 1000);
      // Fast cached starts finish without flashing a modal.
      if (!visible.value)
        revealTimer = setTimeout(
          () => {
            if (!collapsed && loading.value) visible.value = true;
          },
          prepared ? 1500 : 500,
        );
    } else if (status === "failed") {
      details.value = true;
      if (!collapsed) visible.value = true;
    } else {
      if (status === "ready") prepared = true;
      visible.value = false;
    }
  },
  { immediate: true },
);
watch(visible, async (value) => {
  if (value) returnFocus = document.activeElement;
  lock(value);
  await nextTick();
  if (value) focusPanel();
  else if (
    returnFocus?.isConnected &&
    !returnFocus.disabled &&
    returnFocus.getClientRects().length
  )
    returnFocus.focus({ preventScroll: true });
  else
    document
      .querySelector('#lesson-practice [role="tab"][aria-selected="true"]')
      ?.focus({ preventScroll: true });
});
watch(
  () => [details.value, props.state?.events.length],
  async ([expanded], previous) => {
    if (!expanded || (previous?.[0] && !followLogs.value)) return;
    await nextTick();
    if (logPanel.value) logPanel.value.scrollTop = logPanel.value.scrollHeight;
  },
);
function trackLogScroll() {
  const element = logPanel.value;
  if (element)
    followLogs.value =
      element.scrollHeight - element.scrollTop - element.clientHeight < 24;
}
async function copyLogs() {
  const text = [
    title.value,
    ...props.state.events.map(
      (item) => `[${timestamp(item.elapsedMs)}] ${item.text}`,
    ),
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    copied.value = "日志已复制";
  } catch {
    copied.value = "复制失败，请展开并手动选择日志";
    details.value = true;
  }
}
onMounted(() => {
  if (visible.value) {
    returnFocus = document.activeElement;
    lock(true);
    nextTick(focusPanel);
  }
  document.addEventListener("keydown", keydown, true);
  document.addEventListener("focusin", containFocus, true);
});
onBeforeUnmount(() => {
  clearTimeout(revealTimer);
  clearInterval(clock);
  lock(false);
  document.removeEventListener("keydown", keydown, true);
  document.removeEventListener("focusin", containFocus, true);
});
</script>

<template>
  <div v-if="state && !visible" class="python-runtime-inline">
    <span class="python-runtime-indicator" :class="{ busy: loading, failed }"
      ><Icon
        :name="
          failed
            ? 'CircleAlert'
            : loading
              ? 'CircleDot'
              : complete
                ? 'CheckCircle2'
                : 'Circle'
        "
        :size="16"
    /></span>
    <span>{{
      loading
        ? "Python 环境准备中"
        : failed
          ? "Python 环境未就绪"
          : complete
            ? "本次环境准备完成"
            : "环境加载已取消"
    }}</span>
    <button class="text-btn" @click="open">
      {{ loading ? "查看加载进度" : "查看加载日志" }}
    </button>
  </div>
  <Teleport to="body">
    <div v-if="visible && state" class="python-runtime-layer">
      <div
        class="python-runtime-backdrop"
        aria-hidden="true"
        @pointerdown.stop
        @pointerup.stop
        @click.stop.prevent="collapse"
      ></div>
      <section
        ref="panel"
        class="python-runtime-panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="id"
        :aria-describedby="id + '-summary'"
      >
        <header class="python-runtime-heading">
          <span class="python-runtime-mark"
            ><Icon name="SquareTerminal" :size="23"
          /></span>
          <div>
            <div class="eyebrow">PYTHON WORKSPACE</div>
            <h2 :id="id">{{ title }}</h2>
          </div>
          <button
            class="icon-btn"
            aria-label="收起 Python 加载窗口"
            data-initial-focus
            @click="collapse"
          >
            <Icon name="X" :size="20" />
          </button>
        </header>
        <div class="python-runtime-content">
          <p :id="id + '-summary'" class="python-runtime-summary">
            {{ summary }}
          </p>
          <ol class="python-runtime-stages" aria-label="Python 环境加载阶段">
            <li
              v-for="(stage, index) in stages"
              :key="stage.id"
              :class="{
                passed: complete || index < stageIndex,
                active: !complete && index === stageIndex,
                failed: failed && index === stageIndex,
              }"
              :aria-current="
                loading && index === stageIndex ? 'step' : undefined
              "
            >
              <span
                ><Icon
                  v-if="complete || index < stageIndex"
                  name="Check"
                  :size="14"
                /><Icon
                  v-else-if="failed && index === stageIndex"
                  name="X"
                  :size="14"
                /><template v-else>{{ index + 1 }}</template></span
              >
              {{ stage.title }}
            </li>
          </ol>
          <div class="python-runtime-status" role="status" aria-live="polite">
            <strong>{{
              loading
                ? stages[stageIndex]?.title + "中…"
                : failed
                  ? "准备未完成"
                  : complete
                    ? "准备完成"
                    : "已取消"
            }}</strong
            ><span aria-hidden="true">{{
              loading ? "已等待 " + elapsed + " 秒" : ""
            }}</span>
          </div>
          <template v-if="resources.length">
            <div
              class="python-runtime-meter"
              role="progressbar"
              aria-label="已就绪运行资源"
              :aria-valuenow="ready"
              :aria-valuemin="0"
              :aria-valuemax="resources.length"
            >
              <span
                :style="{ width: (ready / resources.length) * 100 + '%' }"
              ></span>
            </div>
            <div class="python-runtime-count">
              <span>{{ ready }} / {{ resources.length }} 项资源已就绪</span
              ><span>已读取 {{ size(bytes) }}</span>
            </div>
            <ul class="python-runtime-files" aria-label="运行资源状态">
              <li v-for="file in resources" :key="file.name">
                <Icon
                  :name="
                    file.status === 'ready'
                      ? 'CheckCircle2'
                      : file.status === 'failed'
                        ? 'CircleAlert'
                        : file.status === 'loading'
                          ? 'CircleDot'
                          : 'Circle'
                  "
                  :size="16"
                  :class="file.status"
                />
                <span>{{ names[file.name] || file.name }}</span
                ><small>{{
                  file.status === "ready"
                    ? "已就绪 · " + size(file.loaded)
                    : file.status === "failed"
                      ? "加载失败"
                      : file.loaded
                        ? size(file.loaded) +
                          (file.total >= file.loaded
                            ? " / " + size(file.total)
                            : "")
                        : file.status === "loading"
                          ? "读取中…"
                          : "等待中"
                }}</small>
              </li>
            </ul>
          </template>
          <div v-else-if="loading" class="python-runtime-wait">
            <span></span>
          </div>
          <p v-if="failed" class="python-runtime-error" role="alert">
            {{ state.error }}
          </p>
          <div class="python-runtime-log-section">
            <button
              class="python-runtime-log-toggle"
              :aria-expanded="details"
              :aria-controls="id + '-logs'"
              @click="details = !details"
            >
              <Icon name="SquareTerminal" :size="16" />加载日志
              <span>{{ state.events.length }} 条</span
              ><Icon
                :name="details ? 'ChevronDown' : 'ChevronRight'"
                :size="16"
              />
            </button>
            <ol
              ref="logPanel"
              v-show="details"
              :id="id + '-logs'"
              class="python-runtime-logs"
              aria-label="Python 环境加载日志"
              tabindex="0"
              @scroll="trackLogScroll"
            >
              <li
                v-for="(item, index) in state.events"
                :key="index"
                :class="{ error: item.level === 'error' }"
              >
                <time>{{ timestamp(item.elapsedMs) }}</time
                ><span>{{ item.text }}</span>
              </li>
            </ol>
          </div>
          <p v-if="loading && elapsed >= 10" class="python-runtime-slow">
            加载时间取决于网络与设备性能。收起窗口不会中断加载，取消则会停止本次运行。
          </p>
          <p v-if="copied" class="python-runtime-copy-status" role="status">
            {{ copied }}
          </p>
        </div>
        <footer class="python-runtime-actions">
          <button class="text-btn" @click="copyLogs">
            <Icon name="Copy" :size="16" />复制日志
          </button>
          <div class="row">
            <template v-if="loading"
              ><button class="btn small" @click="emit('cancel')">
                取消加载</button
              ><button class="btn primary small" @click="collapse">
                收起，继续阅读
              </button></template
            >
            <template v-else-if="failed"
              ><button class="btn small" @click="collapse">关闭</button
              ><button class="btn primary small" @click="emit('retry')">
                <Icon name="RotateCcw" :size="15" />重新加载并运行
              </button></template
            >
            <button v-else class="btn primary small" @click="collapse">
              完成
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.python-runtime-inline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
  font-size: 12px;
  color: var(--muted);
}
.python-runtime-inline .text-btn {
  margin-left: auto;
  min-height: 36px;
}
.python-runtime-indicator {
  display: flex;
  color: var(--green);
}
.python-runtime-indicator.failed {
  color: #a34537;
}
.python-runtime-layer {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: grid;
  place-items: center;
  padding: 24px;
}
.python-runtime-backdrop {
  position: absolute;
  inset: 0;
  background: #153b3559;
  backdrop-filter: blur(4px);
}
.python-runtime-panel {
  position: relative;
  width: min(580px, 100%);
  max-height: calc(100vh - 48px);
  max-height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
  background: #fbfdfb;
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 24px 80px #102e332e;
  overflow: hidden;
}
.python-runtime-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 24px 24px 18px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.python-runtime-mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #e8f1ec;
  color: var(--green);
  flex-shrink: 0;
}
.python-runtime-heading .eyebrow {
  font-size: 9px;
  letter-spacing: 0.14em;
  margin-bottom: 6px;
}
.python-runtime-heading h2 {
  font-size: 19px;
  line-height: 1.4;
  margin: 0;
  color: var(--ink);
}
.python-runtime-heading .icon-btn {
  margin-left: auto;
  flex-shrink: 0;
  min-width: 40px;
  min-height: 40px;
}
.python-runtime-content {
  padding: 18px 24px;
  overflow: auto;
  overscroll-behavior: contain;
  min-height: 0;
}
.python-runtime-summary {
  font-size: 13px;
  line-height: 1.8;
  color: var(--muted);
  margin: 0 0 20px;
}
.python-runtime-stages {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 0;
  margin: 0 0 24px;
  list-style: none;
  gap: 8px;
}
.python-runtime-stages li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  line-height: 1.4;
  color: #8d9c95;
}
.python-runtime-stages li > span {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid #d8e1dc;
  border-radius: 50%;
  font-size: 11px;
  background: #fff;
}
.python-runtime-stages li.passed,
.python-runtime-stages li.active {
  color: var(--green);
}
.python-runtime-stages li.passed > span {
  background: #e8f1ec;
  border-color: #e8f1ec;
}
.python-runtime-stages li.active > span {
  background: var(--green);
  color: #fff;
  border-color: var(--green);
  box-shadow: 0 0 0 4px #2d775c0c;
}
.python-runtime-stages li.failed,
.python-runtime-stages li.failed > span {
  color: #a34537;
}
.python-runtime-stages li.failed > span {
  background: #fbefeb;
  border-color: #ecd4cc;
  box-shadow: none;
}
.python-runtime-status,
.python-runtime-count {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
}
.python-runtime-status {
  min-height: 24px;
  margin-bottom: 10px;
}
.python-runtime-status strong {
  font-size: 13px;
  color: var(--ink);
}
.python-runtime-meter {
  height: 5px;
  overflow: hidden;
  border-radius: 8px;
  background: #e8eeea;
}
.python-runtime-meter > span {
  display: block;
  height: 100%;
  background: var(--green);
  transition: width 0.2s ease;
}
.python-runtime-count {
  font-size: 11px;
  margin: 9px 0 12px;
}
.python-runtime-files {
  list-style: none;
  padding: 0;
  margin: 0 0 18px;
  display: grid;
  gap: 2px;
}
.python-runtime-files li {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 31px;
  font-size: 12px;
  color: var(--ink);
}
.python-runtime-files svg {
  color: #a4b1aa;
  flex-shrink: 0;
}
.python-runtime-files svg.ready,
.python-runtime-files svg.loading {
  color: var(--green);
}
.python-runtime-files svg.failed {
  color: #a34537;
}
.python-runtime-files small {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  text-align: right;
}
.python-runtime-wait {
  height: 4px;
  overflow: hidden;
  background: #e8eeea;
  border-radius: 4px;
  margin: 12px 0 20px;
}
.python-runtime-wait span {
  display: block;
  width: 35%;
  height: 100%;
  background: var(--green);
  animation: python-prepare 1.7s ease-in-out infinite alternate;
}
.python-runtime-error {
  font-size: 12px;
  line-height: 1.7;
  padding: 12px;
  background: #fbefeb;
  border: 1px solid #ecd4cc;
  border-radius: 8px;
  color: #943d30;
  overflow-wrap: anywhere;
  margin: 10px 0 14px;
}
.python-runtime-log-section {
  border-top: 1px solid var(--line);
  padding-top: 10px;
}
.python-runtime-log-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  font-size: 12px;
  min-height: 36px;
  color: var(--ink);
}
.python-runtime-log-toggle > span {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
}
.python-runtime-logs {
  list-style: none;
  max-height: 166px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 12px;
  margin: 8px 0 0;
  background: #eff4f0;
  border: 1px solid #dce6df;
  border-radius: 8px;
  font:
    11px/1.8 "SFMono-Regular",
    Consolas,
    monospace;
  user-select: text;
}
.python-runtime-logs li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.python-runtime-logs time {
  color: #83978b;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.python-runtime-logs li > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.python-runtime-logs li.error {
  color: #943d30;
}
.python-runtime-slow,
.python-runtime-copy-status {
  font-size: 11px;
  line-height: 1.8;
  color: var(--muted);
  margin: 12px 0 0;
}
.python-runtime-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  background: #fff;
}
.python-runtime-actions .text-btn {
  font-size: 12px;
  min-height: 36px;
  flex-shrink: 0;
}
.python-runtime-actions .row {
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
@keyframes python-prepare {
  from {
    transform: translateX(-70%);
  }
  to {
    transform: translateX(260%);
  }
}
@media (max-width: 767px),
  (pointer: coarse) and (orientation: portrait) and (max-width: 1023px) {
  .python-runtime-layer {
    padding: 0;
    align-items: end;
  }
  .python-runtime-panel {
    width: 100%;
    border-radius: 20px 20px 0 0;
    max-height: 92vh;
    max-height: 92dvh;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .python-runtime-heading {
    padding: 20px 18px 16px;
    gap: 10px;
  }
  .python-runtime-heading h2 {
    font-size: 17px;
  }
  .python-runtime-mark {
    width: 38px;
    height: 38px;
    border-radius: 10px;
  }
  .python-runtime-content {
    padding: 16px 18px;
  }
  .python-runtime-actions {
    padding: 12px 18px;
    gap: 8px;
  }
  .python-runtime-actions .btn,
  .python-runtime-actions .text-btn {
    min-height: 44px;
  }
  .python-runtime-actions .btn {
    font-size: 12px;
    padding: 0 11px;
  }
  .python-runtime-actions .text-btn {
    font-size: 11px;
  }
  .python-runtime-stages {
    gap: 4px;
    margin-bottom: 20px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .python-runtime-wait span {
    animation: none;
  }
  .python-runtime-meter > span {
    transition: none;
  }
}
</style>
