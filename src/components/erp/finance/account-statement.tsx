/**
 * Account statement: every transaction of one account with search, filters,
 * running balance, in/out totals, CSV export and a balance check (does the
 * stored balance equal opening + all entries?).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Download, Loader2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { dhakaToday, fmtBdt, type Account } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";

type Txn = {
  id: string;
  txn_type: string;
  amount: number;
  transaction_date: string;
  description: string | null;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
};

type Row = Txn & {
  signed: number;
  balance: number;
  category: string | null;
  counterpart: string | null;
  invoice: string | null;
  orderStatus: string | null;
  by: string | null;
};

const VOID_STATUSES = new Set(["cancelled", "fake", "returned", "unpaid_return", "paid_return"]);

type Preset = "all" | "today" | "7d" | "month" | "last_month" | "custom";

function monthBounds(offset: number) {
  const [y, m] = dhakaToday().split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const end = new Date(Date.UTC(y, m + offset, 0));
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

function rangeFor(p: Preset, from: string, to: string): [string | null, string | null] {
  const today = dhakaToday();
  if (p === "today") return [today, today];
  if (p === "7d") {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 6);
    return [d.toISOString().slice(0, 10), today];
  }
  if (p === "month") return monthBounds(0) as [string, string];
  if (p === "last_month") return monthBounds(-1) as [string, string];
  if (p === "custom") return [from || null, to || null];
  return [null, null];
}

async function fetchAll(accountId: string): Promise<Txn[]> {
  const out: Txn[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase
      .from("erp_transactions")
      .select(
        "id, txn_type, amount, transaction_date, description, account_id, to_account_id, category_id, reference_type, reference_id, created_by, created_at",
      )
      .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Txn[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function AccountStatement({
  wallet,
  accounts,
  onClose,
}: {
  wallet: Account | null;
  accounts: Account[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const data = useQuery({
    queryKey: ["wallet_statement", wallet?.id],
    enabled: !!wallet,
    queryFn: async () => {
      const txns = await fetchAll(wallet!.id);
      const catIds = [...new Set(txns.map((t) => t.category_id).filter(Boolean))] as string[];
      const orderIds = [
        ...new Set(
          txns.filter((t) => (t.reference_type ?? "").startsWith("order") && t.reference_id).map((t) => t.reference_id!),
        ),
      ];
      const userIds = [...new Set(txns.map((t) => t.created_by).filter(Boolean))] as string[];
      const chunk = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

      const cats = new Map<string, string>();
      for (const c of chunk(catIds)) {
        const { data: rows } = await supabase.from("erp_expense_categories").select("id,name").in("id", c);
        (rows ?? []).forEach((r) => cats.set(r.id, r.name));
      }
      const orders = new Map<string, { invoice_no: string | null; status: string }>();
      for (const c of chunk(orderIds)) {
        const { data: rows } = await supabase.from("orders").select("id,invoice_no,status").in("id", c);
        (rows ?? []).forEach((r) => orders.set(r.id, { invoice_no: r.invoice_no, status: r.status as string }));
      }
      const users = new Map<string, string>();
      for (const c of chunk(userIds)) {
        const { data: rows } = await supabase.from("profiles").select("id,display_name").in("id", c);
        (rows ?? []).forEach((r) => users.set(r.id, r.display_name ?? ""));
      }
      return { txns, cats, orders, users };
    },
  });

  const acctName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  // Running balance, oldest → newest, starting from the opening balance.
  const all: Row[] = useMemo(() => {
    if (!data.data || !wallet) return [];
    const { txns, cats, orders, users } = data.data;
    let bal = Number(wallet.opening_balance ?? 0);
    return txns.map((t) => {
      const amt = Number(t.amount);
      let signed = 0;
      if (t.txn_type === "income") signed = Math.abs(amt);
      else if (t.txn_type === "expense") signed = -Math.abs(amt);
      else if (t.txn_type === "transfer") signed = t.to_account_id === wallet.id ? Math.abs(amt) : -Math.abs(amt);
      else if (t.txn_type === "adjustment") signed = amt;
      bal += signed;
      const order = t.reference_id ? orders.get(t.reference_id) : undefined;
      const other = t.txn_type === "transfer" ? (t.to_account_id === wallet.id ? t.account_id : t.to_account_id) : null;
      return {
        ...t,
        signed,
        balance: bal,
        category: t.category_id ? (cats.get(t.category_id) ?? null) : null,
        counterpart: other ? (acctName.get(other) ?? "other account") : null,
        invoice: order?.invoice_no ?? null,
        orderStatus: order?.status ?? null,
        by: t.created_by ? (users.get(t.created_by) ?? null) : null,
      };
    });
  }, [data.data, wallet, acctName]);

  const computed = all.length ? all[all.length - 1].balance : Number(wallet?.opening_balance ?? 0);
  const stored = Number(wallet?.current_balance ?? 0);
  const mismatch = Math.round((stored - computed) * 100) / 100;

  const [rFrom, rTo] = rangeFor(preset, from, to);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const num = Number(needle.replace(/[,৳\s]/g, ""));
    return all
      .filter((r) => {
        if (rFrom && r.transaction_date < rFrom) return false;
        if (rTo && r.transaction_date > rTo) return false;
        if (dir === "in" && r.signed <= 0) return false;
        if (dir === "out" && r.signed >= 0) return false;
        if (!needle) return true;
        if (!Number.isNaN(num) && num > 0 && Math.abs(r.signed) === num) return true;
        return [r.description, r.category, r.counterpart, r.invoice, r.by, r.txn_type, r.transaction_date]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle));
      })
      .reverse();
  }, [all, q, dir, rFrom, rTo]);

  const totIn = rows.reduce((s, r) => s + (r.signed > 0 ? r.signed : 0), 0);
  const totOut = rows.reduce((s, r) => s + (r.signed < 0 ? -r.signed : 0), 0);

  const exportCsv = () => {
    const head = ["Date", "Type", "Description", "Category / With", "Invoice", "In", "Out", "Balance", "Entered by"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [
        r.transaction_date,
        r.txn_type,
        r.description,
        r.category ?? r.counterpart,
        r.invoice,
        r.signed > 0 ? r.signed : "",
        r.signed < 0 ? -r.signed : "",
        r.balance.toFixed(2),
        r.by,
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${wallet?.name ?? "account"}-statement.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const presets: Array<{ k: Preset; label: string }> = [
    { k: "all", label: "সব" },
    { k: "today", label: "আজ" },
    { k: "7d", label: "৭ দিন" },
    { k: "month", label: "এই মাস" },
    { k: "last_month", label: "গত মাস" },
    { k: "custom", label: "তারিখ বাছুন" },
  ];

  return (
    <Dialog
      open={!!wallet}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setQ("");
          setDir("all");
          setPreset("all");
        }
      }}
    >
      <DialogContent className="flex max-h-[90dvh] max-w-5xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-2">
            {wallet?.name}
            <span className="font-mono text-base">{fmtBdt(stored)}</span>
            <span className="text-xs font-normal text-muted-foreground">· {all.length} এন্ট্রি</span>
          </DialogTitle>
        </DialogHeader>

        {/* Balance check */}
        {!data.isLoading && wallet && (
          Math.abs(mismatch) >= 0.01 ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <b>হিসাব মিলছে না।</b> Account-এ দেখাচ্ছে {fmtBdt(stored)}, কিন্তু Opening {fmtBdt(wallet.opening_balance)} + সব এন্ট্রি
                যোগ করলে হয় {fmtBdt(computed)} — পার্থক্য <b>{fmtBdt(mismatch)}</b>। সম্ভবত কোনো এক সময় balance সরাসরি বদলানো হয়েছিল।
                ঠিক করতে পার্থক্যটা Deposit/Withdraw দিয়ে এন্ট্রি করুন, অথবা আসল balance মিলিয়ে দেখুন।
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Balance মিলছে: Opening + সব এন্ট্রি = {fmtBdt(stored)}
            </div>
          )
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="খুঁজুন: বিবরণ, ক্যাটাগরি, invoice, অংক (যেমন 5000), কে এন্ট্রি দিয়েছে…"
              className="pl-8 pr-8"
              autoFocus
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex rounded-lg border p-0.5">
            {(["all", "in", "out"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setDir(k)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  dir === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {k === "all" ? "সব" : k === "in" ? "জমা (In)" : "খরচ (Out)"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p.k}
              onClick={() => setPreset(p.k)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                preset === p.k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
          {preset === "custom" && (
            <span className="flex items-center gap-1">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 w-[140px] text-xs" />
              <span className="text-xs text-muted-foreground">—</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 w-[140px] text-xs" />
            </span>
          )}
        </div>

        {/* Totals for the filtered rows */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border px-3 py-1.5">
            <div className="text-muted-foreground">জমা (In)</div>
            <div className="font-semibold tabular-nums text-emerald-600">+{fmtBdt(totIn)}</div>
          </div>
          <div className="rounded-lg border px-3 py-1.5">
            <div className="text-muted-foreground">খরচ (Out)</div>
            <div className="font-semibold tabular-nums text-rose-600">−{fmtBdt(totOut)}</div>
          </div>
          <div className="rounded-lg border px-3 py-1.5">
            <div className="text-muted-foreground">নিট · {rows.length} এন্ট্রি</div>
            <div className={cn("font-semibold tabular-nums", totIn - totOut < 0 && "text-rose-600")}>{fmtBdt(totIn - totOut)}</div>
          </div>
        </div>

        {/* Rows */}
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          {data.isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : data.error ? (
            <p className="p-4 text-sm text-rose-600">{(data.error as Error).message}</p>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">কিছু পাওয়া যায়নি</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">তারিখ</th>
                  <th className="px-3 py-2 text-left font-medium">বিবরণ</th>
                  <th className="px-3 py-2 text-right font-medium">জমা / খরচ</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const voided = !!r.orderStatus && VOID_STATUSES.has(r.orderStatus);
                  return (
                    <tr key={r.id} className={cn("border-t align-top hover:bg-muted/30", voided && "opacity-60")}>
                      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{r.transaction_date}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] uppercase">
                            {r.txn_type}
                          </Badge>
                          <span className="text-[13px]">{r.description ?? "—"}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          {r.category && <span>🏷 {r.category}</span>}
                          {r.counterpart && <span>{r.signed > 0 ? "← থেকে" : "→ তে"} {r.counterpart}</span>}
                          {r.invoice && r.reference_id && (
                            <Link
                              to="/erp/orders/$orderId"
                              params={{ orderId: r.reference_id }}
                              className="font-mono font-semibold text-indigo-600 hover:underline"
                            >
                              {r.invoice}
                            </Link>
                          )}
                          {r.orderStatus && (
                            <span className={cn(voided && "font-semibold text-rose-600")}>
                              {r.orderStatus}
                              {voided && " · টাকা পাওয়া যায়নি"}
                            </span>
                          )}
                          {r.by && <span>✎ {r.by}</span>}
                        </div>
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums",
                          voided ? "text-muted-foreground line-through" : r.signed >= 0 ? "text-emerald-600" : "text-rose-600",
                        )}
                      >
                        {r.signed >= 0 ? "+" : "−"}
                        {fmtBdt(Math.abs(r.signed))}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-muted-foreground",
                          r.balance < 0 && "text-rose-600",
                        )}
                      >
                        {fmtBdt(r.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
