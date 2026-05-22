import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "CampusMarket",
        short_name: "CampusMarket",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],

  optimizeDeps: {
    include: ["firebase/app", "firebase/auth", "firebase/firestore"],
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/tests/setup.js",
    deps: {
      inline: ["firebase"],
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    alias: {
      "@firebase/auth":      new URL("src/__mocks__/firebase.js", import.meta.url).pathname,
      "@firebase/firestore": new URL("src/__mocks__/firebase.js", import.meta.url).pathname,
    },
  },
}));