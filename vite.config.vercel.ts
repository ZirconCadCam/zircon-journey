// Vercel-only build config. Lovable keeps using vite.config.ts (unchanged).
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart(),
    nitro({ preset: "vercel" }),
    viteReact(),
  ],
});
