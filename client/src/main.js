import { createApp } from "vue";
import App from "./App.vue";
import router from "./router.js";
import "./style.css";
import { disablePageZoom } from "./page-zoom.js";
disablePageZoom();
createApp(App).use(router).mount("#app");
