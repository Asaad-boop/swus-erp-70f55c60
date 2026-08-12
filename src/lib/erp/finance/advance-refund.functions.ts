import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.string().min(1),
  reference: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

/**
 * Refund a customer advance back out of the wallet it was received in.
 * Posts an expense transaction and decrements the account balance.
 */
export const refundOrderAdvanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { orderId, amount, method } = data;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, brand_id, invoice_no, advance_source")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Order not found");
    if (!order.brand_id) throw new Error("Order has no brand");

    // Already refunded? Stay idempotent.
    const { data: existing } = await supabase
      .from("erp_transactions")
      .select("id")
      .eq("reference_type", "order_advance_refund")
      .eq("reference_id", orderId)
      .maybeSingle();
    if (existing) return { alreadyRefunded: true, txnId: existing.id as string };

    const src = String(method || order.advance_source || "").toLowerCase();
    const accountName =
      src.includes("bkash") ? "bKash Advance" :
      src.includes("nagad") ? "Nagad Advance" :
      src.includes("rocket") ? "Rocket Advance" :
      "bKash Advance";

    const { data: account } = await supabase
      .from("erp_accounts")
      .select("id, current_balance")
      .eq("brand_id", order.brand_id)
      .eq("name", accountName)
      .maybeSingle();

    const desc = `Pre-order advance refund — ${order.invoice_no ?? orderId}${data.reference ? ` · ${method} ${data.reference}` : ` · ${method}`}${data.note ? ` · ${data.note}` : ""}`;

    const { data: txn, error: tErr } = await supabase
      .from("erp_transactions")
      .insert({
        brand_id: order.brand_id,
        txn_type: "expense",
        account_id: account?.id ?? null,
        amount,
        reference_type: "order_advance_refund",
        reference_id: orderId,
        description: desc,
        transaction_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);

    if (account) {
      await supabase
        .from("erp_accounts")
        .update({ current_balance: Number(account.current_balance ?? 0) - amount })
        .eq("id", account.id);
    }

    return { alreadyRefunded: false, txnId: txn.id as string, accountFound: !!account };
  });
