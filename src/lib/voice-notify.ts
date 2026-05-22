/**
 * Client helper for playing AI-generated voice alerts via /api/tts.
 *
 * - Caches each phrase as an object-URL in memory so the same phrase doesn't
 *   hit ElevenLabs twice in a session.
 * - Queues playback so multiple alerts don't overlap.
 * - Silently no-ops if the browser blocks autoplay (no user gesture yet) —
 *   the next user click will satisfy the gesture and the queue resumes.
 */

const cache = new Map<string, string>(); // text -> object URL
const queue: string[] = [];               // texts pending playback
let playing = false;
let unlocked = false;

/** Mark that the user has interacted, allowing audio to autoplay. */
export function unlockVoice() {
  unlocked = true;
  void drain();
}

// Auto-unlock on first user interaction anywhere in the app.
if (typeof window !== "undefined") {
  const onFirst = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", onFirst);
    window.removeEventListener("keydown", onFirst);
    void drain();
  };
  window.addEventListener("pointerdown", onFirst, { once: true });
  window.addEventListener("keydown", onFirst, { once: true });
}

async function fetchAudio(text: string): Promise<string> {
  const hit = cache.get(text);
  if (hit) return hit;
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  cache.set(text, url);
  return url;
}

async function drain() {
  if (playing || !unlocked) return;
  const next = queue.shift();
  if (!next) return;
  playing = true;
  try {
    const url = await fetchAudio(next);
    const audio = new Audio(url);
    audio.preload = "auto";
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  } catch {
    /* ignore — best-effort */
  } finally {
    playing = false;
    if (queue.length) void drain();
  }
}

/** Enqueue a phrase to be spoken. Safe to call any time. */
export function speak(text: string) {
  const t = (text || "").trim();
  if (!t) return;
  queue.push(t);
  void drain();
}

/** Convert numbers 1..99 to spoken Arabic; falls back to digits for larger. */
export function arabicOrdinal(n: number): string {
  const ones = ["", "واحد", "اثنين", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
  const teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر",
    "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  if (n <= 0) return String(n);
  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  if (n < 100) {
    const t = Math.floor(n / 10), o = n % 10;
    return o === 0 ? tens[t] : `${ones[o]} و${tens[t]}`;
  }
  return String(n);
}
