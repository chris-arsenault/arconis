import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The in-app help reference bundles the user guides from the repository's docs folder.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), "../docs"] } },
  define: {
    __BUILD_REVISION__: JSON.stringify(process.env.GITHUB_SHA || "local"),
    // The Cognito library expects Node's name for the global object.
    global: "globalThis",
  },
  // The largest lazy chunk is the Azure icon set, loaded only when someone opens or searches it.
  build: { chunkSizeWarningLimit: 1800, license: { fileName: "licenses.txt" } },
});
