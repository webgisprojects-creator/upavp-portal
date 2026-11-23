import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Served by nginx under /AwasVikas/ (the login page redirects there), so every built asset URL needs that prefix.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // Where `npm run dev` sends /geoserver/*. Default = the pre-production portal: its nginx proxies the DEDICATED GeoServer (read-only
  // WMS/WFS/OWS only, with an edge cache), so local development sees exactly the layers and styles the live portal shows.
  // Do NOT point this at the shared GeoServer (162.245.218.6): it is busy with another portal and no longer receives our layer changes.
  // Override in apps/dashboard/.env.local: VITE_DEV_GEOSERVER_TARGET=http://host:port
  const geoserverTarget = env.VITE_DEV_GEOSERVER_TARGET?.trim() || "http://27.100.38.131:8070";

  return {
    plugins: [react()],
    base: "/AwasVikas/",
    server: {
      // Same-origin /geoserver/* like production (nginx proxies it there), so the browser needs no CORS.
      proxy: {
        // The search/chart API (apps/server). Start it with `npm run dev:server`.
        "/api": { target: env.VITE_DEV_API_TARGET?.trim() || "http://127.0.0.1:3001", changeOrigin: true },
        "/geoserver": {
          target: geoserverTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
