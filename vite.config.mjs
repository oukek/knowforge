import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  root: "client",
  plugins: [vue()],
  server: {
    port: Number(process.env.PORT || 6666),
    strictPort: true,
  },
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 700 },
});
