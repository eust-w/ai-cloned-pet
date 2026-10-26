import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: { ignored: ["**/.data/**", "**/.artifacts/**", "**/.playwright-mcp/**"] },
    proxy: {
      "/api": "http://127.0.0.1:4000"
    }
  },
  build: {
    outDir: "dist/web"
  }
});
