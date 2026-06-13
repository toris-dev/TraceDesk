import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// TAURI_DEV_HOST는 모바일/원격 dev 전용. 데스크톱에서는 localhost만 바인딩해 외부 노출 방지.
const remoteDevHost = process.env.TAURI_DEV_HOST;

// Tauri 프로덕션 WebView는 절대 경로(/assets)로 리소스를 못 찾아 크래시함 → 상대 경로 필수
const isTauriBuild = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  base: isTauriBuild ? "./" : "/",
  server: {
    port: 5173,
    strictPort: true,
    // localhost(127.0.0.1)만 수신 — 공인 IP/0.0.0.0 바인딩 없음
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
  },
});
