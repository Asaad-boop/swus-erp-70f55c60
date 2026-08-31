import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
   PO Activity / History timeline
   Purono data theke derive kora hoy (payments, releases, cartons)
   + activity_log e lekha manual event (shipping bill, edit, etc.)
   ============================================================ */

export type PoActivityEvent = {
  id: string;
  ts: string;
  group: "money" | "shipment" | "stock" | "plan" | "status";
  action: string;
  title: string;
  detail?: string | null;
  amount?: number | null;
  actor?: string | null;
  meta?: Record<string, any> | null;
};

const PAY_LABEL: Record<string, string> = {
  supplier_advance: "Supplier advance",
  supplier_payment: "Supplier payment",
  supplier_balance: "Supplier balance",
  shipping: "Shipping / freight payment",
  carton_release: "Carton release payment",
  local_courier: "Local courier payment",
  adjustment: "Adjustment",
};

const LOG_LABEL: Record<string, string> = {
  po_shipping_saved: "Shipping bill (PO level) update",
  po_carton_freight_saved: "Carton-wise freight bill",
  po_carton_freight_cleared: "Carton freight bill removed",
  po_updated: "PO edit kora hoyeche",
  po_carton_plan_saved: "Carton plan save",
  po_receive_mode_changed: "Receive mode change",
  po_received_bd: "BD te receive (bill entry)",
  po_payment_reversed: "Payment withdraw / reverse",
  import_carton_damaged: "Damaged qty log",
};

export const getPoActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string }) => z.object({ poId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const poId = data.poId;

    const [poRes, payRes, relRes, cartRes, histRes] = await Promise.all([
      sb.from("imp_purchase_orders")
        .select("id, po_number, created_at, created_by, status, shipping_cost_bdt")
        .eq("id", poId).maybeSingle(),
      sb.from("imp_payments")
        .select("id, payment_type, amount_bdt, payment_date, reference, notes, is_reversed, created_at, created_by, carton_id, wallet:wallet_id ( name )")
        .eq("po_id", poId),
      sb.from("imp_po_releases")
        .select("id, release_number, released_at, created_at, notes, shipping_charge_bdt, shipping_weight_kg, shipping_rate_per_kg, shipping_note, local_courier_bdt, local_delivery_bdt, qc_status, qc_at, qc_notes, items:imp_po_release_items ( quantity, qc_good_qty, qc_damaged_qty )")
        .eq("po_id", poId),
      sb.from("imp_cartons")
        .select("id, carton_number, status, expected_quantity, weight_kg, shipping_freight_bdt, shipping_billed_at, shipping_note, received_at, released_at, qc_at, posted_at, created_at")
        .eq("po_id", poId),
      sb.from("imp_status_history")
        .select("id, entity_type, entity_id, previous_status, new_status, action, notes, created_at, changed_by")
        .eq("entity_type", "po").eq("entity_id", poId).order("created_at", { ascending: false }).limit(200),
    ]);

    const cartonIds = (cartRes.data ?? []).map((c: any) => c.id);
    const logRes = await sb
      .from("activity_log")
      .select("id, entity_type, entity_id, action, details, performed_at, performed_by")
      .in("entity_id", [poId, ...cartonIds].slice(0, 200))
      .order("performed_at", { ascending: false })
      .limit(300);

    const events: PoActivityEvent[] = [];
    const actorIds = new Set<string>();
    const push = (e: PoActivityEvent) => { if (e.ts) events.push(e); };

    const po: any = poRes.data;
    if (po) {
      if (po.created_by) actorIds.add(po.created_by);
      push({
        id: `po-created`, ts: po.created_at, group: "plan", action: "po_created",
        title: "PO toiri kora hoyeche", detail: po.po_number, actor: po.created_by,
      });
    }

    for (const p of (payRes.data ?? []) as any[]) {
      if (p.created_by) actorIds.add(p.created_by);
      push({
        id: `pay-${p.id}`,
        ts: p.created_at || p.payment_date,
        group: "money",
        action: p.is_reversed ? "payment_reversed" : "payment",
        title: `${PAY_LABEL[p.payment_type] ?? p.payment_type}${p.is_reversed ? " (reversed)" : ""}`,
        detail: [p.wallet?.name, p.reference, p.notes].filter(Boolean).join(" · ") || null,
        amount: Number(p.amount_bdt || 0),
        actor: p.created_by,
        meta: { payment_date: p.payment_date, reversed: p.is_reversed, carton_id: p.carton_id },
      });
    }

    for (const r of (relRes.data ?? []) as any[]) {
      const qty = (r.items ?? []).reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);
      push({
        id: `rel-${r.id}`, ts: r.released_at || r.created_at, group: "stock", action: "release",
        title: `Release #${r.release_number} — ${qty} pcs`,
        detail: r.notes || null,
        meta: { qty },
      });
      if (Number(r.shipping_charge_bdt || 0) > 0) {
        push({
          id: `rel-ship-${r.id}`, ts: r.created_at || r.released_at, group: "shipment", action: "release_freight",
          title: `Release #${r.release_number} freight bill`,
          detail: [
            r.shipping_weight_kg ? `${r.shipping_weight_kg} kg × ${r.shipping_rate_per_kg}৳/kg` : null,
            r.shipping_note,
          ].filter(Boolean).join(" · ") || null,
          amount: Number(r.shipping_charge_bdt),
        });
      }
      const localCharge = Number(r.local_courier_bdt || 0) + Number(r.local_delivery_bdt || 0);
      if (localCharge > 0) {
        push({
          id: `rel-local-${r.id}`, ts: r.created_at || r.released_at, group: "shipment", action: "local_delivery",
          title: `Release #${r.release_number} local delivery charge`,
          amount: localCharge,
        });
      }
      if (r.qc_at) {
        const good = (r.items ?? []).reduce((s: number, i: any) => s + Number(i.qc_good_qty || 0), 0);
        const dmg = (r.items ?? []).reduce((s: number, i: any) => s + Number(i.qc_damaged_qty || 0), 0);
        push({
          id: `rel-qc-${r.id}`, ts: r.qc_at, group: "stock", action: "qc",
          title: `Release #${r.release_number} QC — ${good} ok${dmg ? `, ${dmg} damaged` : ""}`,
          detail: r.qc_notes || null,
        });
      }
    }

    for (const c of (cartRes.data ?? []) as any[]) {
      const n = `Carton #${c.carton_number}`;
      if (c.shipping_billed_at) {
        push({
          id: `ct-ship-${c.id}`, ts: c.shipping_billed_at, group: "shipment", action: "carton_freight",
          title: `${n} shipping bill`,
          detail: [c.weight_kg ? `${c.weight_kg} kg` : null, c.shipping_note].filter(Boolean).join(" · ") || null,
          amount: Number(c.shipping_freight_bdt || 0),
        });
      }
      if (c.received_at) push({ id: `ct-rec-${c.id}`, ts: c.received_at, group: "shipment", action: "carton_arrived", title: `${n} BD te arrived` });
      if (c.released_at) push({ id: `ct-rel-${c.id}`, ts: c.released_at, group: "shipment", action: "carton_released", title: `${n} release kora hoyeche` });
      if (c.qc_at) push({ id: `ct-qc-${c.id}`, ts: c.qc_at, group: "stock", action: "carton_qc", title: `${n} QC done` });
      if (c.posted_at) push({ id: `ct-post-${c.id}`, ts: c.posted_at, group: "stock", action: "carton_posted", title: `${n} inventory te post — ${c.expected_quantity ?? 0} pcs` });
    }

    for (const h of (histRes.data ?? []) as any[]) {
      if (h.changed_by) actorIds.add(h.changed_by);
      push({
        id: `hist-${h.id}`, ts: h.created_at, group: "status", action: h.action || "status_change",
        title: h.new_status ? `Status: ${h.previous_status ?? "—"} → ${h.new_status}` : (h.action || "Status update"),
        detail: h.notes || null, actor: h.changed_by,
      });
    }

    for (const l of (logRes.data ?? []) as any[]) {
      if (l.performed_by) actorIds.add(l.performed_by);
      const d = (l.details ?? {}) as any;
      push({
        id: `log-${l.id}`, ts: l.performed_at, group: (d.group as any) || "plan", action: l.action,
        title: d.title || LOG_LABEL[l.action] || l.action,
        detail: d.detail ?? null,
        amount: d.amount != null ? Number(d.amount) : null,
        actor: l.performed_by,
        meta: d,
      });
    }

    // actor names
    let names: Record<string, string> = {};
    if (actorIds.size > 0) {
      const { data: profs } = await sb.from("profiles").select("id, display_name").in("id", [...actorIds]);
      names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.display_name || "User"]));
    }

    events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    return {
      po_number: po?.po_number ?? null,
      events: events.map((e) => ({ ...e, actor: e.actor ? (names[e.actor] ?? "User") : null })),
    };
  });
