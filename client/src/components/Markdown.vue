<script setup>
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import "highlight.js/styles/github.css";
hljs.registerLanguage("javascript", javascript);
const props = defineProps({ content: { type: String, default: "" } });
const html = computed(() =>
  DOMPurify.sanitize(marked.parse(props.content, { breaks: true })),
);
</script>
<template><div class="prose" v-html="html"></div></template>
