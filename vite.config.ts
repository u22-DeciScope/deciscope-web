import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiProxyTarget = env.API_PROXY_TARGET || "http://127.0.0.1:9090";
  const wsProxyTarget = env.WS_PROXY_TARGET || apiProxyTarget.replace(/^http/, "ws");

  return {
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
    server: {
      host: "0.0.0.0",
      port: 5193,
      proxy: {
        "/api/v1/ws/transcript-segments": {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
        "/api/v1/transcript-segments": {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/ws": {
          target: wsProxyTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws/, ""),
        },
      },
    },
  };
});
