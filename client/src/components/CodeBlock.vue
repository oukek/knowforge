<script setup>
import { computed, ref } from "vue";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import Icon from "./Icon.vue";
import { toast } from "../store";
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
const props = defineProps({
  code: String,
  language: { type: String, default: "javascript" },
  label: { type: String, default: "JavaScript" },
});
const highlighted = computed(
  () => hljs.highlight(props.code || "", { language: props.language }).value,
);
const copied = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    toast("复制失败，请手动选择代码");
  }
}
</script>
<template>
  <div class="code-block">
    <div class="code-top">
      <span>{{ language === "python" ? "Python" : label }}</span
      ><button class="text-btn" @click="copy">
        <Icon :name="copied ? 'Check' : 'Copy'" :size="14" />{{
          copied ? "已复制" : "复制"
        }}
      </button>
    </div>
    <pre><code class="hljs" v-html="highlighted"></code></pre>
  </div>
</template>
