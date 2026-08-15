import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ orderId: z.string().uuid() });

export const confirmOrderAdvanceReceivedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { orderId } = data;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, brand_id, advance_amount, advance_source, advance_payment_number, advance_txn_id, invoice_no")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Order not found");

    const amt = Number(order.advance_amount ?? 0);
    if (!amt || amt <= 0) throw new Error("No advance amount on this order");
    if (!order.advance_payment_number || String(order.advance_payment_number).trim().length < 4) {
      throw new Error("Payment number ID missing — enter it first");
    }
    if (!order.brand_id) throw new Error("Order has no brand");

    const { data: existing } = await supabase
      .from("erp_transactions")
      .select("id")
      .eq("reference_type", "order_advance")
      .eq("reference_id", orderId)
      .maybeSingle();
    if (existing) return { alreadyRecorded: true, txnId: existing.id };

    const source = String(order.advance_source ?? "").toLowerCase();
    const accountName =
      source.includes("bkash") ? "bKash Advance" :
      source.includes("nagad") ? "Nagad Advance" :
      source.includes("rocket") ? "Rocket Advance" :
      "bKash Advance";

    let { data: account } = await supabase
      .from("erp_accounts")
      .select("id, current_balance")
      .eq("brand_id", order.brand_id)
      .eq("name", accountName)
      .maybeSingle();

    if (!account) {
      const { data: created, error: cErr } = await supabase
        .from("erp_accounts")
        .insert({
          brand_id: order.brand_id,
          name: accountName,
          account_type: "bkash",
          account_subtype: "bkash",
          wallet_type: "mfs",
          opening_balance: 0,
          current_balance: 0,
          is_active: true,
          notes: "Customer advance payments",
        })
        .select("id, current_balance")
        .single();
      if (cErr) throw new Error(cErr.message);
      account = created;
    }

    const desc = `Order advance — ${order.invoice_no ?? orderId}${order.advance_payment_number ? ` · ${order.advance_source ?? ""} ${order.advance_payment_number}` : ""}`.trim();

    const { data: txn, error: tErr } = await supabase
      .from("erp_transactions")
      .insert({
        brand_id: order.brand_id,
        txn_type: "income",
        account_id: account.id,
        amount: amt,
        reference_type: "order_advance",
        reference_id: orderId,
        description: desc,
        transaction_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);

    // Balance is updated by the update_account_balance_on_txn trigger — no manual update here.
    return { alreadyRecorded: false, txnId: txn.id };
  });