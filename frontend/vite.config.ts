import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_REVISION__: JSON.stringify(process.env.GITHUB_SHA || "local") },
  // The largest lazy chunk is the Azure icon set, loaded only when someone opens or searches it.
  build: { chunkSizeWarningLimit: 1800, license: { fileName: "licenses.txt" } },
});
