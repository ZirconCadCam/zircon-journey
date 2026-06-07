import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Android (APK) build of "مركز زركون".
 *
 * The app is SSR-rendered (TanStack Start on Cloudflare). Rather than ship a
 * static client bundle, the native shell loads the live published web app and
 * Capacitor injects the native bridge so the Filesystem / FileOpener / Share
 * plugins work on top of it. Update `server.url` if your published URL changes.
 *
 * Build steps (run locally after exporting to GitHub):
 *   1. npm install
 *   2. npx cap add android
 *   3. npx cap sync android
 *   4. open android/ in Android Studio → Build → Generate Signed Bundle/APK
 */
const config: CapacitorConfig = {
  appId: "app.lovable.zirconcenter",
  appName: "حالات مركز زركون",
  // For a hosted SSR app we point the native shell at the published site.
  // If you later produce a static client build, set this to "dist" and remove `server`.
  webDir: "dist",
  server: {
    url: "https://zircon-journey.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  plugins: {
    Filesystem: {
      // Surfaces the app's Documents folder in the device file manager.
      androidIsPublicStorage: true,
    },
  },
};

export default config;
