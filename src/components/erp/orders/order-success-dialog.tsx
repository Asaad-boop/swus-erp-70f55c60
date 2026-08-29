import { useEffect } from "react";
import { CheckCircle2, Copy, FileText, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  open: boolean;
  invoiceNo?: string | null;
  orderId?: string | null;
  onView: () => void;
  onNew: () => void;
  /** Order was saved unconfirmed and waits for the call team. */
  awaiting?: boolean;
};

export function OrderSuccessDialog({ open, invoiceNo, orderId, onView, onNew, awaiting = false }: Props) {
  // ESC to view order
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onView();
      if (e.key === "Enter") onView();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onView]);

  if (!open) return null;

  const copy = async () => {
    if (!invoiceNo) return;
    await navigator.clipboard.writeText(invoiceNo);
    toast.success("Invoice number copied");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      {/* backdrop */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onView} />

      {/* confetti sparkles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <Sparkles
            key={i}
            className="absolute h-4 w-4 text-emerald-300 opacity-0"
            style={{
              left: `${10 + (i * 6) % 80}%`,
              top: `${15 + (i * 11) % 70}%`,
              animation: `os-spark 1.4s ease-out ${i * 60}ms forwards`,
            }}
          />
        ))}
      </div>

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-emerald-200/50 bg-background shadow-2xl animate-scale-in">
        {/* gradient strip */}
        <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500" />

        <div className="px-6 pb-6 pt-7 text-center">
          {/* check ring */}
          <div className="relative mx-auto mb-4 h-20 w-20">
            <div className="absolute inset-0 rounded-full bg-emerald-100 dark:bg-emerald-950/40 animate-os-ping" />
            <div className="absolute inset-2 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-os-pop" strokeWidth={2.5} />
            </div>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {awaiting ? "Awaiting Confirmation" : "Order Created!"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {awaiting
              ? "অর্ডারটি সেভ হয়েছে — কল করে confirm করার জন্য অপেক্ষা করছে"
              : "অর্ডারটি সফলভাবে তৈরি হয়েছে"}
          </p>
          {awaiting && (
            <p className="mx-auto mt-3 max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Confirmation queue: Web Orders → Processing. Confirm করার আগে কোনো SMS যাবে না।
            </p>
          )}

          {invoiceNo && (
            <div className="mt-5 rounded-xl border border-dashed border-emerald-300/60 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <p className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Invoice Number
              </p>
              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="font-mono text-2xl font-bold tracking-wide text-emerald-700 dark:text-emerald-300">
                  {invoiceNo}
                </span>
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-md p-1.5 text-emerald-700/70 transition hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/50"
                  aria-label="Copy invoice number"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1" onClick={onNew}>
              <Plus className="mr-1.5 h-4 w-4" /> New Order
            </Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onView}>
              <FileText className="mr-1.5 h-4 w-4" /> View Order
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes os-ping {
          0%   { transform: scale(0.8); opacity: 0.6; }
          80%  { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes os-pop {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes os-spark {
          0%   { transform: translateY(0) scale(0.5) rotate(0deg); opacity: 0; }
          30%  { opacity: 1; }
          100% { transform: translateY(-60px) scale(1.1) rotate(180deg); opacity: 0; }
        }
        .animate-os-ping { animation: os-ping 1.4s ease-out infinite; }
        .animate-os-pop  { animation: os-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>
    </div>
  );
}