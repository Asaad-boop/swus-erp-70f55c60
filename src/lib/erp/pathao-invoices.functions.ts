import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const fetchPathaoInvoiceCsvFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        brandId: z.string().uuid().nullable().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: admin }, { data: acct }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "accountant" }),
    ]);
    if (!admin && !acct) throw new Error("Not authorized");

    const { loadPathaoCreds } = await import("./pathao.server");
    const { fetchPathaoInvoiceCsv } = await import("./pathao-invoices.server");
    const creds = await loadPathaoCreds(supabase, data.brandId ?? null);
    const res = await fetchPathaoInvoiceCsv(
      { username: creds.username, password: creds.password, store_id: creds.store_id },
      data.from,
      data.to,
    );
    return {
      csv: res.csv,
      invoiceIds: res.invoiceIds,
      attempts: res.attempts,
      filename: `pathao-auto_${data.from}_${data.to}.csv`,
    };
  });

/** List each payout invoice separately (no CSV download). */
export const listPathaoInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        brandId: z.string().uuid().nullable().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: admin }, { data: acct }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "accountant" }),
    ]);
    if (!admin && !acct) throw new Error("Not authorized");

    const { loadPathaoCreds } = await import("./pathao.server");
    const { listPathaoInvoices } = await import("./pathao-invoices.server");
    const creds = await loadPathaoCreds(supabase, data.brandId ?? null);
    return await listPathaoInvoices(
      { username: creds.username, password: creds.password, store_id: creds.store_id },
      data.from,
      data.to,
    );
  });

/** Download the CSV of a single invoice. */
export const fetchOnePathaoInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        brandId: z.string().uuid().nullable().optional(),
        invoiceId: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: admin }, { data: acct }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "accountant" }),
    ]);
    if (!admin && !acct) throw new Error("Not authorized");

    const { loadPathaoCreds } = await import("./pathao.server");
    const { fetchOnePathaoInvoiceCsv } = await import("./pathao-invoices.server");
    const creds = await loadPathaoCreds(supabase, data.brandId ?? null);
    const res = await fetchOnePathaoInvoiceCsv(
      { username: creds.username, password: creds.password, store_id: creds.store_id },
      data.invoiceId,
    );
    return { csv: res.csv, attempts: res.attempts, filename: `pathao-inv_${data.invoiceId}.csv` };
  });
