import { useEffect } from "react";
import { isNativeApp, requestNativePermission, ensureBaseStructure } from "@/lib/native-fs";

/**
 * On the Android (Capacitor) app, ask once for storage permission and create
 * the "حالات مركز زركون" folder tree in the device file manager. No-op on web.
 */
export function NativeBootstrap() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isNativeApp())) return;
      try {
        const granted = await requestNativePermission();
        if (cancelled) return;
        if (granted) await ensureBaseStructure();
      } catch {
        /* silent — never block the app */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
