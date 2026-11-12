import { createApp } from "vue";
import App from "./App.vue";
import router from "./router.js";
import "./style.css";
import { initializeTheme } from "./theme.js";
import { disablePageZoom } from "./page-zoom.js";
initializeTheme();
disablePageZoom();
createApp(App).use(router).mount("#app");
