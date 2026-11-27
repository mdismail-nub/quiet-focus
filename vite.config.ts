// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

const isVercel = Boolean(process.env["VERCEL"]) || process.env["NITRO_PRESET"] === "vercel";
const nitroPreset = process.env["NITRO_PRESET"] || (isVercel ? "vercel" : "node-server");
const pwaOutDir = isVercel ? ".vercel/output/static" : ".output/public";

export default defineConfig({
  nitro: {
    preset: nitroPreset,
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  plugins: [
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      outDir: pwaOutDir,
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "pwa-maskable-512x512.png",
        "mascots/focus.jpg",
        "mascots/motivation.jpg",
        "mascots/complete.jpg",
        "mascots/break.jpg",
      ],
      manifest: {
        id: "/",
        name: "Focus — Quiet Focus Timer",
        short_name: "Focus",
        description: "A minimal focus timer with landscape immersive mode and offline support.",
        theme_color: "#f5f5f5",
        background_color: "#f5f5f5",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globDirectory: pwaOutDir,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,ico,png,jpg,svg,woff,woff2,webmanifest}"],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  vite: {
    server: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: true,
    },
  },
});
