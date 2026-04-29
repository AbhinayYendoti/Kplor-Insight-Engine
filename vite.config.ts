import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 8080,
    proxy: {
      // All /api/* requests are forwarded to FastAPI — no CORS issues
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
