import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  root: "client",
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.FRONTEND_PORT || 16666),
    strictPort: true,
  },
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 700 },
});
