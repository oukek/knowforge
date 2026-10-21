<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { basicSetup } from "codemirror";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { python } from "@codemirror/lang-python";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { completeFromList } from "@codemirror/autocomplete";
import Icon from "./Icon.vue";
const props = defineProps({
  modelValue: { type: String, default: "" },
  label: { type: String, default: "JavaScript 代码" },
  height: { type: Number, default: 340 },
  language: { type: String, default: "javascript" },
});
const emit = defineEmits(["update:modelValue", "run"]);
const host = ref(null),
  formatting = ref(false),
  formatError = ref("");
let view,
  updating = false,
  alive = true;
const completions = completeFromList(
  [
    "console",
    "Promise",
    "Math",
    "Object",
    "Array",
    "Map",
    "Set",
    "JSON",
    "Number",
    "String",
    "Reflect",
    "Date",
    "AbortController",
    "TextEncoder",
    "TextDecoder",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "queueMicrotask",
  ].map((label) => ({ label, type: "variable" })),
);
const members = {
  console: [
    "log",
    "info",
    "warn",
    "error",
    "debug",
    "table",
    "assert",
    "clear",
    "time",
    "timeEnd",
  ],
  Math: [
    "abs",
    "ceil",
    "floor",
    "max",
    "min",
    "pow",
    "random",
    "round",
    "sqrt",
    "trunc",
  ],
  JSON: ["parse", "stringify"],
  Object: [
    "keys",
    "values",
    "entries",
    "fromEntries",
    "assign",
    "create",
    "hasOwn",
    "is",
  ],
  Array: ["from", "isArray", "of"],
  Promise: ["resolve", "reject", "all", "allSettled", "race", "any"],
};
function javascriptCompletions(context) {
  const member = context.matchBefore(
    /(?:console|Math|JSON|Object|Array|Promise)\.\w*$/,
  );
  if (member) {
    const [object, word] = member.text.split(".");
    return {
      from: context.pos - word.length,
      options: members[object].map((label) => ({ label, type: "function" })),
      validFor: /^\w*$/,
    };
  }
  return completions(context);
}
onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        props.language === "python" ? python() : javascript(),
        indentUnit.of(props.language === "python" ? "    " : "  "),
        EditorState.tabSize.of(props.language === "python" ? 4 : 2),
        ...(props.language === "python"
          ? []
          : [
              javascriptLanguage.data.of({
                autocomplete: javascriptCompletions,
              }),
            ]),
        Prec.highest(
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                emit("run");
                return true;
              },
            },
            {
              key: "Shift-Alt-f",
              run: () => {
                format();
                return true;
              },
            },
          ]),
        ),
        keymap.of([indentWithTab]),
        EditorView.contentAttributes.of({
          "aria-label": props.label,
          "aria-multiline": "true",
          spellcheck: "false",
          autocapitalize: "off",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            formatError.value = "";
            if (!updating)
              emit("update:modelValue", update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": {
            fontSize: "12px",
            height: props.height + "px",
            backgroundColor: "#fbfdfb",
            color: "#304f40",
          },
          ".cm-scroller": {
            fontFamily: '"SFMono-Regular", Consolas, monospace',
            lineHeight: "1.9",
            overflow: "auto",
          },
          ".cm-content": { padding: "15px 0", minHeight: "100%" },
          ".cm-line": { padding: "0 14px 0 9px" },
          ".cm-gutters": {
            background: "#f3f7f1",
            color: "#a0b29e",
            borderRight: "1px solid #e4ece1",
            minWidth: "36px",
          },
          ".cm-activeLine, .cm-activeLineGutter": { background: "#eaf2e766" },
          "&.cm-focused": {
            outline: "2px solid #b6d1ba",
            outlineOffset: "-2px",
          },
          ".cm-tooltip": {
            fontSize: "12px",
            border: "1px solid #cedfcb",
            background: "#fcfefb",
          },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
            background: "#cce3d2",
          },
          ".cm-cursor": { borderLeftColor: "#176b58" },
        }),
      ],
    }),
  });
});
watch(
  () => props.modelValue,
  (value) => {
    if (view && value !== view.state.doc.toString()) {
      updating = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      updating = false;
      formatError.value = "";
    }
  },
);
async function format() {
  if (!view || formatting.value || props.language === "python") return;
  formatting.value = true;
  formatError.value = "";
  const source = view.state.doc.toString(),
    cursor = view.state.selection.main.head;
  try {
    const [prettier, babel, estree] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/babel"),
      import("prettier/plugins/estree"),
    ]);
    const output = await prettier.formatWithCursor(source, {
      parser: "babel",
      plugins: [babel.default ?? babel, estree.default ?? estree],
      tabWidth: 2,
      useTabs: false,
      singleQuote: true,
      cursorOffset: cursor,
      printWidth: 80,
    });
    if (!alive || !view) return;
    if (source !== view.state.doc.toString()) {
      formatError.value =
        "格式化期间代码有修改，已保留你的新输入，请再试一次。";
      return;
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: output.formatted },
      selection: {
        anchor: Math.min(output.cursorOffset, output.formatted.length),
      },
    });
    view.focus();
  } catch (error) {
    if (alive)
      formatError.value =
        "格式化未完成，原代码已保留：" + String(error.message).slice(0, 300);
  } finally {
    if (alive) formatting.value = false;
  }
}
onBeforeUnmount(() => {
  alive = false;
  view?.destroy();
  view = null;
});
defineExpose({ format, focus: () => view?.focus() });
</script>
<template>
  <div class="js-editor">
    <div class="js-editor-tools">
      <span
        >{{ language === "python" ? "Python" : "JavaScript" }}
        <span class="editor-engine">CodeMirror 6</span></span
      ><button
        v-if="language !== 'python'"
        class="text-btn"
        :disabled="formatting"
        @click="format"
      >
        <Icon name="Code2" :size="14" />{{
          formatting ? "格式化中…" : "格式化"
        }}
      </button>
    </div>
    <div ref="host" class="codemirror-host"></div>
    <div class="js-editor-help">
      {{ language === "python" ? "Tab 四格缩进" : "Tab 缩进" }} · 回车自动缩进 ·
      Ctrl/⌘ + Enter 运行 · Esc 后 Tab 离开编辑区
    </div>
    <p v-if="formatError" class="editor-format-error" role="status">
      {{ formatError }}
    </p>
  </div>
</template>
