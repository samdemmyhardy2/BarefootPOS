import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Emits /sw.js with the built file list so the app shell opens without a connection. */
function offlineShell(): Plugin {
  return {
    name: "offline-shell",
    apply: "build",
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((file) => !file.endsWith(".map") && file !== "index.html").map((file) => `/${file}`);
      const files = ["/index.html", "/manifest.webmanifest", ...built];
      const version = createHash("sha256").update(files.join("|")).digest("hex").slice(0, 12);
      const source = readFileSync(new URL("./src/offline/sw.js", import.meta.url), "utf8")
        .replace("__PRECACHE__", JSON.stringify(files))
        .replace("__VERSION__", version);
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineShell()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
