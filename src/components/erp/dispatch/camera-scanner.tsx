import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CameraOff, Flashlight, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetect: (code: string) => void;
};

type AnyBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

const BARCODE_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "codabar",
  "data_matrix",
  "pdf417",
];

export function CameraScanner({ open, onClose, onDetect }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectorRef = useRef<AnyBarcodeDetector | null>(null);
  const doneRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
    setCanTorch(false);
  }, []);

  // Video element mounts inside the dialog portal — start the camera from a
  // callback ref so we never race the ref being null on first effect run.
  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (!el || streamRef.current) return;
      doneRef.current = false;
      setStarting(true);
      setError(null);

      void (async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
              window.isSecureContext === false
                ? "Camera needs HTTPS. Published/preview link (https) theke khulun."
                : "Ei browser e camera supported na.",
            );
          }
          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
          if (!videoRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          const v = videoRef.current;
          v.srcObject = stream;
          v.setAttribute("playsinline", "true");
          await v.play().catch(() => undefined);

          const track = stream.getVideoTracks()[0];
          const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
          setCanTorch(Boolean(caps.torch));

          const Ctor = (window as unknown as { BarcodeDetector?: new (o: unknown) => AnyBarcodeDetector })
            .BarcodeDetector;
          if (Ctor) {
            try {
              detectorRef.current = new Ctor({ formats: BARCODE_FORMATS });
            } catch {
              detectorRef.current = null;
            }
          }

          setStarting(false);
          timerRef.current = setInterval(tick, 180);
        } catch (e) {
          setStarting(false);
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "Camera permission deya hoyni. Browser settings theke camera allow korun."
              : e instanceof Error
                ? e.message
                : "Camera chalu kora jayni",
          );
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function tick() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || doneRef.current) return;
    if (v.readyState < 2 || !v.videoWidth) return;

    const detector = detectorRef.current;
    if (detector) {
      try {
        const found = await detector.detect(v);
        const raw = found?.[0]?.rawValue?.trim();
        if (raw) return hit(raw);
      } catch {
        detectorRef.current = null; // fall back to jsQR
      }
    }

    const w = Math.min(v.videoWidth, 720);
    const h = Math.round((v.videoHeight / v.videoWidth) * w);
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
    if (code?.data) hit(code.data.trim());
  }

  function hit(value: string) {
    if (doneRef.current || !value) return;
    doneRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    navigator.vibrate?.(60);
    onDetectRef.current(value);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as unknown as MediaTrackConstraints);
      setTorchOn((t) => !t);
    } catch {
      setCanTorch(false);
    }
  }

  useEffect(() => {
    if (!open) stop();
    return () => stop();
  }, [open, stop]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Camera Scanner</DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CameraOff className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="relative rounded-md overflow-hidden bg-black aspect-square">
            <video
              ref={attachVideo}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-8 border-2 border-emerald-400/80 rounded-md pointer-events-none" />
            {starting && (
              <div className="absolute inset-0 grid place-items-center bg-black/60 text-primary-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            {canTorch && (
              <Button
                type="button"
                size="sm"
                variant={torchOn ? "default" : "secondary"}
                className="absolute bottom-3 right-3"
                onClick={toggleTorch}
              >
                <Flashlight className="h-4 w-4 mr-1.5" /> {torchOn ? "Off" : "Light"}
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center">
          QR ba barcode camera-r samne dhorun — auto detect hobe.
        </p>
      </DialogContent>
    </Dialog>
  );
}
