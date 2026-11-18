import { useCallback, useEffect, useRef, useState } from "react";
import { BarcodeFormat, BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CameraOff, Flashlight, ImagePlus, Loader2, ScanLine, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { beep, getScanEngine, type Engine } from "@/lib/erp/dispatch/scan-engine";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetect: (code: string) => void;
  /** Keep scanning after a hit (cooldown + same-code dedupe). */
  continuous?: boolean;
  /** Render as an embedded panel instead of a full-screen dialog. */
  inline?: boolean;
  /** Temporarily ignore detections (e.g. while an order is processing). */
  paused?: boolean;
};

const ZXING_FORMATS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
];

/**
 * Live camera barcode scanner.
 * Speed comes from: the fastest engine per device (native BarcodeDetector or
 * zxing-cpp WASM — see scan-engine.ts), decoding only the centre band where
 * the guide box is (a small crop instead of the full 1080p frame), only the
 * formats we use, one decode in flight per video frame, and an instant beep.
 */
export function CameraScanner({
  open,
  onClose,
  onDetect,
  continuous = false,
  inline = false,
  paused = false,
}: Props) {
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const lastHitRef = useRef<{ v: string; at: number }>({ v: "", at: 0 });
  const [flash, setFlash] = useState(0);
  const [zoomMax, setZoomMax] = useState(0);
  const [zoom, setZoom] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const runRef = useRef(0); // bumps on stop() so stale loops exit
  const doneRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  const fileRef = useRef<HTMLInputElement | null>(null);
  onDetectRef.current = onDetect;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);
  const [ready, setReady] = useState(false);
  const [engineKind, setEngineKind] = useState<string>("");

  const stop = useCallback(() => {
    runRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTorchOn(false);
    setCanTorch(false);
    setReady(false);
  }, []);

  const hit = useCallback((raw: string) => {
    const value = raw.trim();
    if (doneRef.current || !value) return;
    if (continuousRef.current) {
      if (pausedRef.current) return;
      const now = Date.now();
      if (now - lastHitRef.current.at < 700) return;
      if (value === lastHitRef.current.v && now - lastHitRef.current.at < 3000) return;
      lastHitRef.current = { v: value, at: now };
      beep(true);
      navigator.vibrate?.(40);
      setFlash((f) => f + 1);
      onDetectRef.current(value);
      return;
    }
    doneRef.current = true;
    runRef.current += 1;
    controlsRef.current?.stop();
    beep(true);
    navigator.vibrate?.([60, 30, 60]);
    onDetectRef.current(value);
  }, []);

  /** Decode loop: one detection per new video frame, centre-band crop. */
  const runLoop = useCallback(
    (engine: Engine) => {
      const run = runRef.current;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
      if (!ctx) return;
      let busy = false;
      let n = 0;

      const schedule = () => {
        const v = videoRef.current as
          (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }) | null;
        if (!v || run !== runRef.current || doneRef.current) return;
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick);
        else requestAnimationFrame(tick);
      };

      const tick = () => {
        const video = videoRef.current;
        if (!video || run !== runRef.current || doneRef.current) return;
        if (busy || pausedRef.current || video.readyState < 2 || !video.videoWidth) {
          schedule();
          return;
        }
        busy = true;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        // Most attempts: the band under the guide box. Every 4th: the whole frame,
        // so a code held off-centre or sideways still reads.
        const full = n++ % 4 === 3;
        const sw = full ? vw : Math.round(vw * 0.92);
        const sh = full ? vh : Math.round(Math.min(vh * 0.5, sw / 2));
        const sx = Math.round((vw - sw) / 2);
        const sy = Math.round((vh - sh) / 2);
        const scale = Math.min(1, 1280 / Math.max(sw, sh));
        canvas.width = Math.max(1, Math.round(sw * scale));
        canvas.height = Math.max(1, Math.round(sh * scale));
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        engine
          .detect(canvas)
          .then((results) => {
            const value = results.find((r) => r.rawValue)?.rawValue;
            if (value && run === runRef.current) hit(value);
          })
          .catch(() => undefined) // a blurred frame can fail; keep going
          .finally(() => {
            busy = false;
            schedule();
          });
      };
      schedule();
    },
    [hit],
  );

  /** Last resort if the WASM engine could not load. */
  const startZxing = useCallback(
    async (video: HTMLVideoElement, stream: MediaStream) => {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 40,
        delayBetweenScanSuccess: 250,
      });
      controlsRef.current = await reader.decodeFromStream(stream, video, (result) => {
        if (result) hit(result.getText());
      });
    },
    [hit],
  );

  const attachVideo = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element;
      if (!element || streamRef.current) return;
      doneRef.current = false;
      setStarting(true);
      setReady(false);
      setError(null);
      const enginePromise = getScanEngine(); // load in parallel with the camera

      void (async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
              window.isSecureContext === false
                ? "Camera চালাতে HTTPS প্রয়োজন। Preview বা published link থেকে খুলুন।"
                : "এই browser-এ camera support নেই।",
            );
          }

          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
              },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "environment" },
              audio: false,
            });
          }

          if (!videoRef.current || doneRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRef.current = stream;
          const video = videoRef.current;
          video.srcObject = stream;
          await video.play().catch(() => undefined);

          const track = stream.getVideoTracks()[0];
          if (track) {
            const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
              torch?: boolean;
              focusMode?: string[];
              exposureMode?: string[];
              zoom?: { min: number; max: number };
            };
            setCanTorch(Boolean(capabilities.torch));
            setZoomMax(
              capabilities.zoom?.max && capabilities.zoom.max > 1
                ? Math.min(capabilities.zoom.max, 4)
                : 0,
            );
            const advanced: Record<string, unknown>[] = [];
            if (capabilities.focusMode?.includes("continuous"))
              advanced.push({ focusMode: "continuous" });
            if (capabilities.exposureMode?.includes("continuous"))
              advanced.push({ exposureMode: "continuous" });
            if (advanced.length) {
              void track
                .applyConstraints({ advanced } as unknown as MediaTrackConstraints)
                .catch(() => undefined);
            }
          }

          setStarting(false);
          setReady(true);
          try {
            const engine = await enginePromise;
            if (!streamRef.current) return;
            setEngineKind(engine.kind === "native" ? "Native" : "Turbo");
            runLoop(engine);
          } catch {
            setEngineKind("Basic");
            await startZxing(video, stream);
          }
        } catch (caught) {
          setStarting(false);
          setReady(false);
          setError(
            caught instanceof DOMException && caught.name === "NotAllowedError"
              ? "Camera permission দেওয়া হয়নি। Browser settings থেকে camera Allow করুন।"
              : caught instanceof Error
                ? caught.message
                : "Camera চালু করা যায়নি।",
          );
        }
      })();
    },
    [runLoop, startZxing],
  );

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setCanTorch(false);
    }
  }

  async function cycleZoom() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomMax) return;
    const next = zoom >= zoomMax ? 1 : Math.min(zoomMax, zoom + 1);
    try {
      await track.applyConstraints({
        advanced: [{ zoom: next }],
      } as unknown as MediaTrackConstraints);
      setZoom(next);
    } catch {
      setZoomMax(0);
    }
  }

  async function scanImage(file: File | undefined) {
    if (!file || doneRef.current) return;
    try {
      const engine = await getScanEngine();
      const bitmap = await createImageBitmap(file);
      const results = await engine.detect(bitmap);
      const value = results.find((r) => r.rawValue)?.rawValue;
      if (!value) throw new Error("none");
      hit(value);
    } catch {
      setError("ছবিতে barcode পাওয়া যায়নি। পরিষ্কার ও কাছের ছবি দিয়ে আবার চেষ্টা করুন।");
    }
  }

  useEffect(() => {
    if (!open) stop();
    return stop;
  }, [open, stop]);

  const body = (
    <div className="relative isolate h-full overflow-hidden bg-foreground text-background">
      {!error && (
        <video
          ref={attachVideo}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />
      )}
      {flash > 0 && (
        <div
          key={flash}
          className="pointer-events-none absolute inset-0 z-30 bg-emerald-400/30 motion-safe:animate-out motion-safe:fade-out motion-safe:duration-500 fill-mode-forwards"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.08_0.02_260/0.72),transparent_24%,transparent_73%,oklch(0.08_0.02_260/0.88))]" />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                ready ? "bg-emerald-400 shadow-[0_0_12px_currentColor]" : "bg-amber-400",
              )}
            />
            {ready ? "Scanner ready" : "Starting camera"}
          </div>
          <p className="mt-0.5 text-[11px] text-background/65">
            Code 128 · QR · EAN{engineKind ? ` · ${engineKind}` : ""}
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-11 w-11 rounded-full bg-background/15 text-background backdrop-blur-md hover:bg-background/25"
          onClick={onClose}
          aria-label="Close scanner"
        >
          <X className="h-5 w-5" />
        </Button>
      </header>

      {error ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="rounded-full bg-background/10 p-5">
            <CameraOff className="h-10 w-10" />
          </div>
          <p className="max-w-xs text-sm leading-6 text-background/75">{error}</p>
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="mr-2 h-4 w-4" /> ছবি থেকে scan
          </Button>
        </div>
      ) : (
        <div className="absolute inset-x-5 top-1/2 z-10 -translate-y-1/2 [perspective:900px]">
          <div className="relative aspect-[1.7/1] [transform:rotateX(2deg)]">
            <div className="absolute inset-0 rounded-xl border border-background/25 shadow-[0_24px_80px_oklch(0_0_0/0.45),inset_0_0_45px_oklch(0_0_0/0.22)]" />
            <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-xl border-l-[3px] border-t-[3px] border-emerald-400" />
            <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-xl border-r-[3px] border-t-[3px] border-emerald-400" />
            <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-xl border-b-[3px] border-l-[3px] border-emerald-400" />
            <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-xl border-b-[3px] border-r-[3px] border-emerald-400" />
            {ready && (
              <div
                className={cn(
                  "absolute inset-x-3 top-1/2 h-px bg-emerald-300 shadow-[0_0_8px_2px_oklch(0.8_0.2_155/0.75)] motion-safe:animate-pulse",
                  paused && "bg-amber-300",
                )}
              />
            )}
            <div className="absolute inset-0 grid place-items-center">
              {starting ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <ScanLine className="h-8 w-8 text-background/40" />
              )}
            </div>
          </div>
          <div className="mx-auto -mt-1 h-5 w-[86%] rounded-[50%] bg-emerald-400/15 blur-lg" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-5 text-center">
          <p className="text-sm font-medium">Barcode-টা box-এর মধ্যে রাখুন</p>
          <p className="mt-1 text-xs text-background/60">Focus হলেই instant scan হবে</p>
        </div>
        <div className="flex items-center justify-center gap-4">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-12 w-12 rounded-full bg-background/15 text-background backdrop-blur-md hover:bg-background/25"
            onClick={() => fileRef.current?.click()}
            aria-label="Scan from image"
          >
            <ImagePlus className="h-5 w-5" />
          </Button>
          {canTorch ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className={cn(
                "h-16 w-16 rounded-full border-4 border-background/15",
                torchOn ? "bg-amber-400 text-foreground" : "bg-background text-foreground",
              )}
              onClick={toggleTorch}
              aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
            >
              <Flashlight className="h-6 w-6" />
            </Button>
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-full border-4 border-background/15 bg-background text-foreground">
              <Zap className="h-6 w-6" />
            </div>
          )}
          {zoomMax ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-12 w-12 rounded-full bg-background/15 text-xs font-bold text-background backdrop-blur-md hover:bg-background/25"
              onClick={() => void cycleZoom()}
              aria-label="Zoom"
            >
              {zoom}x
            </Button>
          ) : (
            <div className="h-12 w-12" />
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void scanImage(event.target.files?.[0])}
      />
    </div>
  );

  if (inline) {
    if (!open) return null;
    return <div className="h-[min(52dvh,380px)] overflow-hidden rounded-2xl">{body}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="h-dvh w-screen max-w-none border-0 bg-foreground p-0 text-background sm:h-[min(760px,92dvh)] sm:w-[min(460px,94vw)] sm:rounded-2xl [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Fast camera scanner</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}
