import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev: proxy API calls so the browser sees a single origin (no CORS in dev).
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } },
  },
});
