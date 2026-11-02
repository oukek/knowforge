<script setup>
import AppField from "./AppField.vue";
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import {
  store,
  lessons,
  questions,
  typeLabel,
  request,
  refreshCatalogIndex,
} from "../store";
import Icon from "./Icon.vue";
let returnFocus;
const query = ref(""),
  input = ref(null),
  router = useRouter();
const remoteResults = ref([]),
  searchError = ref(""),
  searching = ref(false);
let searchTimer,
  searchController,
  searchGeneration = 0;
let searchVersionChanged = false;
const results = computed(() => {
  const text = query.value.toLowerCase().trim();
  if (!text) return [];
  if (store.catalog?.summaryOnly) {
    const generated = store.generatedQuestions
      .filter((x) =>
        [x.prompt, x.answer, ...x.keywords]
          .join(" ")
          .toLowerCase()
          .includes(text),
      )
      .map((x) => ({
        id: x.id,
        title: x.prompt,
        kind: typeLabel[x.type],
        path: "/practice/" + x.id,
      }));
    return [...remoteResults.value, ...generated].slice(0, 40);
  }
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
function search() {
  clearTimeout(searchTimer);
  searchController?.abort();
  const generation = ++searchGeneration;
  remoteResults.value = [];
  searchError.value = "";
  searching.value = false;
  const text = query.value.trim();
  if (!store.searchOpen || !store.catalog?.summaryOnly || !text) return;
  searching.value = true;
  searchTimer = setTimeout(async () => {
    searchController = new AbortController();
    try {
      if (searchVersionChanged) {
        if (!(await refreshCatalogIndex()) || generation !== searchGeneration)
          return;
        searchVersionChanged = false;
      }
      const version = store.catalog.contentVersion;
      const params = new URLSearchParams({ q: text, v: version });
      const data = await request(
        `/catalog/search?${params}`,
        "GET",
        undefined,
        { signal: searchController.signal },
      );
      if (generation === searchGeneration) {
        if (store.catalog?.contentVersion !== version) {
          const error = new Error("学习资料已更新，请重新搜索。");
          error.code = "CATALOG_VERSION_CHANGED";
          throw error;
        }
        remoteResults.value = data.results;
      }
    } catch (error) {
      if (generation === searchGeneration && error.name !== "AbortError") {
        searchVersionChanged ||= error.code === "CATALOG_VERSION_CHANGED";
        searchError.value = error.message;
      }
    } finally {
      if (generation === searchGeneration) searching.value = false;
    }
  }, 200);
}
watch([query, () => store.searchOpen], search);
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
onUnmounted(() => {
  clearTimeout(searchTimer);
  searchController?.abort();
  window.removeEventListener("keydown", key);
});
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
          <Icon name="Search" /><AppField
            ref="input"
            v-model="query"
            placeholder="搜索知识点、题目与参考回答…"
            aria-label="搜索全部资料"
            maxlength="200"
          /><button class="icon-btn" @click="close" aria-label="关闭搜索">
            <Icon name="X" />
          </button>
        </div>
        <div class="search-results">
          <p v-if="!query" class="empty-inline">
            试试「并发」「setData」「闭包」或「提示注入」
          </p>
          <p
            v-else-if="searching && !results.length"
            class="empty-inline"
            role="status"
          >
            正在搜索…
          </p>
          <p v-else-if="searchError" class="empty-inline" role="alert">
            搜索失败：{{ searchError }}
            <button class="text-btn" @click="search">重试</button>
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
