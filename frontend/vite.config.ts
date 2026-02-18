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
    port: 3025,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://172.168.1.95:3026",
        changeOrigin: true,
      },
    },
  },
});
