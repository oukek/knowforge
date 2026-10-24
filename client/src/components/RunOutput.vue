<script setup>
import { computed } from "vue";
import Icon from "./Icon.vue";
const props = defineProps({
  result: Object,
  language: { type: String, default: "javascript" },
  logs: { type: Array, default: () => [] },
  running: Boolean,
  stale: Boolean,
});
const rows = computed(() => props.result?.logs ?? props.logs);
const customStdin = computed(
  () => props.result?.mode === "stdin" && props.result.returned !== undefined,
);
</script>
<template>
  <section class="run-output" aria-label="代码运行输出">
    <div class="section-line">
      <h3><Icon name="SquareTerminal" :size="16" />运行输出</h3>
      <span v-if="running" class="badge subtle">执行中</span
      ><span v-else-if="result" class="muted tiny"
        >{{ result.durationMs ?? "—" }} ms</span
      >
    </div>
    <p v-if="stale" class="run-stale" role="status">
      代码已修改，下面是上次结果；请重新运行。
    </p>
    <div
      class="console-lines"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div
        v-for="(line, i) in rows"
        :key="i"
        class="console-line"
        :class="line.level"
      >
        <span>{{ i + 1 }}</span>
        <pre>{{ line.text }}</pre>
      </div>
      <p v-if="!rows.length" class="muted tiny">
        {{
          running
            ? language === "python"
              ? "正在执行，print 输出会实时显示…"
              : "正在执行，console 输出会实时显示…"
            : result && !result.error
              ? language === "python"
                ? "执行完成，没有 print 输出。"
                : "执行完成，没有 console 输出。"
              : language === "python"
                ? "修改代码后点击运行，print 与错误输出会显示在这里。"
                : "修改代码后点击运行，console.log、warn 和 error 会显示在这里。"
        }}
      </p>
    </div>
    <p v-if="result?.overflow" class="run-stale">
      输出超过 200 条，后续日志已截断。
    </p>
    <div v-if="result?.error" class="runtime-error" role="status">
      <Icon name="CircleAlert" :size="17" />
      <pre>{{ result.error }}</pre>
    </div>
    <div
      v-if="result?.returned !== null && result?.returned !== undefined"
      class="return-value"
    >
      <span>{{ result.mode === "stdin" ? "标准输出" : "返回值" }}</span>
      <pre>{{ result.returned }}</pre>
    </div>
    <div v-if="result?.results" class="inline-tests">
      <div class="section-line">
        <strong>{{ customStdin ? "自定义运行（不判题）" : "用例验证" }}</strong
        ><span
          class="badge"
          :class="{ danger: result.results.some((test) => !test.passed) }"
          ><template v-if="customStdin">{{
            result.results.every((test) => test.passed)
              ? "执行完成"
              : "执行失败"
          }}</template
          ><template v-else
            >{{ result.results.filter((test) => test.passed).length }} /
            {{ result.results.length }} 通过</template
          ></span
        >
      </div>
      <div
        v-for="test in result.results"
        :key="test.name"
        class="inline-test"
        :class="{ failed: !test.passed }"
      >
        <Icon :name="test.passed ? 'CheckCircle2' : 'XCircle'" :size="16" />
        <div>
          <strong>{{ test.name }}</strong>
          <pre v-if="test.error">{{ test.error }}</pre>
          <div
            v-if="!test.passed && test.expected !== undefined"
            class="stdio-diff"
          >
            <template v-if="test.input !== undefined"
              ><span>本组输入</span>
              <pre>{{ test.input }}</pre>
            </template>
            <p v-if="test.truncated" class="tiny muted">
              长内容仅显示前 10000 个字符；判题使用完整数据。
            </p>
            <span>预期输出</span>
            <pre>{{ test.expected }}</pre>
            <span>实际输出</span>
            <pre>{{ test.actual || "（空输出）" }}</pre>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
