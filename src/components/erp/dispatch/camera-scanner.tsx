import { useCallback, useEffect, useRef, useState } from "react";
import { BarcodeFormat, BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CameraOff, Flashlight, ImagePlus, Loader2, ScanLine, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

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

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorApi = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorApi;
  getSupportedFormats?: () => Promise<string[]>;
};

const NATIVE_FORMATS = [
  "qr_code", "code_128", "code_39", "code_93", "ean_13", "ean_8",
  "itf", "upc_a", "upc_e", "codabar", "data_matrix", "pdf417",
];

const ZXING_FORMATS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.ITF,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417,
];

export function CameraScanner({ open, onClose, onDetect, continuous = false, inline = false, paused = false }: Props) {
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
  const frameRef = useRef<number | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const detectorRef = useRef<BarcodeDetectorApi | null>(null);
  const doneRef = useRef(false);
  const detectingRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const onDetectRef = useRef(onDetect);
  const fileRef = useRef<HTMLInputElement | null>(null);
  onDetectRef.current = onDetect;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current = null;
    detectingRef.current = false;
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
      if (now - lastHitRef.current.at < 1200) return;
      if (value === lastHitRef.current.v && now - lastHitRef.current.at < 3500) return;
      lastHitRef.current = { v: value, at: now };
      navigator.vibrate?.(45);
      setFlash((f) => f + 1);
      onDetectRef.current(value);
      return;
    }
    doneRef.current = true;
    controlsRef.current?.stop();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    navigator.vibrate?.([70, 30, 70]);
    onDetectRef.current(value);
  }, []);

  const runNativeLoop = useCallback(() => {
    const scan = async (time: number) => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (doneRef.current || !video || !detector) return;

      if (!detectingRef.current && video.readyState >= 2 && time - lastAttemptRef.current >= 85) {
        lastAttemptRef.current = time;
        detectingRef.current = true;
        try {
          const results = await detector.detect(video);
          const value = results[0]?.rawValue;
          if (value) {
            hit(value);
            if (!continuousRef.current) return;
          }
        } catch {
          // A single blurred frame can fail; keep the live loop running.
        } finally {
          detectingRef.current = false;
        }
      }
      frameRef.current = requestAnimationFrame(scan);
    };
    frameRef.current = requestAnimationFrame(scan);
  }, [hit]);

  const startZxing = useCallback(async (video: HTMLVideoElement, stream: MediaStream) => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 65,
      delayBetweenScanSuccess: 250,
    });
    controlsRef.current = await reader.decodeFromStream(stream, video, (result) => {
      if (result) hit(result.getText());
    });
  }, [hit]);

  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (!element || streamRef.current) return;
    doneRef.current = false;
    setStarting(true);
    setReady(false);
    setError(null);

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(window.isSecureContext === false
            ? "Camera চালাতে HTTPS প্রয়োজন। Preview বা published link থেকে খুলুন।"
            : "এই browser-এ camera support নেই।");
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 60 },
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
        await video.play();

        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
            torch?: boolean;
            focusMode?: string[];
            zoom?: { min: number; max: number };
          };
          setCanTorch(Boolean(capabilities.torch));
          setZoomMax(capabilities.zoom?.max && capabilities.zoom.max > 1 ? Math.min(capabilities.zoom.max, 4) : 0);
          const advanced: Record<string, unknown>[] = [];
          if (capabilities.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" });
          if (advanced.length) {
            await track.applyConstraints({ advanced } as unknown as MediaTrackConstraints).catch(() => undefined);
          }
        }

        const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
        if (Detector) {
          const supported = await Detector.getSupportedFormats?.().catch(() => NATIVE_FORMATS);
          const formats = supported ? NATIVE_FORMATS.filter((format) => supported.includes(format)) : NATIVE_FORMATS;
          detectorRef.current = new Detector(formats.length ? { formats } : undefined);
        }

        setStarting(false);
        setReady(true);
        if (detectorRef.current) runNativeLoop();
        else await startZxing(video, stream);
      } catch (caught) {
        setStarting(false);
        setReady(false);
        setError(
          caught instanceof DOMException && caught.name === "NotAllowedError"
            ? "Camera permission দেওয়া হয়নি। Browser settings থেকে camera Allow করুন।"
            : caught instanceof Error
              ? caught.message
              : "Camera চালু করা যায়নি।",
        );
      }
    })();
  }, [runNativeLoop, startZxing]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
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
      await track.applyConstraints({ advanced: [{ zoom: next }] } as unknown as MediaTrackConstraints);
      setZoom(next);
    } catch {
      setZoomMax(0);
    }
  }

  async function scanImage(file: File | undefined) {
    if (!file || doneRef.current) return;
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const url = URL.createObjectURL(file);
      try {
        const result = await reader.decodeFromImageUrl(url);
        hit(result.getText());
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setError("ছবিতে barcode পাওয়া যায়নি। পরিষ্কার ও কাছের ছবি দিয়ে আবার চেষ্টা করুন।");
    }
  }

  useEffect(() => {
    if (!open) stop();
    return stop;
  }, [open, stop]);

  const body = (
        <div className="relative isolate h-full overflow-hidden bg-foreground text-background">
          {!error && (
            <video ref={attachVideo} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
          )}
          {flash > 0 && (
            <div key={flash} className="pointer-events-none absolute inset-0 z-30 bg-emerald-400/30 motion-safe:animate-out motion-safe:fade-out motion-safe:duration-500 fill-mode-forwards" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.08_0.02_260/0.72),transparent_24%,transparent_73%,oklch(0.08_0.02_260/0.88))]" />

          <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn("h-2 w-2 rounded-full", ready ? "bg-emerald-400 shadow-[0_0_12px_currentColor]" : "bg-amber-400")} />
                {ready ? "Scanner ready" : "Starting camera"}
              </div>
              <p className="mt-0.5 text-[11px] text-background/65">Code 128 · QR · EAN · Waybill</p>
            </div>
            <Button type="button" size="icon" variant="secondary" className="h-11 w-11 rounded-full bg-background/15 text-background backdrop-blur-md hover:bg-background/25" onClick={onClose} aria-label="Close scanner">
              <X className="h-5 w-5" />
            </Button>
          </header>

          {error ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="rounded-full bg-background/10 p-5"><CameraOff className="h-10 w-10" /></div>
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
                {ready && <div className={cn("absolute inset-x-3 top-1/2 h-px bg-emerald-300 shadow-[0_0_8px_2px_oklch(0.8_0.2_155/0.75)] motion-safe:animate-pulse", paused && "bg-amber-300")} />}
                <div className="absolute inset-0 grid place-items-center">
                  {starting ? <Loader2 className="h-7 w-7 animate-spin" /> : <ScanLine className="h-8 w-8 text-background/40" />}
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
              <Button type="button" size="icon" variant="secondary" className="h-12 w-12 rounded-full bg-background/15 text-background backdrop-blur-md hover:bg-background/25" onClick={() => fileRef.current?.click()} aria-label="Scan from image">
                <ImagePlus className="h-5 w-5" />
              </Button>
              {canTorch ? (
                <Button type="button" size="icon" variant="secondary" className={cn("h-16 w-16 rounded-full border-4 border-background/15", torchOn ? "bg-amber-400 text-foreground" : "bg-background text-foreground")} onClick={toggleTorch} aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}>
                  <Flashlight className="h-6 w-6" />
                </Button>
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-full border-4 border-background/15 bg-background text-foreground"><Zap className="h-6 w-6" /></div>
              )}
              {zoomMax ? (
                <Button type="button" size="icon" variant="secondary" className="h-12 w-12 rounded-full bg-background/15 text-xs font-bold text-background backdrop-blur-md hover:bg-background/25" onClick={() => void cycleZoom()} aria-label="Zoom">
                  {zoom}x
                </Button>
              ) : (
                <div className="h-12 w-12" />
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void scanImage(event.target.files?.[0])} />
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