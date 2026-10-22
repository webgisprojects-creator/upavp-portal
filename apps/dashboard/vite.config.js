import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/AwasVikas/",
  server: {
    proxy: {
      "/geoserver": {
        target: "http://162.245.218.6:8080",
        changeOrigin: true,
      },
    },
  },
});