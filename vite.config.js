import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Use the same mock for both imports
      "@firebase/auth": path.resolve(__dirname, "src/__mocks__/firebase.js"),
      "@firebase/firestore": path.resolve(__dirname, "src/__mocks__/firebase.js"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/tests/setup.js",
    deps: {
      inline: ["firebase"],
    },
  },
});