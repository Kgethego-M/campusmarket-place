import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],

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
    test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
    // Mocks only apply when running tests
    alias: {
      "@firebase/auth":      new URL("src/__mocks__/firebase.js", import.meta.url).pathname,
      "@firebase/firestore": new URL("src/__mocks__/firebase.js", import.meta.url).pathname,
    },
  },
}));
