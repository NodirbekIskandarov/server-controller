import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Yig'ilgan fayllar NestJS beradigan katalogga tushadi.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../backend/public", emptyOutDir: true, sourcemap: false },
  server: {
    port: 5174,
    proxy: { "/api": { target: "http://127.0.0.1:8200", changeOrigin: false } },
  },
});
