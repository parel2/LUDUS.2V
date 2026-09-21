import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        siswa: resolve(__dirname, "siswa.html"),
        kuis: resolve(__dirname, "kuis.html"),
        guru: resolve(__dirname, "guru.html"),
      },
    },
  },
});
