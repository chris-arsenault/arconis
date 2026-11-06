import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_REVISION__: JSON.stringify(process.env.GITHUB_SHA || "local") },
  build: { chunkSizeWarningLimit: 1200, license: { fileName: "licenses.txt" } },
});
