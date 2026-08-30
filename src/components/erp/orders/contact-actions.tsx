import { Copy, Phone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function copy(text: string, label: string) {
  if (!text) return;
  navigator.clipboard?.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error(`Failed to copy ${label.toLowerCase()}`),
  );
}

/** Normalize BD phone for wa.me — strip non-digits, drop leading 0, add 880 if missing. */
function waNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return "880" + digits.slice(1);
  if (digits.length === 10) return "880" + digits;
  return digits;
}

type BtnProps = {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  className?: string;
  children: React.ReactNode;
};
function IconBtn({ onClick, title, className, children }: BtnProps) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CopyIconBtn({ value, label, className }: { value: string; label: string; className?: string }) {
  if (!value) return null;
  return (
    <IconBtn onClick={() => copy(value, label)} title={`Copy ${label.toLowerCase()}`} className={className}>
      <Copy className="h-3 w-3" />
    </IconBtn>
  );
}

/** Phone action cluster: copy + call (tel:) + whatsapp. `onCall` fires when the call icon is clicked (e.g. to log an attempt). */
export function PhoneActions({ phone, className, onCall }: { phone: string; className?: string; onCall?: () => void }) {
  if (!phone) return null;
  const wa = waNumber(phone);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <CopyIconBtn value={phone} label="Phone" />
      <a
        href={`tel:${phone}`}
        onClick={(e) => { e.stopPropagation(); onCall?.(); }}
        title="Call"
        aria-label="Call"
        className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-emerald-500/15 text-muted-foreground hover:text-emerald-600 transition-colors"
      >
        <Phone className="h-3 w-3" />
      </a>
      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="WhatsApp"
          aria-label="WhatsApp"
          className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-green-500/15 text-muted-foreground hover:text-green-600 transition-colors"
        >
          <MessageCircle className="h-3 w-3" />
        </a>
      )}
    </span>
  );
}