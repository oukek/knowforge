<script setup>
import AppTooltip from "./components/AppTooltip.vue";
import { onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { store, init, dueReviews, signOut } from "./store";
import Icon from "./components/Icon.vue";
import { afterLoginPath, loginLocation } from "./auth-routing.js";
import SearchDialog from "./components/SearchDialog.vue";
import PlanOnboarding from "./components/PlanOnboarding.vue";
import "./ai.js";
const route = useRoute();
const router = useRouter();
const nav = [
  ["/", "LayoutDashboard", "学习概览"],
  ["/learn", "LibraryBig", "知识资料库"],
  ["/practice", "ListChecks", "面试题库"],
  ["/labs", "SquareTerminal", "手写实验室"],
  ["/mock", "Timer", "模拟面试"],
  ["/ai", "Sparkles", "AI 学习与历史"],
  ["/review", "RotateCcw", "复习与收藏"],
  ["/plan", "CalendarDays", "学习计划"],
];
const today = new Date().toLocaleDateString("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "long",
});
const active = (path) =>
  path === "/" ? route.path === "/" : route.path.startsWith(path);
const clockTick = setInterval(() => (store.now = Date.now()), 30000);
onUnmounted(() => clearInterval(clockTick));
watch(
  [
    () => route.fullPath,
    () => store.user?.id,
    () => store.loading,
    () => store.initialized,
    () => store.error,
  ],
  () => {
    store.sidebarOpen = false;
    document.title = `${store.user ? route.meta.title || "学习" : "登录与注册"} · KnowForge`;
    if (!store.initialized || store.loading || store.error) return;
    if (!store.user && route.name !== "login")
      void router.replace(loginLocation(route.fullPath));
    else if (store.user && route.name === "login")
      void router.replace(afterLoginPath(route.query.redirect));
  },
  { immediate: true },
);
</script>
<template>
  <AppTooltip />
  <PlanOnboarding />
  <main
    v-if="!store.user && (store.loading || store.error)"
    class="session-screen"
  >
    <div v-if="store.loading" class="loading-state" role="status">
      <div class="spinner"></div>
      <p>正在确认登录状态…</p>
    </div>
    <div v-else class="empty-state">
      <Icon name="Unplug" :size="36" />
      <h1>暂时无法连接学习服务</h1>
      <p>{{ store.error }}</p>
      <button class="btn primary" @click="init">重新连接</button>
    </div>
  </main>
  <RouterView v-else-if="!store.user" />
  <div v-else class="app-layout">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <div
      v-if="store.sidebarOpen"
      class="sidebar-scrim"
      @click="store.sidebarOpen = false"
    ></div>
    <aside
      id="app-sidebar"
      class="sidebar"
      :class="{ open: store.sidebarOpen }"
    >
      <RouterLink to="/" class="brand"
        ><span class="brand-mark"><span></span><span></span><span></span></span>
        <div>
          <strong>KnowForge<span class="brand-dot">.</span></strong
          ><small>知行实验室</small>
        </div></RouterLink
      >
      <div class="workspace-label">我的学习工作台 <span>PERSONAL</span></div>
      <nav aria-label="主要导航">
        <RouterLink
          v-for="[path, icon, label] in nav"
          :key="path"
          :to="path"
          :class="{ active: active(path) }"
          ><Icon :name="icon" :size="19" /><span>{{ label }}</span
          ><span
            v-if="path === '/review' && dueReviews.length"
            class="nav-counter"
            >{{ dueReviews.length }}</span
          ><span v-if="path === '/labs'" class="nav-new">JS</span></RouterLink
        >
      </nav>
      <div class="sidebar-guide">
        <div class="row">
          <Icon name="Sprout" :size="19" /><strong>理解之后，再向前一步</strong>
        </div>
        <p>读机制，写代码，讲清边界。<br />让每一次复习都有所收获。</p>
        <RouterLink to="/plan"
          >安排今天的学习 <Icon name="ArrowUpRight" :size="15"
        /></RouterLink>
      </div>
      <div class="sidebar-bottom">
        <RouterLink to="/profile" :class="{ active: active('/profile') }"
          ><Icon name="UserRound" :size="18" />个人中心</RouterLink
        >
        <RouterLink
          v-if="store.user?.role === 'admin'"
          :to="{ name: 'admin' }"
          :class="{ active: route.name === 'admin' }"
          ><Icon name="Server" :size="18" />管理后台</RouterLink
        >
        <RouterLink to="/sources" :class="{ active: active('/sources') }"
          ><Icon name="Database" :size="18" />资料来源与数据</RouterLink
        >
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="row">
          <button
            class="icon-btn mobile-menu"
            aria-label="打开导航"
            :aria-expanded="store.sidebarOpen"
            aria-controls="app-sidebar"
            @click="store.sidebarOpen = !store.sidebarOpen"
          >
            <Icon name="Menu" /></button
          ><span class="breadcrumb"
            >学习空间 <span>/</span>
            <strong>{{ route.meta.title }}</strong></span
          >
        </div>
        <div class="topbar-actions">
          <button class="search-trigger" @click="store.searchOpen = true">
            <Icon name="Search" :size="17" /><span>搜索知识与题目</span
            ><kbd>⌘ K</kbd></button
          ><span class="top-date">{{ today }}</span
          ><RouterLink
            to="/profile"
            class="account-name"
            aria-label="个人中心"
            :title="store.user?.displayName || store.user?.username"
            ><Icon name="UserRound" :size="16" /><span>{{
              store.user?.displayName || store.user?.username
            }}</span></RouterLink
          >
          <button v-if="store.user" class="btn small" @click="signOut">
            退出登录
          </button>
        </div>
      </header>
      <main id="main-content" class="main-content">
        <div v-if="store.loading" class="loading-state">
          <div class="spinner"></div>
          <p>正在整理你的学习工作台…</p>
        </div>
        <div v-else-if="store.error" class="empty-state">
          <Icon name="Unplug" :size="36" />
          <h1>暂时无法连接学习服务</h1>
          <p>{{ store.error }}</p>
          <p class="muted">请稍后重试，或联系站点维护者检查服务。</p>
          <button class="btn primary" @click="init">重新连接</button>
        </div>
        <RouterView v-else :key="store.user?.id" />
      </main>
      <footer class="app-footer">
        <span>学会解释，也学会验证。</span
        ><span>资料整理于 2026.10 · 自建练习资料，非官方题库</span>
      </footer>
    </div>
    <SearchDialog v-if="store.catalog" />
    <div v-if="store.toast" class="toast" role="status">
      <Icon name="Info" :size="18" />{{ store.toast }}
    </div>
  </div>
</template>
