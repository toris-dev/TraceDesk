import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const remoteDevHost = process.env.TAURI_DEV_HOST;
const isTauriBuild = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  base: isTauriBuild ? "./" : "/",
  server: {
    port: 5173,
    strictPort: true,
    host: remoteDevHost || "127.0.0.1",
    hmr: remoteDevHost
      ? {
          protocol: "ws",
          host: remoteDevHost,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts")) return "recharts";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/"))
            return "react";
        },
      },
    },
  },
});
