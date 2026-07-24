import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import reservesData from "./src/worker/data/reserves.json";
import consumptionData from "./src/worker/data/consumption.json";
import { computeKeyFacts, keyFactTokens } from "./src/shared/keyFacts";

/**
 * index.html の {{TOKEN}} を reserves.json / consumption.json の算出値で置換する。
 * 危機連動数字（石油備蓄日数・LNG在庫日数・火力比率・依存率）の Single Source of Truth を
 * 静的メタ面（meta/OGP/JSON-LD/FAQ/noscript）にもビルド時に適用し、手動同期を根絶する。
 * dev サーバ・build 両方で走るため開発時もプレースホルダは露出しない。
 */
function injectKeyFacts(): Plugin {
  const tokens = keyFactTokens(computeKeyFacts(reservesData, consumptionData));
  return {
    name: "inject-key-facts",
    transformIndexHtml(html) {
      return html.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => tokens[key] ?? match);
    },
  };
}

export default defineConfig({
  plugins: [
    injectKeyFacts(),
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
