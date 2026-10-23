import { createRouter, createWebHistory } from "vue-router";
import { store, ensureInitialized } from "./store.js";
import { afterLoginPath, loginLocation } from "./auth-routing.js";
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.path === from.path) return;
    return { top: 0 };
  },
  routes: [
    {
      path: "/profile",
      component: () => import("./views/Profile.vue"),
      meta: { title: "个人中心" },
    },
    {
      path: "/ai",
      component: () => import("./views/AiWorkspace.vue"),
      meta: { title: "AI 学习与历史" },
    },
    {
      path: "/admin",
      name: "admin",
      component: () => import("./views/Admin.vue"),
      meta: { title: "管理后台", admin: true },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("./components/AuthScreen.vue"),
      meta: { title: "登录与注册" },
    },
    {
      path: "/",
      component: () => import("./views/Dashboard.vue"),
      meta: { title: "学习概览" },
    },
    {
      path: "/learn/:id?",
      component: () => import("./views/Library.vue"),
      meta: { title: "知识资料库" },
    },
    {
      path: "/practice/:id?",
      component: () => import("./views/Practice.vue"),
      meta: { title: "面试题库" },
    },
    {
      path: "/labs/:id?",
      component: () => import("./views/Labs.vue"),
      meta: { title: "手写实验室" },
    },
    {
      path: "/mock",
      component: () => import("./views/Mock.vue"),
      meta: { title: "模拟面试" },
    },
    {
      path: "/review",
      component: () => import("./views/Review.vue"),
      meta: { title: "复习与收藏" },
    },
    {
      path: "/plan",
      component: () => import("./views/Plan.vue"),
      meta: { title: "学习计划" },
    },
    {
      path: "/sources",
      component: () => import("./views/Sources.vue"),
      meta: { title: "资料与数据" },
    },
    {
      path: "/:pathMatch(.*)*",
      component: () => import("./views/NotFound.vue"),
      meta: { title: "页面未找到" },
    },
  ],
});
router.beforeEach(async (to) => {
  await ensureInitialized();
  if (store.error) return true;
  if (!store.user && to.name !== "login") return loginLocation(to.fullPath);
  if (store.user && to.meta.admin && store.user.role !== "admin") return "/";
  if (store.user && to.name === "login")
    return afterLoginPath(to.query.redirect);
});
export default router;
