import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served by nginx under /AwasVikas/ (the login page redirects there), so every built asset URL needs that prefix.
export default defineConfig({
  plugins: [react()],
  base: "/AwasVikas/",
  server: {
    // Same-origin /geoserver/* like production (nginx proxies it there), so the browser needs no CORS.
    proxy: {
      "/geoserver": {
        target: "http://162.245.218.6:8080",
        changeOrigin: true,
      },
    },
  },
});
