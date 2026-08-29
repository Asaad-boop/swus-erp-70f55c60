import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { playOrderSound, beepKaching } from "@/lib/erp/audio-feedback";

/**
 * Global listener: plays a chime + toast whenever a new order is inserted
 * for any brand the user has access to. Works from any ERP page.
 */
export function GlobalNewOrderNotifier() {
  const { brandIds, brands } = useBrand();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathRef = useRef(routerState.location.pathname);
  pathRef.current = routerState.location.pathname;
  const seenRef = useRef<Set<string>>(new Set());

  // Unlock WebAudio on first user interaction (browser autoplay policy)
  useEffect(() => {
    const silentUnlock = () => {
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (Ctx) {
          const c = new Ctx();
          if (c.state === "suspended") c.resume();
        }
      } catch { /* ignore */ }
      window.removeEventListener("pointerdown", silentUnlock);
      window.removeEventListener("keydown", silentUnlock);
    };
    window.addEventListener("pointerdown", silentUnlock, { once: true });
    window.addEventListener("keydown", silentUnlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", silentUnlock);
      window.removeEventListener("keydown", silentUnlock);
    };
  }, []);

  const brandsKey = brandIds.slice().sort().join(",");

  useEffect(() => {
    if (brandIds.length === 0) return;
    const allowed = new Set(brandIds);
    const brandName = (id: string | null) =>
      brands.find((b) => b.id === id)?.name ?? "";

    type OrderRowLite = {
      id: string;
      brand_id: string | null;
      total: number | null;
      invoice_no: string | null;
      shipping_name: string | null;
      guest_name: string | null;
      shipping_city: string | null;
      source: string | null;
      confirmation_status: string | null;
    };

    const announce = (row: OrderRowLite) => {
      if (!row.brand_id || !allowed.has(row.brand_id)) return;
      if (seenRef.current.has(row.id)) return;
      // Manual "Awaiting Confirmation" orders are not a sale yet — chime only
      // once someone confirms them over the phone.
      if (row.source === "manual" && row.confirmation_status !== "confirmed") return;
      seenRef.current.add(row.id);

      try { playOrderSound(); } catch { /* audio blocked until user interacts */ }

      const name = row.shipping_name ?? row.guest_name ?? "Customer";
      const city = row.shipping_city ? ` · ${row.shipping_city}` : "";
      const bn = brandName(row.brand_id);
      const total = `৳${Number(row.total ?? 0).toLocaleString()}`;
      const inv = row.invoice_no ? ` ${row.invoice_no}` : "";

      toast.success(`🎉 New Order!${inv} — ${total}`, {
        description: `${bn ? bn + " · " : ""}${name}${city}`,
        duration: 8000,
        className: "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/60",
        action: {
          label: "Open",
          onClick: () => navigate({ to: "/erp/orders/$orderId", params: { orderId: row.id } }),
        },
      });
    };

    const channel = supabase
      .channel(`global-new-orders-${brandsKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => announce(payload.new as OrderRowLite),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as OrderRowLite;
          const old = payload.old as Partial<OrderRowLite>;
          if (row.source !== "manual") return;
          if (row.confirmation_status !== "confirmed") return;
          if (old?.confirmation_status === "confirmed") return;
          announce(row);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [brandsKey, brandIds, brands, navigate]);


  return null;
}

// Re-export for settings UI convenience
export { beepKaching };