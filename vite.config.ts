import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
  ],
  build: {
    target: "es2022",
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // React 19 エコシステム (React/React-DOM/scheduler/use-sync-external-store)
          // は同一チャンクに閉じる。circular 排除して初期化順を保証する。
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/") ||
            id.includes("/use-sync-external-store/")
          ) return "react-vendor";
          if (id.includes("react-router")) return "router-vendor";
          if (id.includes("topojson") || id.includes("world-atlas")) return "geo-vendor";
          if (id.includes("@use-gesture")) return "gesture-vendor";
          // その他の node_modules は Vite の自動分割に任せる（戻り値なし）
          return undefined;
        },
      },
    },
  },
});
