import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
    server: {
      host: "0.0.0.0",
      port: 5193,
      proxy: {
        "/api": {
          target: env.API_PROXY_TARGET || "http://127.0.0.1:9090",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/ws": {
          target: env.WS_PROXY_TARGET || "ws://127.0.0.1:9090",
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws/, ""),
        },
      },
    },
  };
});
