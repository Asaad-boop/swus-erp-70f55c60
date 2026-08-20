/**
 * Dispatch floor feedback — distinct tones per stage + haptics + mute setting.
 * Kept separate from the global order sounds so packers can mute the scanner
 * without losing the new-order chime elsewhere.
 */

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, when = 0, dur = 0.1, type: OscillatorType = "sine", level = 0.2) {
  const a = ac();
  if (!a) return;
  const start = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(level, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

const MUTE_KEY = "erp.dispatch.muted";

export function isDispatchMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}
export function setDispatchMuted(v: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUTE_KEY, v ? "1" : "0");
}

export type FeedbackKind = "pack" | "ready" | "ship" | "error" | "duplicate" | "undo";

export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

/** Play the stage cue + matching haptic. Respects the mute setting for sound only. */
export function dispatchFeedback(kind: FeedbackKind) {
  switch (kind) {
    case "pack":
      vibrate(35);
      break;
    case "ready":
      vibrate(45);
      break;
    case "ship":
      vibrate([40, 60, 90]);
      break;
    case "error":
      vibrate([90, 60, 90]);
      break;
    case "duplicate":
      vibrate([25, 40, 25]);
      break;
    default:
      vibrate(20);
  }
  if (isDispatchMuted()) return;
  switch (kind) {
    case "pack":
      tone(740, 0, 0.09, "sine", 0.2);
      tone(988, 0.07, 0.12, "sine", 0.16);
      break;
    case "ready":
      tone(880, 0, 0.08, "triangle", 0.2);
      tone(1174, 0.07, 0.14, "triangle", 0.16);
      break;
    case "ship":
      tone(659, 0, 0.08, "sine", 0.2);
      tone(880, 0.08, 0.08, "sine", 0.2);
      tone(1318, 0.17, 0.24, "sine", 0.22);
      break;
    case "error":
      tone(200, 0, 0.22, "square", 0.16);
      tone(150, 0.12, 0.22, "square", 0.14);
      break;
    case "duplicate":
      tone(420, 0, 0.09, "square", 0.12);
      tone(420, 0.13, 0.09, "square", 0.12);
      break;
    case "undo":
      tone(600, 0, 0.08, "sine", 0.14);
      tone(420, 0.07, 0.12, "sine", 0.14);
      break;
  }
}

/** Unlock WebAudio on the first user gesture (mobile Safari/Chrome). */
export function primeAudio() {
  ac();
}
