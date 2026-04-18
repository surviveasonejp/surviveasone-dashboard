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
          if (id.includes("node_modules")) {
            if (id.includes("react-router")) return "router-vendor";
            if (id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
            if (id.includes("topojson") || id.includes("world-atlas")) return "geo-vendor";
            if (id.includes("@use-gesture")) return "gesture-vendor";
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
});
