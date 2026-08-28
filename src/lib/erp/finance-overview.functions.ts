import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { isCapitalOutflow, refLabel, dhakaDay } from "@/lib/erp/finance-expense-classify";

const Input = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string(),
  to: z.string(),
});

const num = (v: unknown) => Number(v ?? 0) || 0;
const sum = <T>(arr: T[] | null | undefined, pick: (x: T) => number) =>
  (arr ?? []).reduce((s, x) => s + pick(x), 0);

export type FinanceOverview = {
  range: { from: string; to: string };
  capital: {
    total: number;
    liquid: number;
    inventory: number;
    receivableNet: number;
    breakdown: {
      cash: number; bank: number; mfs: number; inventory: number;
      codReceivable: number; arDue: number; importsAdvance: number;
      supplierPayable: number; importsDue: number; billsPayable: number;
    };
    productsMissingCost: number;
  };
  pnl: {
    revenue: number; cogs: number; gross: number;
    expense: number; otherIncome: number; net: number; margin: number;
    refundLoss: number;
    dailySeries: { date: string; revenue: number; expense: number; net: number }[];
  };
  accounts: { id: string; name: string; type: string; balance: number }[];
  inventoryByBrand: { brand_id: string; brand: string; value: number; units: number }[];
  receivables: {
    codByCourier: { provider: string; amount: number; orders: number }[];
    arTop: { name: string; phone: string | null; amount: number; orders: number }[];
    importsAdvanceTop: { po: string; supplier: string; amount: number }[];
  };
  payables: {
    supplierTop: { name: string; due: number }[];
    importsDueTop: { po: string; supplier: string; due: number; status: string }[];
    upcomingRecurring: { id: string; name: string; amount: number; next_run: string }[];
    topExpenseCats: { name: string; amount: number }[];
    overdueBills: number;
  };
  monthlySeries: { month: string; revenue: number; expense: number; net: number }[];
  recentTxns: { id: string; date: string; type: string; amount: number; description: string | null; account: string | null; category: string | null }[];
};

export const getFinanceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<FinanceOverview> => {
    const { supabase } = context;
    const { brandIds, from, to } = data;
    // Order timestamps are compared in Asia/Dhaka so the P&L window matches the
    // canonical COGS RPC (which buckets by Dhaka day).
    const fromTs = `${from}T00:00:00+06:00`;
    const toTs = `${to}T23:59:59.999+06:00`;

    // 12-month range for monthly series
    const now = new Date();
    const twelveStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const twelveIso = twelveStart.toISOString().slice(0, 10);

    // Daily P&L window (last 30 days inside range OR the range itself if smaller)
    const dailyStart = from;
    const dailyEnd = to;

    const [
      brandsRes, accRes, prodRes, varRes,
      rangeOrdRes, refundOrdRes, codOrdRes, arOrdRes,
      txnRes, recentRes, catsRes,
      billsRes, supplierRes,
      poRes, supForPoRes, recurringRes,
      monthlyOrdRes, monthlyTxnRes,
      dailyOrdRes, dailyTxnRes,
    ] = await Promise.all([
      supabase.from("brands").select("id,name").in("id", brandIds),
      applyBrandScope(supabase.from("erp_accounts").select("id,name,account_type,account_subtype,current_balance,brand_id").eq("is_active", true), brandIds, "brand_id", { includeNull: true }).order("current_balance", { ascending: false }),
      applyBrandScope(supabase.from("products").select("id,brand_id,stock,cost_price,price"), brandIds),
      supabase.from("product_variants").select("product_id,stock"),
      applyBrandScope(supabase.from("orders").select("total,subtotal,created_at").in("status", ["delivered", "partial_delivered", "paid"]), brandIds).gte("created_at", fromTs).lte("created_at", toTs),
      applyBrandScope(supabase.from("orders").select("total").in("status", ["returned", "paid_return", "unpaid_return", "partial_return"]), brandIds).gte("created_at", fromTs).lte("created_at", toTs),
      applyBrandScope(supabase.from("orders").select("total,id").in("status", ["shipped", "delivered", "partial_delivered"]), brandIds).limit(2000),
      applyBrandScope(supabase.from("orders").select("id,total,shipping_name,shipping_phone").in("status", ["delivered", "partial_delivered"]).eq("payment_status", "unpaid"), brandIds).limit(1000),
      applyBrandScope(supabase.from("erp_transactions").select("id,txn_type,amount,category_id,transaction_date,account_id,reference_type"), brandIds).gte("transaction_date", from).lte("transaction_date", to),
      applyBrandScope(supabase.from("erp_transactions").select("id,txn_type,amount,transaction_date,description,category_id,account_id"), brandIds).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(10),
      applyBrandScope(supabase.from("erp_expense_categories").select("id,name"), brandIds),
      applyBrandScope(supabase.from("erp_bills").select("amount,paid_amount,supplier_id,due_date,status"), brandIds).in("status", ["open", "partial", "overdue"]),
      applyBrandScope(supabase.from("erp_suppliers").select("id,name"), brandIds),
      applyBrandScope(supabase.from("imp_purchase_orders").select("id,po_number,supplier_id,grand_total_bdt,paid_bdt,due_bdt,status"), brandIds),
      applyBrandScope(supabase.from("erp_suppliers").select("id,name"), brandIds),
      applyBrandScope(supabase.from("erp_recurring_rules").select("id,name,amount,next_run_date").eq("is_active", true), brandIds).order("next_run_date", { ascending: true }).limit(20),
      applyBrandScope(supabase.from("orders").select("total,created_at").in("status", ["delivered", "partial_delivered", "paid"]), brandIds).gte("created_at", `${twelveIso}T00:00:00+06:00`),
      applyBrandScope(supabase.from("erp_transactions").select("amount,transaction_date,txn_type,reference_type"), brandIds).gte("transaction_date", twelveIso),
      applyBrandScope(supabase.from("orders").select("total,created_at").in("status", ["delivered", "partial_delivered", "paid"]), brandIds).gte("created_at", `${dailyStart}T00:00:00+06:00`).lte("created_at", `${dailyEnd}T23:59:59.999+06:00`),
      applyBrandScope(supabase.from("erp_transactions").select("amount,transaction_date,txn_type,reference_type"), brandIds).gte("transaction_date", dailyStart).lte("transaction_date", dailyEnd),
    ]);

    // Brand map
    const brandMap = new Map((brandsRes.data ?? []).map((b) => [b.id as string, b.name as string]));

    // Accounts
    const accounts = (accRes.data ?? []).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      type: a.account_type as string,
      subtype: (a as { account_subtype?: string | null }).account_subtype ?? null,
      balance: num(a.current_balance),
    }));
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const cash = accounts.filter((a) => a.type === "cash").reduce((s, a) => s + a.balance, 0);
    const bank = accounts.filter((a) => a.type === "bank").reduce((s, a) => s + a.balance, 0);
    const mfs = accounts.filter((a) => ["bkash", "nagad", "rocket", "mfs"].includes(a.type)).reduce((s, a) => s + a.balance, 0);
    // Authoritative COD Receivable = balance of dedicated COD Receivable wallets
    // (maintained by fn_post_order_delivery_to_finance + reconcile_courier_settlement).
    const codReceivableWallet = accounts
      .filter((a) => a.subtype === "receivable")
      .reduce((s, a) => s + a.balance, 0);

    // Inventory valuation (products use product.stock; variants stock summed under their parent product cost)
    const variantsByProduct = new Map<string, number>();
    for (const v of (varRes.data ?? []) as { product_id: string; stock: number | null }[]) {
      variantsByProduct.set(v.product_id, (variantsByProduct.get(v.product_id) ?? 0) + num(v.stock));
    }
    let productsMissingCost = 0;
    const inventoryByBrand = new Map<string, { value: number; units: number }>();
    for (const p of (prodRes.data ?? []) as { id: string; brand_id: string | null; stock: number | null; cost_price: number | null }[]) {
      const variantStock = variantsByProduct.get(p.id) ?? 0;
      const totalStock = num(p.stock) + variantStock;
      const cost = num(p.cost_price);
      if (cost <= 0 && totalStock > 0) productsMissingCost += 1;
      const bid = p.brand_id ?? "unknown";
      const cur = inventoryByBrand.get(bid) ?? { value: 0, units: 0 };
      cur.value += cost * totalStock;
      cur.units += totalStock;
      inventoryByBrand.set(bid, cur);
    }
    const inventoryByBrandArr = Array.from(inventoryByBrand.entries())
      .map(([brand_id, v]) => ({ brand_id, brand: brandMap.get(brand_id) ?? "Unknown", value: v.value, units: v.units }))
      .sort((a, b) => b.value - a.value);
    const inventoryValue = inventoryByBrandArr.reduce((s, x) => s + x.value, 0);

    // Revenue / refunds
    const revenue = sum(rangeOrdRes.data as { total: number }[] | null, (x) => num(x.total));
    const refundLoss = sum(refundOrdRes.data as { total: number }[] | null, (x) => num(x.total));

    // COD receivable = authoritative wallet balance (already netted for reconciled remittances)
    const codReceivable = codReceivableWallet;
    // Breakdown by courier: use in-flight orders (shipped + delivered-unpaid) purely for display.
    const codOrders = (codOrdRes.data ?? []) as { id: string; total: number }[];
    const codOrderMap = new Map(codOrders.map((o) => [o.id, num(o.total)]));
    const orderIds = codOrders.map((o) => o.id);
    const shippedOrderIds = new Set<string>();
    const codByCourier = new Map<string, { amount: number; orders: number }>();
    if (orderIds.length > 0) {
      const { data: ships } = await supabase
        .from("courier_shipments")
        .select("order_id,provider")
        .in("order_id", orderIds);
      const seen = new Set<string>();
      for (const s of (ships ?? []) as { order_id: string; provider: string | null }[]) {
        if (seen.has(s.order_id)) continue;
        seen.add(s.order_id);
        shippedOrderIds.add(s.order_id);
        const amt = codOrderMap.get(s.order_id) ?? 0;
        const provider = s.provider ?? "unknown";
        const cur = codByCourier.get(provider) ?? { amount: 0, orders: 0 };
        cur.amount += amt;
        cur.orders += 1;
        codByCourier.set(provider, cur);
      }
    }
    const codByCourierArr = Array.from(codByCourier.entries())
      .map(([provider, v]) => ({ provider, ...v }))
      .sort((a, b) => b.amount - a.amount);

    // AR = delivered+unpaid orders NOT already tracked by a courier shipment
    // (courier COD is captured in codReceivable wallet — avoid double count).
    const arMap = new Map<string, { name: string; phone: string | null; amount: number; orders: number }>();
    let arDue = 0;
    for (const o of (arOrdRes.data ?? []) as { id: string; total: number; shipping_name: string | null; shipping_phone: string | null }[]) {
      if (shippedOrderIds.has(o.id)) continue;
      const key = (o.shipping_phone || o.shipping_name || "Unknown").toString();
      const cur = arMap.get(key) ?? { name: o.shipping_name ?? "Unknown", phone: o.shipping_phone, amount: 0, orders: 0 };
      cur.amount += num(o.total);
      cur.orders += 1;
      arMap.set(key, cur);
      arDue += num(o.total);
    }
    const arTop = Array.from(arMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);

    // Transactions in range
    const txns = (txnRes.data ?? []) as { id: string; txn_type: string; amount: number; category_id: string | null; transaction_date: string; account_id: string | null; reference_type: string | null }[];
    // Capital / asset movements — cash leaves the wallet but it is NOT an
    // operating expense: stock purchases become COGS when sold, and dollar
    // top-ups sit in the ad wallet until the spend is actually consumed.
    const expense = txns
      .filter((t) => t.txn_type === "expense" && !isCapitalOutflow(t.reference_type))
      .reduce((s, t) => s + num(t.amount), 0);
    const capitalOutflow = txns
      .filter((t) => t.txn_type === "expense" && isCapitalOutflow(t.reference_type))
      .reduce((s, t) => s + num(t.amount), 0);
    const otherIncome = txns.filter((t) => t.txn_type === "income").reduce((s, t) => s + num(t.amount), 0);

    // Top expense categories (operating only, reference-aware labels)
    const catMap = new Map((catsRes.data ?? []).map((c) => [c.id as string, c.name as string]));
    const expByCat = new Map<string, number>();
    for (const t of txns) {
      if (t.txn_type !== "expense" || isCapitalOutflow(t.reference_type)) continue;
      const name = (t.category_id && catMap.get(t.category_id)) || refLabel(t.reference_type);
      expByCat.set(name, (expByCat.get(name) ?? 0) + num(t.amount));
    }
    const topExpenseCats = Array.from(expByCat.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Supplier payable from bills
    const supMap = new Map((supplierRes.data ?? []).map((s) => [s.id as string, s.name as string]));
    const supPayMap = new Map<string, number>();
    let supplierPayable = 0;
    let overdueBills = 0;
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const b of (billsRes.data ?? []) as { amount: number; paid_amount: number | null; supplier_id: string | null; due_date: string | null; status: string }[]) {
      const due = num(b.amount) - num(b.paid_amount);
      if (due <= 0) continue;
      supplierPayable += due;
      if (b.due_date && b.due_date < todayIso) overdueBills += due;
      if (b.supplier_id) {
        supPayMap.set(b.supplier_id, (supPayMap.get(b.supplier_id) ?? 0) + due);
      }
    }
    const supplierTop = Array.from(supPayMap.entries())
      .map(([id, due]) => ({ name: supMap.get(id) ?? "Unknown", due }))
      .sort((a, b) => b.due - a.due)
      .slice(0, 5);

    // Imports advance & due
    const supForPoMap = new Map((supForPoRes.data ?? []).map((s) => [s.id as string, s.name as string]));
    let importsAdvance = 0;
    let importsDueTotal = 0;
    const importsAdvanceList: { po: string; supplier: string; amount: number }[] = [];
    const importsDueList: { po: string; supplier: string; due: number; status: string }[] = [];
    for (const p of (poRes.data ?? []) as { po_number: string; supplier_id: string | null; grand_total_bdt: number; paid_bdt: number | null; due_bdt: number | null; status: string }[]) {
      const paid = num(p.paid_bdt);
      const due = num(p.due_bdt) > 0 ? num(p.due_bdt) : Math.max(num(p.grand_total_bdt) - paid, 0);
      const supplier = supForPoMap.get(p.supplier_id ?? "") ?? "Unknown";
      const notReceived = !["received", "completed", "closed"].includes(p.status);
      if (notReceived && paid > 0) {
        importsAdvance += paid;
        importsAdvanceList.push({ po: p.po_number, supplier, amount: paid });
      }
      if (due > 0) {
        importsDueTotal += due;
        importsDueList.push({ po: p.po_number, supplier, due, status: p.status });
      }
    }
    const importsAdvanceTop = importsAdvanceList.sort((a, b) => b.amount - a.amount).slice(0, 5);
    const importsDueTop = importsDueList.sort((a, b) => b.due - a.due).slice(0, 5);

    // Upcoming recurring (next 30 days)
    const thirty = new Date(); thirty.setDate(thirty.getDate() + 30);
    const thirtyIso = thirty.toISOString().slice(0, 10);
    const upcomingRecurring = ((recurringRes.data ?? []) as { id: string; name: string; amount: number; next_run_date: string | null }[])
      .filter((r) => r.next_run_date && r.next_run_date <= thirtyIso)
      .map((r) => ({ id: r.id, name: r.name, amount: num(r.amount), next_run: r.next_run_date! }));

    // Monthly series (12 mo)
    const months: { month: string; revenue: number; expense: number; net: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, revenue: 0, expense: 0, net: 0 });
    }
    const monthIdx = new Map(months.map((m, i) => [m.month, i]));
    for (const o of (monthlyOrdRes.data ?? []) as { total: number; created_at: string }[]) {
      const i = monthIdx.get(dhakaDay(o.created_at).slice(0, 7));
      if (i != null) months[i].revenue += num(o.total);
    }
    for (const t of (monthlyTxnRes.data ?? []) as { amount: number; transaction_date: string; txn_type: string; reference_type: string | null }[]) {
      if (t.txn_type !== "expense" || isCapitalOutflow(t.reference_type)) continue;
      const i = monthIdx.get(t.transaction_date.slice(0, 7));
      if (i != null) months[i].expense += num(t.amount);
    }
    for (const m of months) m.net = m.revenue - m.expense;

    // Daily P&L series within selected range
    const dailyMap = new Map<string, { revenue: number; expense: number }>();
    const startD = new Date(dailyStart);
    const endD = new Date(dailyEnd);
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      dailyMap.set(d.toISOString().slice(0, 10), { revenue: 0, expense: 0 });
    }
    for (const o of (dailyOrdRes.data ?? []) as { total: number; created_at: string }[]) {
      const k = dhakaDay(o.created_at);
      const cur = dailyMap.get(k); if (cur) cur.revenue += num(o.total);
    }
    for (const t of (dailyTxnRes.data ?? []) as { amount: number; transaction_date: string; txn_type: string; reference_type: string | null }[]) {
      if (t.txn_type !== "expense" || isCapitalOutflow(t.reference_type)) continue;
      const cur = dailyMap.get(t.transaction_date); if (cur) cur.expense += num(t.amount);
    }
    const dailySeries = Array.from(dailyMap.entries()).map(([date, v]) => ({ date, revenue: v.revenue, expense: v.expense, net: v.revenue - v.expense }));

    // COGS — canonical source (get_sku_profit): per delivered line, cost chain
    // unit_cost_snapshot → variant WAC → product WAC → cost_price. Never a
    // revenue-ratio heuristic, so Finance matches Marketing/Reports exactly.
    let cogs = 0;
    let cogsMissingUnits = 0;
    try {
      const { getBrandProfitTotals } = await import("@/lib/erp/marketing/canonical.server");
      const totals = await Promise.all(
        brandIds.map((bid) => getBrandProfitTotals(supabase, bid, from, to)),
      );
      for (const t of totals) {
        cogs += t.cogs;
        cogsMissingUnits += t.cost_missing_units;
      }
    } catch {
      cogs = 0;
    }
    const gross = revenue - cogs;
    // Net Profit = operating result only. "Other income" (capital injections,
    // loans, owner contributions, transfers in) is shown separately and must NOT
    // inflate profit — otherwise zero-sales periods would show huge profits
    // just because the user added opening balance.
    const net = revenue - cogs - expense;
    const margin = revenue > 0 ? (net / revenue) * 100 : 0;

    // Recent transactions
    const recentTxns = ((recentRes.data ?? []) as { id: string; txn_type: string; amount: number; transaction_date: string; description: string | null; category_id: string | null; account_id: string | null }[]).map((t) => ({
      id: t.id,
      date: t.transaction_date,
      type: t.txn_type,
      amount: num(t.amount),
      description: t.description,
      account: t.account_id ? accMap.get(t.account_id)?.name ?? null : null,
      category: t.category_id ? catMap.get(t.category_id) ?? null : null,
    }));

    const liquid = cash + bank + mfs;
    // Net receivable = money owed TO us (COD wallet + non-courier AR) minus what we owe.
    // Imports advance is a prepaid asset, not a receivable — kept in totalCapital only.
    const receivableNet = codReceivable + arDue - supplierPayable - importsDueTotal;
    const totalCapital = liquid + inventoryValue + codReceivable + arDue + importsAdvance - supplierPayable - importsDueTotal;

    return {
      range: { from, to },
      capital: {
        total: totalCapital,
        liquid,
        inventory: inventoryValue,
        receivableNet,
        breakdown: {
          cash, bank, mfs, inventory: inventoryValue,
          codReceivable, arDue, importsAdvance,
          supplierPayable, importsDue: importsDueTotal, billsPayable: supplierPayable,
        },
        productsMissingCost,
      },
      pnl: {
        revenue, cogs, gross, expense, otherIncome, net, margin, refundLoss,
        dailySeries,
      },
      accounts,
      inventoryByBrand: inventoryByBrandArr,
      receivables: { codByCourier: codByCourierArr, arTop, importsAdvanceTop },
      payables: { supplierTop, importsDueTop, upcomingRecurring, topExpenseCats, overdueBills },
      monthlySeries: months,
      recentTxns,
    };
  });

/* ---------------- KPI Drill-down ---------------- */

const DrilldownInput = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string(),
  to: z.string(),
  // "revenue" | "expense" | "income" | "all" — server interprets
  type: z.enum(["revenue", "expense", "income", "all"]).default("all"),
  accountIds: z.array(z.string().uuid()).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});

export type DrilldownRow = {
  id: string;
  date: string;
  type: string;
  amount: number;
  description: string | null;
  account: string | null;
  category: string | null;
  reference: string | null;
};

export type DrilldownResult = {
  rows: DrilldownRow[];
  total: number;
  page: number;
  pageSize: number;
  sum: number;
};

export const getDrilldownTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DrilldownInput.parse(d))
  .handler(async ({ data, context }): Promise<DrilldownResult> => {
    const { supabase } = context;
    const { brandIds, from, to, type, accountIds, page, pageSize } = data;

    let q = applyBrandScope(
      supabase.from("erp_transactions").select(
        "id,txn_type,amount,transaction_date,description,account_id,category_id,reference_type,reference_id",
        { count: "exact" },
      ),
      brandIds,
    )
      .gte("transaction_date", from)
      .lte("transaction_date", to);

    if (type === "revenue" || type === "income") q = q.eq("txn_type", "income");
    else if (type === "expense") q = q.eq("txn_type", "expense");

    if (accountIds && accountIds.length > 0) q = q.in("account_id", accountIds);

    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;

    const { data: rows, error, count } = await q
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(fromIdx, toIdx);
    if (error) throw error;

    const accountIdsInPage = Array.from(
      new Set((rows ?? []).map((r) => r.account_id).filter(Boolean) as string[]),
    );
    const categoryIds = Array.from(
      new Set((rows ?? []).map((r) => r.category_id).filter(Boolean) as string[]),
    );

    const [accRes, catRes] = await Promise.all([
      accountIdsInPage.length
        ? supabase.from("erp_accounts").select("id,name").in("id", accountIdsInPage)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      categoryIds.length
        ? supabase.from("erp_expense_categories").select("id,name").in("id", categoryIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const accMap = new Map((accRes.data ?? []).map((a) => [a.id, a.name]));
    const catMap = new Map((catRes.data ?? []).map((c) => [c.id, c.name]));

    // Sum across the whole filtered set (not just this page)
    let totalSum = 0;
    if (count && count > 0) {
      let sumQ = applyBrandScope(
        supabase.from("erp_transactions").select("amount"),
        brandIds,
      )
        .gte("transaction_date", from)
        .lte("transaction_date", to);
      if (type === "revenue" || type === "income") sumQ = sumQ.eq("txn_type", "income");
      else if (type === "expense") sumQ = sumQ.eq("txn_type", "expense");
      if (accountIds && accountIds.length > 0) sumQ = sumQ.in("account_id", accountIds);
      const { data: allAmts } = await sumQ.limit(10000);
      totalSum = (allAmts ?? []).reduce((s, r) => s + num((r as { amount: number }).amount), 0);
    }

    const mapped: DrilldownRow[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      date: r.transaction_date as string,
      type: r.txn_type as string,
      amount: num((r as { amount: number }).amount),
      description: (r.description as string | null) ?? null,
      account: r.account_id ? accMap.get(r.account_id as string) ?? null : null,
      category: r.category_id ? catMap.get(r.category_id as string) ?? null : null,
      reference: (r.reference_type as string | null)
        ? `${r.reference_type}${r.reference_id ? `:${String(r.reference_id).slice(0, 8)}` : ""}`
        : null,
    }));

    return {
      rows: mapped,
      total: count ?? mapped.length,
      page,
      pageSize,
      sum: totalSum,
    };
  });

/* ---------------- Cash Flow Statement (indirect method) ---------------- */

const CashflowInput = z.object({
  brandId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
});

export type CashflowLine = { name: string; amount: number };
export type CashflowStatement = {
  range: { from: string; to: string };
  operating: {
    netProfit: number;
    adjustments: CashflowLine[]; // depreciation, etc.
    workingCapital: CashflowLine[]; // ΔAR, ΔAP, ΔInventory
    total: number;
  };
  investing: {
    lines: CashflowLine[];
    total: number;
  };
  financing: {
    lines: CashflowLine[];
    total: number;
  };
  openingCash: number;
  closingCash: number;
  netChange: number;
  walletBalance: number; // for reconciliation check
  balanced: boolean;
};

type COA = {
  id: string; code: string; name: string;
  account_type: string; opening_balance: number | null;
};

// Categorize account based on type + name keywords
function classifyAccount(a: COA): "cash" | "ar" | "inventory" | "fixed_asset" | "other_asset"
  | "ap" | "loan" | "other_liability"
  | "equity" | "drawings"
  | "income" | "expense" | "depreciation" {
  const name = (a.name || "").toLowerCase();
  if (a.account_type === "income") return "income";
  if (a.account_type === "expense") {
    if (/deprec|amortiz/.test(name)) return "depreciation";
    return "expense";
  }
  if (a.account_type === "equity") {
    if (/draw|withdraw/.test(name)) return "drawings";
    return "equity";
  }
  if (a.account_type === "liability") {
    if (/loan|borrow|debt|mortgage/.test(name)) return "loan";
    if (/payable|bills|supplier|creditor|cod due|courier/.test(name)) return "ap";
    return "other_liability";
  }
  // asset
  if (/cash|bank|bkash|nagad|rocket|mfs|wallet|mobile/.test(name)) return "cash";
  if (/receivable|cod|debtor/.test(name)) return "ar";
  if (/inventory|stock|goods/.test(name)) return "inventory";
  if (/fixed|equipment|property|machinery|vehicle|furniture|building|land/.test(name)) return "fixed_asset";
  return "other_asset";
}

export const getCashflowStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CashflowInput.parse(d))
  .handler(async ({ data, context }): Promise<CashflowStatement> => {
    const { supabase } = context;
    const { brandId, from, to } = data;

    const [coaRes, periodRes, openingRes, walletRes] = await Promise.all([
      supabase.from("erp_chart_accounts")
        .select("id,code,name,account_type,opening_balance")
        .eq("brand_id", brandId).eq("is_archived", false),
      supabase.from("erp_journal_lines")
        .select("account_id,debit,credit,erp_journal_entries!inner(entry_date,brand_id,status)")
        .eq("brand_id", brandId)
        .gte("erp_journal_entries.entry_date", from)
        .lte("erp_journal_entries.entry_date", to)
        .eq("erp_journal_entries.status", "posted")
        .limit(50000),
      supabase.from("erp_journal_lines")
        .select("account_id,debit,credit,erp_journal_entries!inner(entry_date,brand_id,status)")
        .eq("brand_id", brandId)
        .lt("erp_journal_entries.entry_date", from)
        .eq("erp_journal_entries.status", "posted")
        .limit(50000),
      supabase.from("erp_accounts")
        .select("name,account_type,current_balance")
        .eq("brand_id", brandId).eq("is_active", true),
    ]);

    const accounts = (coaRes.data ?? []) as COA[];
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const classMap = new Map(accounts.map((a) => [a.id, classifyAccount(a)]));

    type Line = { account_id: string; debit: number | null; credit: number | null };
    const periodLines = (periodRes.data ?? []) as Line[];
    const openingLines = (openingRes.data ?? []) as Line[];

    // Helpers
    const normalChange = (klass: string, debit: number, credit: number) => {
      // For debit-normal accounts (asset, expense): change = debit - credit
      // For credit-normal (liability, equity, income): change = credit - debit
      const debitNormal = ["cash", "ar", "inventory", "fixed_asset", "other_asset", "expense", "depreciation", "drawings"];
      return debitNormal.includes(klass) ? debit - credit : credit - debit;
    };

    // Per-account net change in period & opening balance per class bucket
    const periodByAccount = new Map<string, { debit: number; credit: number }>();
    for (const l of periodLines) {
      const cur = periodByAccount.get(l.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += num(l.debit);
      cur.credit += num(l.credit);
      periodByAccount.set(l.account_id, cur);
    }
    const openingByAccount = new Map<string, { debit: number; credit: number }>();
    for (const l of openingLines) {
      const cur = openingByAccount.get(l.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += num(l.debit);
      cur.credit += num(l.credit);
      openingByAccount.set(l.account_id, cur);
    }

    // Aggregate by class
    const periodChange = new Map<string, number>();
    for (const a of accounts) {
      const klass = classMap.get(a.id)!;
      const p = periodByAccount.get(a.id) ?? { debit: 0, credit: 0 };
      const ch = normalChange(klass, p.debit, p.credit);
      periodChange.set(klass, (periodChange.get(klass) ?? 0) + ch);
    }

    // Net profit = income - expense (period)
    const incomePeriod = periodChange.get("income") ?? 0;
    const expensePeriod = periodChange.get("expense") ?? 0;
    const depreciationPeriod = periodChange.get("depreciation") ?? 0;
    const netProfit = incomePeriod - expensePeriod - depreciationPeriod;

    // Working capital changes (Δbalance during period)
    const deltaAR = periodChange.get("ar") ?? 0;            // ↑AR consumes cash
    const deltaInv = periodChange.get("inventory") ?? 0;     // ↑Inv consumes cash
    const deltaAP = periodChange.get("ap") ?? 0;             // ↑AP frees cash
    const deltaOtherLiab = periodChange.get("other_liability") ?? 0; // accrued exp etc.

    const operatingAdjustments: CashflowLine[] = [];
    if (Math.abs(depreciationPeriod) > 0.005) {
      operatingAdjustments.push({ name: "Depreciation & amortization", amount: depreciationPeriod });
    }
    const workingCapital: CashflowLine[] = [];
    if (Math.abs(deltaAR) > 0.005) workingCapital.push({ name: "Change in Accounts Receivable", amount: -deltaAR });
    if (Math.abs(deltaInv) > 0.005) workingCapital.push({ name: "Change in Inventory", amount: -deltaInv });
    if (Math.abs(deltaAP) > 0.005) workingCapital.push({ name: "Change in Accounts Payable", amount: deltaAP });
    if (Math.abs(deltaOtherLiab) > 0.005) workingCapital.push({ name: "Change in Other Liabilities", amount: deltaOtherLiab });

    const operatingTotal = netProfit
      + operatingAdjustments.reduce((s, l) => s + l.amount, 0)
      + workingCapital.reduce((s, l) => s + l.amount, 0);

    // Investing
    const deltaFixed = periodChange.get("fixed_asset") ?? 0;
    const deltaOtherAsset = periodChange.get("other_asset") ?? 0;
    const investingLines: CashflowLine[] = [];
    if (Math.abs(deltaFixed) > 0.005) investingLines.push({ name: "Change in Fixed Assets (net)", amount: -deltaFixed });
    if (Math.abs(deltaOtherAsset) > 0.005) investingLines.push({ name: "Change in Other Assets", amount: -deltaOtherAsset });
    const investingTotal = investingLines.reduce((s, l) => s + l.amount, 0);

    // Financing
    const deltaEquity = periodChange.get("equity") ?? 0;        // ↑Equity = capital injected
    const deltaLoan = periodChange.get("loan") ?? 0;             // ↑Loan = cash received
    const deltaDrawings = periodChange.get("drawings") ?? 0;     // ↑Drawings = cash out (debit-normal positive = withdrawal)
    const financingLines: CashflowLine[] = [];
    if (Math.abs(deltaEquity) > 0.005) financingLines.push({ name: "Owner Capital / Equity Change", amount: deltaEquity });
    if (Math.abs(deltaLoan) > 0.005) financingLines.push({ name: "Loan Movements (net)", amount: deltaLoan });
    if (Math.abs(deltaDrawings) > 0.005) financingLines.push({ name: "Owner Drawings", amount: -deltaDrawings });
    const financingTotal = financingLines.reduce((s, l) => s + l.amount, 0);

    // Opening cash = sum of (opening_balance + opening-period change) for cash-classified accounts
    let openingCash = 0;
    let cashChangeFromLedger = 0;
    for (const a of accounts) {
      if (classMap.get(a.id) !== "cash") continue;
      const o = openingByAccount.get(a.id) ?? { debit: 0, credit: 0 };
      openingCash += num(a.opening_balance) + (o.debit - o.credit);
      const p = periodByAccount.get(a.id) ?? { debit: 0, credit: 0 };
      cashChangeFromLedger += (p.debit - p.credit);
    }

    const netChange = operatingTotal + investingTotal + financingTotal;
    const closingCash = openingCash + netChange;

    // Reconciliation: compare to actual wallet (erp_accounts) balance
    const walletAccounts = (walletRes.data ?? []) as { account_type: string; current_balance: number | null }[];
    const walletBalance = walletAccounts
      .filter((w) => ["cash", "bank", "bkash", "nagad", "rocket", "mfs"].includes(w.account_type))
      .reduce((s, w) => s + num(w.current_balance), 0);

    // "Balanced" check — ledger-derived closing should match wallet within tolerance,
    // or at least match cash-account ledger movements.
    const balanced = Math.abs(cashChangeFromLedger - netChange) < 1;

    return {
      range: { from, to },
      operating: {
        netProfit,
        adjustments: operatingAdjustments,
        workingCapital,
        total: operatingTotal,
      },
      investing: { lines: investingLines, total: investingTotal },
      financing: { lines: financingLines, total: financingTotal },
      openingCash,
      closingCash,
      netChange,
      walletBalance,
      balanced,
    };
  });
