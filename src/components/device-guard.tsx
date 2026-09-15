import { useEffect, useState } from "react";
import { ShieldOff } from "lucide-react";
import { registerDevice } from "@/lib/device-registry.functions";
import { getDeviceId, isDeviceBlocked } from "@/lib/device-registry";

/**
 * Registers the visiting device (so the administration can see it) and locks
 * the app behind a full-screen notice when that device has been blocked.
 */
export function DeviceGuard() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = getDeviceId();
    let cancelled = false;

    const ping = async () => {
      try {
        const res = await registerDevice({
          data: {
            deviceId: id,
            userAgent: navigator.userAgent.slice(0, 500),
            platform: (navigator as any).platform ?? undefined,
            path: window.location.pathname.slice(0, 300),
          },
        });
        if (!cancelled) setBlocked(Boolean(res?.blocked));
      } catch {
        try {
          const b = await isDeviceBlocked(id);
          if (!cancelled) setBlocked(b);
        } catch { /* offline */ }
      }
    };

    ping();
    const t = setInterval(ping, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-background p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-destructive/15">
          <ShieldOff className="size-8 text-destructive" />
        </div>
        <h1 className="text-xl font-bold">هذا الجهاز محظور</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          تم حظر هذا الجهاز من قبل إدارة المركز. للاستفسار يرجى التواصل مع الإدارة.
        </p>
      </div>
    </div>
  );
}
