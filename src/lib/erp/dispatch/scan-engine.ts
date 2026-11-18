/**
 * Fast barcode engine for the phone camera.
 *
 * - Android Chrome: the platform BarcodeDetector (hardware-accelerated).
 * - iPhone / browsers without it: zxing-cpp compiled to WebAssembly via the
 *   `barcode-detector` ponyfill — several times faster than zxing-js and much
 *   better on thin Code 128 invoice barcodes. The .wasm ships with the app
 *   (no CDN) and is fetched the first time a scanner is opened, or earlier
 *   through warmScanner().
 *
 * Only the formats we print or receive are enabled: fewer formats = faster.
 */

export type Detected = { rawValue: string };
export type Engine = {
  kind: "native" | "wasm";
  detect: (source: CanvasImageSource) => Promise<Detected[]>;
};

type NativeDetectorCtor = {
  new (options?: { formats?: string[] }): { detect: (s: CanvasImageSource) => Promise<Detected[]> };
  getSupportedFormats?: () => Promise<string[]>;
};

/** Invoice labels are Code 128; courier waybills are Code 128 / QR; product boxes EAN-13. */
export const SCAN_FORMATS = ["code_128", "qr_code", "code_39", "ean_13"] as const;

let enginePromise: Promise<Engine> | null = null;

async function nativeEngine(): Promise<Engine | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? [];
    if (!supported.includes("code_128")) return null;
    const formats = SCAN_FORMATS.filter((f) => supported.includes(f));
    const d = new Ctor({ formats: [...formats] });
    return { kind: "native", detect: (s) => d.detect(s) };
  } catch {
    return null;
  }
}

async function wasmEngine(): Promise<Engine> {
  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  const wasmUrl = (wasm as { default: string }).default;
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? wasmUrl : prefix + path,
    },
    fireImmediately: true,
  });
  const d = new BarcodeDetector({ formats: [...SCAN_FORMATS] });
  return { kind: "wasm", detect: (s) => d.detect(s as never) };
}

/** Resolve (once) the fastest engine this device supports. */
export function getScanEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => (await nativeEngine()) ?? (await wasmEngine()))();
    enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  return enginePromise;
}

/** Start loading the engine in the background (call when a scan page mounts). */
export function warmScanner() {
  if (typeof window === "undefined") return;
  const run = () => void getScanEngine().catch(() => undefined);
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 300);
}

// ── instant audio confirmation ─────────────────────────────────────────────
let audio: AudioContext | null = null;

/** Call from a user gesture (e.g. the camera button) so iOS allows sound later. */
export function unlockBeep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* ignore */
  }
}

export function beep(ok = true) {
  try {
    if (!audio) unlockBeep();
    if (!audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "square";
    osc.frequency.value = ok ? 1650 : 330;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.09 : 0.25));
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + (ok ? 0.1 : 0.26));
  } catch {
    /* ignore */
  }
}
