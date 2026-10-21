<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { store, lessons, questions, typeLabel } from "../store";
import Icon from "./Icon.vue";
let returnFocus;
const query = ref(""),
  input = ref(null),
  router = useRouter();
const results = computed(() => {
  const text = query.value.toLowerCase().trim();
  if (!text) return [];
  return [
    ...lessons.value.map((x) => ({
      id: x.id,
      title: x.title,
      kind: "知识讲解",
      path: "/learn/" + x.id,
      hay: [
        x.title,
        x.summary,
        ...x.keywords,
        ...x.sections.map((s) => s.content),
        x.playground?.code ?? "",
        ...(x.exercises ?? []).map((e) => e.prompt),
      ].join(" "),
    })),
    ...questions.value.map((x) => ({
      id: x.id,
      title: x.prompt,
      kind: typeLabel[x.type],
      path: x.type === "coding" ? "/labs/" + x.labId : "/practice/" + x.id,
      hay: [x.prompt, x.answer, ...x.keywords].join(" "),
    })),
  ]
    .filter((x) => x.hay.toLowerCase().includes(text))
    .slice(0, 40);
});
watch(
  () => store.searchOpen,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement;
      query.value = "";
      await nextTick();
      input.value?.focus();
    } else {
      await nextTick();
      returnFocus?.focus?.();
    }
  },
);
function close() {
  store.searchOpen = false;
}
function go(path) {
  close();
  router.push(path);
}
function key(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    store.searchOpen = !store.searchOpen;
  }
  if (e.key === "Escape") {
    close();
    store.sidebarOpen = false;
  }
  if (e.key === "Tab" && store.searchOpen) {
    const focusables = [
      ...document.querySelectorAll(
        ".search-dialog button,.search-dialog input",
      ),
    ];
    const first = focusables[0],
      last = focusables.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
}
onMounted(() => window.addEventListener("keydown", key));
onUnmounted(() => window.removeEventListener("keydown", key));
</script>
<template>
  <Teleport to="body"
    ><div v-if="store.searchOpen" class="modal-backdrop" @click.self="close">
      <section
        class="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
      >
        <div class="search-dialog-input">
          <Icon name="Search" /><input
            ref="input"
            v-model="query"
            placeholder="搜索知识点、题目与参考回答…"
            aria-label="搜索全部资料"
          /><button class="icon-btn" @click="close" aria-label="关闭搜索">
            <Icon name="X" />
          </button>
        </div>
        <div class="search-results">
          <p v-if="!query" class="empty-inline">
            试试「并发」「setData」「闭包」或「提示注入」
          </p>
          <p v-else-if="!results.length" class="empty-inline">
            没有匹配结果，试试更短的关键词。
          </p>
          <button
            v-for="r in results"
            :key="r.id"
            class="search-result"
            @click="go(r.path)"
          >
            <span class="badge subtle">{{ r.kind }}</span
            ><span>{{ r.title }}</span
            ><Icon name="ArrowUpRight" :size="16" />
          </button>
        </div>
        <footer class="muted tiny">
          搜索正文和答案 · 最多显示 40 条 · Esc 关闭
        </footer>
      </section>
    </div></Teleport
  >
</template>
