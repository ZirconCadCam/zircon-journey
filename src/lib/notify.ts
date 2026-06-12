/**
 * Professional, interactive notification toolkit for the role portals
 * (doctor / designer / technician).
 *
 * It combines three layers so an arriving case/data alert is impossible to
 * miss, in or out of the app:
 *   1. A synthesized "landline phone bell" ring that lasts ~5 seconds.
 *   2. A system notification that appears in the device's notification shade
 *      (Capacitor LocalNotifications on the native shell, Web Notifications on
 *      the browser / installed PWA).
 *   3. A visual in-app cue (handled by the caller via toast + bell badge).
 *
 * All audio/notification APIs require a prior user gesture; we unlock the
 * AudioContext on the first interaction (same approach as voice-notify).
 */

let audioCtx: AudioContext | null = null;
let unlocked = false;
let stopCurrent: (() => void) | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

// Unlock audio on the first user interaction anywhere in the app.
if (typeof window !== "undefined") {
  const onFirst = () => {
    unlocked = true;
    getCtx();
    window.removeEventListener("pointerdown", onFirst);
    window.removeEventListener("keydown", onFirst);
  };
  window.addEventListener("pointerdown", onFirst, { once: true });
  window.addEventListener("keydown", onFirst, { once: true });
}

/** Manually mark audio as unlocked (call inside a click handler). */
export function unlockNotificationAudio() {
  unlocked = true;
  getCtx();
}

/**
 * Play a classic landline "telephone bell" ring for `durationMs` (default 5s).
 * Returns a stop() function. A new ring cancels any ring already playing.
 */
export function playPhoneRing(durationMs = 5000): () => void {
  stopRing();
  const ctx = getCtx();
  if (!ctx) return () => {};
  try {
    const now = ctx.currentTime;
    const end = now + durationMs / 1000;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    // Two close sine tones → the metallic "warble" of an old phone bell.
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 480;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 620;
    osc1.connect(master);
    osc2.connect(master);

    // Bell trill cadence: short on/off bursts grouped into "brrring" rings.
    const burstOn = 0.32;
    const burstOff = 0.14;
    let t = now;
    while (t < end) {
      const peak = 0.28;
      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(peak, t + 0.015);
      master.gain.setValueAtTime(peak, Math.max(t + 0.015, t + burstOn - 0.04));
      master.gain.exponentialRampToValueAtTime(0.0001, t + burstOn);
      t += burstOn + burstOff;
    }

    osc1.start(now);
    osc2.start(now);
    osc1.stop(end + 0.05);
    osc2.stop(end + 0.05);

    const stop = () => {
      try {
        const c = audioCtx;
        if (c) master.gain.cancelScheduledValues(c.currentTime);
        master.gain.setValueAtTime(0.0001, audioCtx?.currentTime ?? 0);
        osc1.stop();
        osc2.stop();
      } catch { /* noop */ }
      master.disconnect();
    };
    stopCurrent = stop;
    window.setTimeout(() => {
      if (stopCurrent === stop) stopCurrent = null;
    }, durationMs + 100);
    return stop;
  } catch {
    return () => {};
  }
}

/** Stop any ring currently playing. */
export function stopRing() {
  if (stopCurrent) {
    try { stopCurrent(); } catch { /* noop */ }
    stopCurrent = null;
  }
}

/**
 * Ask for notification permission on both the native shell and the browser.
 * Returns true if notifications can be shown.
 */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  // Native (Capacitor) path — shows in the Android/iOS notification shade.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor?.isNativePlatform?.()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === "granted") return true;
      const req = await LocalNotifications.requestPermissions();
      return req.display === "granted";
    }
  } catch { /* fall through to web */ }
  // Web / PWA path.
  try {
    if ("Notification" in window) {
      if (Notification.permission === "granted") return true;
      if (Notification.permission === "denied") return false;
      const p = await Notification.requestPermission();
      return p === "granted";
    }
  } catch { /* noop */ }
  return false;
}

/** Current permission state without prompting. */
export function notificationPermissionState(): "granted" | "denied" | "default" | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as "granted" | "denied" | "default";
}

/**
 * Post a notification to the device notification shade. Uses Capacitor
 * LocalNotifications on the native shell (visible even with the app in the
 * background), and the Web Notifications API in the browser / PWA.
 */
export async function systemNotify(title: string, body: string) {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor?.isNativePlatform?.()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2147483647),
            title,
            body,
            schedule: { at: new Date(Date.now() + 80) },
            smallIcon: "ic_stat_icon",
          },
        ],
      });
      return;
    }
  } catch { /* fall through to web */ }
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "zircon-incoming",
        renotify: true,
      } as NotificationOptions);
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch { /* noop */ }
}

/**
 * Full "incoming data" alert: 5-second phone ring + device-shade notification.
 * The visual in-app cue (toast / badge) is handled by the caller.
 */
export function incomingAlert(opts: { title: string; body: string; ring?: boolean }) {
  if (opts.ring !== false) playPhoneRing(5000);
  void systemNotify(opts.title, opts.body);
}

/**
 * A short, pleasant ascending two-tone chime used for SYSTEM moments
 * (e.g. a case reaching "Ready" / "Completed"). Deliberately distinct from
 * the insistent landline ring of `playPhoneRing`, so users can tell a status
 * update apart from an incoming chat message by sound alone.
 */
export function playSystemChime(): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    // Ascending notes: G5 → C6 → E6 (a bright "ding-ding-ding").
    const notes = [784, 1047, 1319];
    notes.forEach((freq, i) => {
      const t = now + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(g);
      g.connect(master);
      master.gain.setValueAtTime(0.9, t);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  } catch { /* noop */ }
}

/**
 * SYSTEM moment alert (status change such as Ready / Completed). Plays the
 * distinct chime + posts a device-shade notification. Visual in-app cue
 * (toast / badge) is handled by the caller and should be styled differently
 * from chat-message alerts.
 */
export function systemMomentAlert(opts: { title: string; body: string; chime?: boolean }) {
  if (opts.chime !== false) playSystemChime();
  void systemNotify(opts.title, opts.body);
}

export { unlocked as audioUnlocked };
