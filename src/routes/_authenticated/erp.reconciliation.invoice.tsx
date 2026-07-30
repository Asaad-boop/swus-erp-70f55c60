import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  RotateCcw,
  Trash2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Download, FileDown } from "lucide-react";
import { CloudDownload } from "lucide-react";
import { fetchPathaoInvoiceCsvFn, listPathaoInvoicesFn, fetchOnePathaoInvoiceFn } from "@/lib/erp/pathao-invoices.functions";
import { exportReconciliationCsv, exportReconciliationPdf } from "@/lib/erp/reconciliation-export";
import { useBrand } from "@/contexts/brand-context";
import { useAccounts, useCategories } from "@/hooks/erp/use-finance-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import {
  createPathaoReconciliationRun,
  listPathaoReconciliationRuns,
  getPathaoReconciliationRun,
  applyPathaoReconciliationRun,
  revertPathaoReconciliationRun,
  deletePathaoReconciliationRun,
  manualMatchReconciliationRow,
  searchOrdersForMatch,
  previewPathaoReconciliation,
} from "@/lib/erp/reconciliation.functions";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/invoice")({
  head: () => ({ meta: [{ title: "Invoice Reconciliation — ERP" }] }),
  component: ReconciliationPage,
});

// ----- Pathao CSV → normalized groups -----

type PathaoRow = {
  Consignment_ID?: string;
  Created_Date?: string;
  Invoice_type?: string;
  Collected_Amount?: string;
  Recipient_Name?: string;
  Recipient_Phone?: string;
  Collectable_Amount?: string;
  COD_fee?: string;
  Delivery_Fee?: string;
  Final_Fee?: string;
  Discount?: string;
  Additional_Charge?: string;
  Compensation_Cost?: string;
  Promo_Discount?: string;
  Payout?: string;
  Merchant_Order_ID?: string;
  Store_name?: string;
};

type NormalizedRow = {
  consignment_id: string | null;
  merchant_order_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  invoice_date: string | null;
  collected: number;
  delivery_fee: number;
  cod_fee: number;
  other_fee: number;
  discount: number;
  total_fee: number;
  payout: number;
  store_name: string | null;
  raw: PathaoRow[];
  row_type: "paid" | "return" | "partial";
  return_fee: number;
  partial_amount: number;
  delivery_payout: number;
  insta_fee_amount: number;
  insta_fee_count: number;
  sub_row_count: number;
};

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cleanPhone(v: string | undefined): string | null {
  if (!v) return null;
  return String(v).replace(/"/g, "").trim() || null;
}

// Pathao often writes "N/A" / "-" when merchant id wasn't passed. Treat as null
// so server-side matching falls back to consignment_id / phone instead.
function cleanId(v: string | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || /^(n\/?a|na|null|none|-+)$/i.test(s)) return null;
  return s;
}

function getRowType(invoiceType: string | undefined): "paid" | "return" | "partial" {
  if (!invoiceType) return "paid";
  const t = invoiceType.toLowerCase();
  if (t.includes("return") || t.includes("reverse")) return "return";
  if (t.includes("partial")) return "partial";
  // `delivery` and `insta_fee` (extra delivery fee row, grouped with its
  // delivery row by Consignment_ID) both count as paid.
  return "paid";
}

function parsePathaoCsv(text: string): NormalizedRow[] {
  const result = Papa.parse<PathaoRow>(text, {
    header: true,
    skipEmptyLines: true,
    // Real Pathao headers: "Consignment_ID, Created_Date, Invoice type,
    // Collected_Amount, Recipient_Name, Recipient_Phone, Collectable_Amount,
    // COD_fee, Delivery_Fee, Final_Fee, Discount, Additional_Charge,
    // Compensation_Cost, Promo_Discount, Payout, Merchant_Order_ID, Store_name".
    // "Invoice type" has a space — normalize to underscore for the typed shape.
    transformHeader: (h) => h.trim().replace(/\s+/g, "_"),
  });
  const rows = (result.data ?? []).filter(
    (r) => r && (r.Consignment_ID || r.Merchant_Order_ID),
  );

  // Group by consignment id (fallback: merchant order id)
  const groups = new Map<string, PathaoRow[]>();
  for (const r of rows) {
    const key = r.Consignment_ID || r.Merchant_Order_ID || Math.random().toString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const out: NormalizedRow[] = [];
  for (const [, rs] of groups) {
    // Prefer a "delivery" row, else fall back to the first
    const primary = rs.find((r) => (r.Invoice_type ?? "").toLowerCase() === "delivery") ?? rs[0];
    // Row type: detect from any row in the group (return/partial dominates)
    const types = rs.map((r) => getRowType(r.Invoice_type));
    let rowType: "paid" | "return" | "partial" =
      types.find((t) => t === "return") ?? types.find((t) => t === "partial") ?? "paid";
    // Aggregate across all sub-rows for this consignment (delivery + insta_fee, etc).
    const collected = rs.reduce((s, r) => s + num(r.Collected_Amount), 0);
    const payout = rs.reduce((s, r) => s + num(r.Payout), 0);
    const collectable = rs.reduce((s, r) => s + num(r.Collectable_Amount), 0);
    // Signal-based fallback: Pathao's Invoice_type label is inconsistent
    // (blank / "Delivery" for actual returns and partials). Trust the money
    // signals when the text says "paid" but the numbers say otherwise.
    //   collected == 0 AND payout < 0 → return (courier deducted a fee, no
    //     money collected from customer)
    //   0 < collected < collectable   → partial (customer paid less than
    //     the invoice amount)
    if (rowType === "paid") {
      if (collected <= 0 && payout < 0) rowType = "return";
      else if (collectable > 0 && collected > 0 && collected < collectable) rowType = "partial";
    }
    const deliveryFee = rs.reduce((s, r) => s + num(r.Delivery_Fee), 0);
    const codFee = rs.reduce((s, r) => s + num(r.COD_fee), 0);
    const discount = rs.reduce((s, r) => s + num(r.Discount) + num(r.Promo_Discount), 0);
    // insta_fee rows post their charge through Delivery_Fee / Final_Fee + negative
    // Payout, so `collected - payout` already captures every fee Pathao took.
    const otherFee = rs.reduce(
      (s, r) => s + num(r.Additional_Charge) + num(r.Compensation_Cost),
      0,
    );
    const totalFee = collected - payout;
    const dateStr = primary.Created_Date ? primary.Created_Date.slice(0, 10) : null;

    const returnFee = rowType === "return"
      ? rs.reduce(
          (s, r) => s + num(r.Final_Fee) + num(r.Delivery_Fee) + num(r.Additional_Charge),
          0,
        )
      : 0;
    const partialAmount = rowType === "partial" ? collected : 0;

    // Per-sub-row split: delivery vs insta_fee (Pathao posts insta as a
    // separate row under the same consignment with negative Payout).
    const deliveryPayout = rs
      .filter((r) => (r.Invoice_type ?? "").toLowerCase() === "delivery")
      .reduce((s, r) => s + num(r.Payout), 0);
    const instaRows = rs.filter((r) => (r.Invoice_type ?? "").toLowerCase().includes("insta"));
    const instaFeeAmount = instaRows.reduce((s, r) => s + Math.abs(num(r.Payout)), 0);

    out.push({
      consignment_id: cleanId(primary.Consignment_ID),
      merchant_order_id: cleanId(primary.Merchant_Order_ID),
      recipient_name: primary.Recipient_Name || null,
      recipient_phone: cleanPhone(primary.Recipient_Phone),
      invoice_date: dateStr,
      collected,
      delivery_fee: deliveryFee,
      cod_fee: codFee,
      other_fee: otherFee,
      discount,
      total_fee: totalFee,
      payout,
      store_name: primary.Store_name || null,
      raw: rs,
      row_type: rowType,
      return_fee: returnFee,
      partial_amount: partialAmount,
      delivery_payout: deliveryPayout,
      insta_fee_amount: instaFeeAmount,
      insta_fee_count: instaRows.length,
      sub_row_count: rs.length,
    });
  }
  return out;
}

// ----- Page -----

function ReconciliationPage() {
  // Cross-brand: no brand pick required. brandId is always null → server matches
  // across all brands the user's RLS allows, and each row auto-detects its brand
  // from the matched order / shipment.
  const brandId: string | null = null;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<NormalizedRow[] | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  // Summary export date range (defaults to last 30 days)
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [sumFrom, setSumFrom] = useState<string>(monthAgo.toISOString().slice(0, 10));
  const [sumTo, setSumTo] = useState<string>(today.toISOString().slice(0, 10));
  const [sumBusy, setSumBusy] = useState(false);

  async function buildSummaryData() {
      const fromIso = new Date(`${sumFrom}T00:00:00`).toISOString();
      const toIso = new Date(`${sumTo}T23:59:59.999`).toISOString();
      const { data: runs, error: rErr } = await supabase
        .from("erp_reconciliation_runs")
        .select("id, created_at, source_filename, status, total_rows, matched_count, mismatched_count, unmatched_count, total_collected, total_fee, total_payout")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false });
      if (rErr) throw rErr;
      const runIds = (runs ?? []).map((r) => r.id);
      let rows: Array<{
        run_id: string;
        match_type: string | null;
        match_status: string | null;
        matched_order_id: string | null;
        collected: number | null;
        total_fee: number | null;
        payout: number | null;
      }> = [];
      if (runIds.length > 0) {
        // Chunked fetch to avoid URL limits
        for (let i = 0; i < runIds.length; i += 25) {
          const slice = runIds.slice(i, i + 25);
          const { data: rr, error: rrErr } = await supabase
            .from("erp_reconciliation_rows")
            .select("run_id, match_type, match_status, matched_order_id, collected, total_fee, payout")
            .in("run_id", slice);
          if (rrErr) throw rrErr;
          rows = rows.concat(rr ?? []);
        }
      }

      const typeCounts: Record<string, number> = {};
      const statusCounts: Record<string, number> = {};
      const affected = new Set<string>();
      let totCollected = 0, totFee = 0, totPayout = 0, cashIn = 0, cashOut = 0;
      for (const r of rows) {
        const t = r.match_type ?? "paid";
        const s = r.match_status ?? "unmatched";
        typeCounts[t] = (typeCounts[t] ?? 0) + 1;
        statusCounts[s] = (statusCounts[s] ?? 0) + 1;
        if (r.matched_order_id) affected.add(r.matched_order_id);
        totCollected += Number(r.collected ?? 0);
        totFee += Number(r.total_fee ?? 0);
        const p = Number(r.payout ?? 0);
        totPayout += p;
        if (p >= 0) cashIn += p;
        else cashOut += -p;
      }
    return { runs: runs ?? [], rows, typeCounts, statusCounts, affected, totCollected, totFee, totPayout, cashIn, cashOut };
  }

  async function downloadSummary() {
    if (!sumFrom || !sumTo) {
      toast.error("Select a date range");
      return;
    }
    setSumBusy(true);
    try {
      const { runs, rows, typeCounts, statusCounts, affected, totCollected, totFee, totPayout, cashIn, cashOut } = await buildSummaryData();

      const esc = (v: unknown) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines: string[] = [];
      lines.push("Pathao Reconciliation Summary");
      lines.push(`Date range,${sumFrom} to ${sumTo}`);
      lines.push(`Generated,${new Date().toLocaleString()}`);
      lines.push("");
      lines.push("Totals");
      lines.push(`Runs,${runs.length}`);
      lines.push(`Rows,${rows.length}`);
      lines.push(`Affected orders,${affected.size}`);
      lines.push(`Total collected (BDT),${totCollected.toFixed(2)}`);
      lines.push(`Total courier charges (BDT),${totFee.toFixed(2)}`);
      lines.push(`Cash in — payouts (BDT),${cashIn.toFixed(2)}`);
      lines.push(`Cash out — negative payouts (BDT),${cashOut.toFixed(2)}`);
      lines.push(`Net cash delta (BDT),${totPayout.toFixed(2)}`);
      lines.push("");
      lines.push("By match type");
      lines.push("Type,Count");
      for (const k of ["paid", "return", "partial", "insta_fee"]) {
        lines.push(`${k},${typeCounts[k] ?? 0}`);
      }
      for (const k of Object.keys(typeCounts)) {
        if (!["paid", "return", "partial", "insta_fee"].includes(k)) lines.push(`${k},${typeCounts[k]}`);
      }
      lines.push("");
      lines.push("By match status");
      lines.push("Status,Count");
      for (const k of ["matched", "amount_mismatch", "duplicate", "unmatched"]) {
        lines.push(`${k},${statusCounts[k] ?? 0}`);
      }
      lines.push("");
      lines.push("Per-run breakdown");
      lines.push(["Date", "File", "Status", "Rows", "Matched", "Mismatch", "Unmatched", "Collected", "Fees", "Net Payout"].join(","));
      for (const r of runs) {
        lines.push([
          new Date(r.created_at).toLocaleString(),
          r.source_filename ?? "",
          r.status,
          r.total_rows,
          r.matched_count,
          r.mismatched_count,
          r.unmatched_count,
          Number(r.total_collected ?? 0).toFixed(2),
          Number(r.total_fee ?? 0).toFixed(2),
          Number(r.total_payout ?? 0).toFixed(2),
        ].map(esc).join(","));
      }

      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reconciliation-summary-${sumFrom}_${sumTo}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Summary downloaded — ${runs.length} runs, ${rows.length} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build summary");
    } finally {
      setSumBusy(false);
    }
  }

  async function downloadSummaryPdf() {
    if (!sumFrom || !sumTo) {
      toast.error("Select a date range");
      return;
    }
    setSumBusy(true);
    try {
      const { runs, rows, typeCounts, statusCounts, affected, totCollected, totFee, totPayout, cashIn, cashOut } = await buildSummaryData();
      // jsPDF built-in helvetica supports Latin-1 only. ৳ (U+09F3) and → render as garbage.
      const money = (n: number) => `Tk ${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(Number(n ?? 0))}`;
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const margin = 36;
      const pageW = doc.internal.pageSize.getWidth();
      let y = margin;

      // Header
      doc.setFontSize(16); doc.setFont("helvetica", "bold");
      doc.text("Pathao Reconciliation Summary", margin, y); y += 18;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(90);
      doc.text(`Date range: ${sumFrom} to ${sumTo}`, margin, y); y += 12;
      doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y); y += 6;
      doc.setTextColor(0);

      // KPI grid
      const kpis: [string, string][] = [
        ["Runs", String(runs.length)],
        ["Rows", String(rows.length)],
        ["Affected orders", String(affected.size)],
        ["Total collected", money(totCollected)],
        ["Courier charges", money(totFee)],
        ["Cash in (payouts)", money(cashIn)],
        ["Cash out (neg. payouts)", money(cashOut)],
        ["Net cash delta", money(totPayout)],
      ];
      autoTable(doc, {
        startY: y + 8,
        head: [["Metric", "Value"]],
        body: kpis,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: margin, right: margin },
        tableWidth: 260,
      });
      // @ts-expect-error autoTable adds lastAutoTable
      y = (doc.lastAutoTable?.finalY ?? y) + 18;

      // Split: by type + by status side by side (simple stacked)
      const typeOrder = ["paid", "return", "partial", "insta_fee", ...Object.keys(typeCounts).filter((k) => !["paid","return","partial","insta_fee"].includes(k))];
      autoTable(doc, {
        startY: y,
        head: [["Match type", "Count"]],
        body: typeOrder.map((k) => [k, String(typeCounts[k] ?? 0)]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: margin },
        tableWidth: 220,
      });
      // @ts-expect-error autoTable adds lastAutoTable
      const yLeft = doc.lastAutoTable?.finalY ?? y;

      autoTable(doc, {
        startY: y,
        head: [["Match status", "Count"]],
        body: ["matched", "amount_mismatch", "duplicate", "unmatched"].map((k) => [k, String(statusCounts[k] ?? 0)]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: margin + 240 },
        tableWidth: 220,
      });
      // @ts-expect-error autoTable adds lastAutoTable
      const yRight = doc.lastAutoTable?.finalY ?? y;
      y = Math.max(yLeft, yRight) + 18;

      // Per-run
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(`Per-run breakdown (${runs.length})`, margin, y); y += 4;
      autoTable(doc, {
        startY: y + 4,
        head: [["Date", "File", "Status", "Rows", "Matched", "Mismatch", "Unmatched", "Collected", "Fees", "Net Payout"]],
        body: runs.map((r) => [
          new Date(r.created_at).toLocaleDateString(),
          (r.source_filename ?? "—").slice(0, 26),
          r.status,
          String(r.total_rows),
          String(r.matched_count),
          String(r.mismatched_count),
          String(r.unmatched_count),
          money(Number(r.total_collected ?? 0)),
          money(Number(r.total_fee ?? 0)),
          money(Number(r.total_payout ?? 0)),
        ]),
        styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: margin, right: margin },
        columnStyles: {
          3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" },
          6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
        },
      });

      // Footer page numbers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Page ${i} of ${pageCount}`, pageW - margin, doc.internal.pageSize.getHeight() - 14, { align: "right" });
      }
      doc.save(`reconciliation-summary-${sumFrom}_${sumTo}.pdf`);
      toast.success(`PDF downloaded — ${runs.length} runs, ${rows.length} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build PDF");
    } finally {
      setSumBusy(false);
    }
  }

  const listFn = useServerFn(listPathaoReconciliationRuns);
  const createFn = useServerFn(createPathaoReconciliationRun);
  const deleteFn = useServerFn(deletePathaoReconciliationRun);
  const previewFn = useServerFn(previewPathaoReconciliation);
  const autoFetchFn = useServerFn(fetchPathaoInvoiceCsvFn);
  const listInvoicesFn = useServerFn(listPathaoInvoicesFn);
  const fetchOneFn = useServerFn(fetchOnePathaoInvoiceFn);

  // ---- Auto fetch (Pathao merchant panel) ----
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);
  const [autoFrom, setAutoFrom] = useState(() => {
    const n = new Date();
    return isoDay(new Date(n.getFullYear(), n.getMonth(), 1));
  });
  const [autoTo, setAutoTo] = useState(() => isoDay(new Date()));
  const [autoAttempts, setAutoAttempts] = useState<{ path: string; status: number | string; snippet: string }[] | null>(null);
  const [invoiceList, setInvoiceList] = useState<
    { id: string; date: string | null; invoiceNo: string | null; collected: number | null; fee: number | null; payout: number | null; orders: number | null; status: string | null }[] | null
  >(null);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  const listMut = useMutation({
    mutationFn: () => listInvoicesFn({ data: { brandId: null, from: autoFrom, to: autoTo } }),
    onSuccess: (r) => {
      setInvoiceList(r.invoices);
      setAutoAttempts(r.invoices.length ? null : (r.attempts ?? null));
      if (!r.invoices.length) toast.error("Ei date range e kono invoice pawa jayni");
      else toast.success(`${r.invoices.length} ta invoice pawa gelo — ekta ekta kore load korun`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loadOne = async (inv: { id: string; date: string | null }) => {
    setLoadingInvoiceId(inv.id);
    try {
      const r = await fetchOneFn({ data: { brandId: null, invoiceId: inv.id } });
      if (!r.csv) {
        setAutoAttempts(r.attempts ?? null);
        toast.error("Ei invoice er CSV pawa jayni");
        return;
      }
      const parsed = parsePathaoCsv(r.csv);
      if (!parsed.length) {
        toast.error("Invoice e kono row nei");
        return;
      }
      setPreview(parsed);
      setFilename(`pathao-inv_${inv.id}_${inv.date ?? autoTo}.csv`);
      setActiveInvoiceId(inv.id);
      setAutoAttempts(null);
      toast.success(`Invoice ${inv.id} — ${parsed.length} consignment preview e`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const autoMut = useMutation({
    mutationFn: () => autoFetchFn({ data: { brandId: null, from: autoFrom, to: autoTo } }),
    onSuccess: (r) => {
      setAutoAttempts(r.attempts ?? null);
      if (!r.csv) {
        toast.error("Pathao theke invoice CSV pawa jayni — niche details dekhun, CSV manually upload korte parben.");
        return;
      }
      try {
        const parsed = parsePathaoCsv(r.csv);
        if (!parsed.length) {
          toast.error("Ei date range e kono paid invoice nei");
          return;
        }
        setPreview(parsed);
        setFilename(r.filename);
        setAutoAttempts(null);
        toast.success(`${parsed.length} consignment ana holo — preview dekhe Process korun`);
      } catch (e) {
        toast.error("Parse failed: " + (e as Error).message);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runsQ = useQuery({
    queryKey: ["pathao-reconciliation-runs", "all"],
    queryFn: () => listFn({ data: { brandId: null } }),
  });

  // Invoice list helpers
  const appliedInvoiceIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of (runsQ.data ?? []) as Array<Record<string, any>>) {
      if (r.status === "reverted") continue;
      const m = String(r.source_filename ?? "").match(/pathao-inv_([^_]+)_/);
      if (m) set.add(m[1]);
    }
    return set;
  }, [runsQ.data]);
  const invoiceTotals = useMemo(
    () =>
      (invoiceList ?? []).reduce(
        (a, i) => ({
          collected: a.collected + (i.collected ?? 0),
          fee: a.fee + (i.fee ?? 0),
          payout: a.payout + (i.payout ?? 0),
        }),
        { collected: 0, fee: 0, payout: 0 },
      ),
    [invoiceList],
  );

  // Dry-run match preview (no inserts). Re-runs when parsed rows or brand change.
  const previewKey = useMemo(() => {
    if (!preview) return null;
    return preview
      .map((r) => `${r.consignment_id ?? "-"}|${r.merchant_order_id ?? "-"}|${r.collected}`)
      .join(";");
  }, [preview]);
  const matchQ = useQuery({
    queryKey: ["pathao-recon-preview", "all", previewKey],
    enabled: !!preview,
    queryFn: () =>
      previewFn({
        data: {
          brandId: null,
          tolerance: 1,
          rows: (preview ?? []).map((r, idx) => ({
            idx,
            consignment_id: r.consignment_id,
            merchant_order_id: r.merchant_order_id,
            recipient_phone: r.recipient_phone,
            collected: r.collected,
            row_type: r.row_type,
          })),
        },
      }),
  });
  const matchByIdx = useMemo(() => {
    const m = new Map<number, NonNullable<typeof matchQ.data>[number]>();
    (matchQ.data ?? []).forEach((r) => m.set(r.idx, r));
    return m;
  }, [matchQ.data]);
  const previewStatusCounts = useMemo(() => {
    const c = { matched: 0, amount_mismatch: 0, duplicate: 0, unmatched: 0 };
    (matchQ.data ?? []).forEach((r) => {
      c[r.status] = (c[r.status] ?? 0) + 1;
    });
    return c;
  }, [matchQ.data]);
  const previewGrouped = useMemo(() => {
    if (!preview)
      return { deliveryPayout: 0, instaFee: 0, instaCount: 0, subRows: 0 };
    return preview.reduce(
      (a, r) => ({
        deliveryPayout: a.deliveryPayout + r.delivery_payout,
        instaFee: a.instaFee + r.insta_fee_amount,
        instaCount: a.instaCount + (r.insta_fee_count > 0 ? 1 : 0),
        subRows: a.subRows + r.sub_row_count,
      }),
      { deliveryPayout: 0, instaFee: 0, instaCount: 0, subRows: 0 },
    );
  }, [preview]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!preview || preview.length === 0) throw new Error("No rows parsed");
      const rows = preview.map(({ raw: _raw, ...rest }) => ({
        ...rest,
        raw: { count: _raw.length, row_type: rest.row_type },
      }));
      return await createFn({
        data: {
          brandId: null,
          filename,
          rows,
          tolerance: 1,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`${preview!.length} consignment processed`);
      setPreview(null);
      setFilename(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["pathao-reconciliation-runs"] });
      setOpenRunId(r.runId);
      setActiveInvoiceId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (runId: string) => deleteFn({ data: { runId } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["pathao-reconciliation-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = parsePathaoCsv(text);
      if (!parsed.length) {
        toast.error("No valid rows found in CSV");
        return;
      }
      setPreview(parsed);
      setFilename(file.name);
    } catch (e) {
      toast.error("Parse failed: " + (e as Error).message);
    }
  };

  const previewTotals = useMemo(() => {
    if (!preview) return { collected: 0, fee: 0, payout: 0 };
    return preview.reduce(
      (a, r) => ({
        collected: a.collected + r.collected,
        fee: a.fee + r.total_fee,
        payout: a.payout + r.payout,
      }),
      { collected: 0, fee: 0, payout: 0 },
    );
  }, [preview]);

  const previewByType = useMemo(() => {
    if (!preview) return { paid: 0, return: 0, partial: 0 };
    return preview.reduce(
      (a, r) => {
        a[r.row_type] = (a[r.row_type] ?? 0) + 1;
        return a;
      },
      { paid: 0, return: 0, partial: 0 } as Record<"paid" | "return" | "partial", number>,
    );
  }, [preview]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Pathao Invoice Reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Cross-brand upload: ekta invoice e multiple brand er order thakle system auto-detect korbe (consignment ID → merchant ID → phone+amount priority)। Per-brand default COD wallet automatically pick hobe apply er time.
        </p>
      </header>

      {/* Upload zone */}
      <Card>
        <CardContent className="p-4 md:p-5 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[280px]">
              <Label className="text-xs">Pathao paid invoice CSV</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Pathao dashboard → Payments → Download paid invoice CSV
              </p>
            </div>
            {preview && (
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="gap-2"
              >
                {createMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Process {preview.length} consignments
              </Button>
            )}
          </div>

          {/* Auto fetch from Pathao */}
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Auto fetch — From</Label>
                <Input type="date" value={autoFrom} onChange={(e) => setAutoFrom(e.target.value)} className="h-9 w-[150px]" />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={autoTo} onChange={(e) => setAutoTo(e.target.value)} className="h-9 w-[150px]" />
              </div>
              <Button
                variant="secondary"
                className="gap-2"
                disabled={autoMut.isPending}
                onClick={() => autoMut.mutate()}
              >
                {autoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                Fetch all (merged)
              </Button>
              <Button
                className="gap-2"
                disabled={listMut.isPending}
                onClick={() => listMut.mutate()}
              >
                {listMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Show invoices (date wise)
              </Button>
              <p className="text-[11px] text-muted-foreground flex-1 min-w-[220px]">
                “Show invoices” dile oi range er protita invoice alada alada date wise list hobe — ekta ekta kore Load kore verify kore Process korte parben. “Fetch all” pura range ek CSV te merge kore.
              </p>
            </div>

            {invoiceList && (
              <div className="rounded-md border bg-background overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                  <span className="text-xs font-medium">{invoiceList.length} invoice — {autoFrom} → {autoTo}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setInvoiceList(null); setActiveInvoiceId(null); }}>
                    Close
                  </Button>
                </div>
                <div className="max-h-[340px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60 text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-left font-medium">Invoice</th>
                        <th className="px-3 py-2 text-right font-medium">Orders</th>
                        <th className="px-3 py-2 text-right font-medium">Collected</th>
                        <th className="px-3 py-2 text-right font-medium">Fee</th>
                        <th className="px-3 py-2 text-right font-medium">Payout</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceList.map((inv) => {
                        const done = appliedInvoiceIds.has(inv.id);
                        return (
                          <tr key={inv.id} className={`border-t ${activeInvoiceId === inv.id ? "bg-primary/5" : ""}`}>
                            <td className="px-3 py-2 whitespace-nowrap">{inv.date ?? "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {inv.invoiceNo ?? inv.id}
                              {done && (
                                <Badge variant="outline" className="ml-2 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 text-[10px]">
                                  Applied
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{inv.orders ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{inv.collected != null ? fmtBdt(inv.collected) : "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-700">{inv.fee != null ? fmtBdt(inv.fee) : "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700">{inv.payout != null ? fmtBdt(inv.payout) : "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                size="sm"
                                variant={activeInvoiceId === inv.id ? "default" : "outline"}
                                className="h-7 text-xs gap-1"
                                disabled={loadingInvoiceId !== null}
                                onClick={() => loadOne(inv)}
                              >
                                {loadingInvoiceId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CloudDownload className="h-3 w-3" />}
                                Load
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/40 text-xs font-medium">
                      <tr className="border-t">
                        <td className="px-3 py-2" colSpan={3}>Total</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBdt(invoiceTotals.collected)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBdt(invoiceTotals.fee)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBdt(invoiceTotals.payout)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {autoAttempts && (
              <details className="text-[11px] text-muted-foreground">
                <summary className="cursor-pointer">Pathao response details ({autoAttempts.length} endpoint try kora holo)</summary>
                <div className="mt-1 space-y-0.5 font-mono">
                  {autoAttempts.map((a, i) => (
                    <div key={i} className="break-all">
                      [{String(a.status)}] {a.path} — {a.snippet}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {preview && (
            <div className="rounded-md border bg-muted/30 p-3 flex flex-wrap gap-6 text-sm">
              <Stat label="Consignments" value={String(preview.length)} />
              <Stat label="Collected" value={fmtBdt(previewTotals.collected)} />
              <Stat label="Courier fees" value={fmtBdt(previewTotals.fee)} tone="warn" />
              <Stat label="Net payout" value={fmtBdt(previewTotals.payout)} tone="good" />
              {filename && <Stat label="File" value={filename} />}
            </div>
          )}

          {preview && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700">
                ✅ {previewByType.paid} paid
              </Badge>
              <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-700">
                ↩ {previewByType.return} returns
              </Badge>
              <Badge variant="outline" className="border-sky-500/50 bg-sky-500/10 text-sky-700">
                📦 {previewByType.partial} partial
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CSV preview table — mapping, grouped totals, dry-run statuses */}
      {preview && (
        <Card>
          <CardContent className="p-4 md:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Preview — before processing</h2>
                <p className="text-[11px] text-muted-foreground">
                  {preview.length} consignment, {previewGrouped.subRows} CSV row.
                  Insta-fee {previewGrouped.instaCount} ta consignment-e (
                  {fmtBdt(previewGrouped.instaFee)}). "Process" click korle apply hobe.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700">
                  ✅ Matched {previewStatusCounts.matched}
                </Badge>
                <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-700">
                  ⚠ Amount diff {previewStatusCounts.amount_mismatch}
                </Badge>
                <Badge variant="outline" className="border-red-500/50 bg-red-500/10 text-red-700">
                  ✖ Duplicate {previewStatusCounts.duplicate}
                </Badge>
                <Badge variant="outline">? Unmatched {previewStatusCounts.unmatched}</Badge>
                {matchQ.isFetching && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> matching…
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-md border bg-muted/20 px-3 py-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Stat label="Delivery payout (sum)" value={fmtBdt(previewGrouped.deliveryPayout)} tone="good" />
              <Stat label="Insta-fee charges" value={fmtBdt(previewGrouped.instaFee)} tone="warn" />
              <Stat label="Net payout" value={fmtBdt(previewTotals.payout)} tone="good" />
              <Stat label="Total courier fees" value={fmtBdt(previewTotals.fee)} tone="warn" />
            </div>

            <div className="max-h-[420px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead>Consignment / Order ID</TableHead>
                    <TableHead>Mapped order</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Delivery</TableHead>
                    <TableHead className="text-right">Insta-fee</TableHead>
                    <TableHead className="text-right">Payout</TableHead>
                    <TableHead className="text-right">Diff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, idx) => {
                    const m = matchByIdx.get(idx);
                    const status = m?.status ?? "unmatched";
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <PreviewStatusBadge status={status} loading={!m && matchQ.isFetching} />
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          <div>{r.consignment_id ?? "—"}</div>
                          <div className="text-muted-foreground">
                            {r.merchant_order_id ?? <span className="italic">no merchant id</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {m?.matched_order_id ? (
                            <>
                              <div className="font-medium">{m.order_name ?? "—"}</div>
                              <div className="text-muted-foreground">
                                {fmtBdt(m.order_total ?? 0)} · {m.order_status} ·{" "}
                                <span className="text-[10px]">via {m.matched_via}</span>
                              </div>
                              {typeof m.confidence === "number" && (
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <div className="h-1 w-20 rounded bg-muted overflow-hidden">
                                    <div
                                      className={
                                        m.confidence >= 0.85
                                          ? "h-full bg-emerald-500"
                                          : m.confidence >= 0.6
                                            ? "h-full bg-amber-500"
                                            : "h-full bg-red-500"
                                      }
                                      style={{ width: `${Math.round(m.confidence * 100)}%` }}
                                    />
                                  </div>
                                  <span
                                    className="text-[10px] font-mono text-muted-foreground"
                                    title={m.match_reason ?? ""}
                                  >
                                    {Math.round(m.confidence * 100)}%
                                  </span>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="font-medium">{r.recipient_name ?? "—"}</div>
                              <div className="text-muted-foreground">{r.recipient_phone ?? ""}</div>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtBdt(r.collected)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtBdt(r.delivery_payout)}</TableCell>
                        <TableCell className="text-right font-mono text-amber-700">
                          {r.insta_fee_amount > 0 ? `−${fmtBdt(r.insta_fee_amount)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-emerald-700">
                          {fmtBdt(r.payout)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {m?.amount_diff !== null && m?.amount_diff !== undefined && m.amount_diff !== 0
                            ? `${m.amount_diff > 0 ? "+" : ""}${m.amount_diff.toFixed(0)}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">History</h2>
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">From</Label>
              <Input
                type="date"
                value={sumFrom}
                onChange={(e) => setSumFrom(e.target.value)}
                className="h-8 w-[140px]"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">To</Label>
              <Input
                type="date"
                value={sumTo}
                onChange={(e) => setSumTo(e.target.value)}
                className="h-8 w-[140px]"
              />
            </div>
            <Button size="sm" variant="outline" onClick={downloadSummary} disabled={sumBusy}>
              {sumBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              CSV
            </Button>
            <Button size="sm" variant="outline" onClick={downloadSummaryPdf} disabled={sumBusy}>
              {sumBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              PDF
            </Button>
          </div>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Matched</TableHead>
                <TableHead className="text-right">Payout</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runsQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!runsQ.isLoading && (runsQ.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Kono reconciliation run nei. Upper e CSV upload koro.
                  </TableCell>
                </TableRow>
              )}
              {(runsQ.data ?? []).map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setOpenRunId(r.id)}
                >
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">{r.source_filename ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.total_rows}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {r.matched_count}/{r.total_rows}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtBdt(r.total_payout)}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "draft" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this draft?")) deleteMut.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <ChevronRight className="inline h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {openRunId && (
        <RunDetailDialog runId={openRunId} brandId={brandId} onClose={() => setOpenRunId(null)} />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  const cls =
    tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-700" : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { v: "default" | "secondary" | "outline" | "destructive"; t: string }> = {
    draft: { v: "outline", t: "Draft" },
    applied: { v: "default", t: "Applied" },
    partial: { v: "secondary", t: "Partial" },
    reverted: { v: "destructive", t: "Reverted" },
  };
  const m = map[status] ?? { v: "outline", t: status };
  return (
    <Badge variant={m.v} className="text-xs">
      {m.t}
    </Badge>
  );
}

function PreviewStatusBadge({ status, loading }: { status: string; loading?: boolean }) {
  if (loading)
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> …
      </Badge>
    );
  if (status === "matched")
    return <Badge className="bg-emerald-600 text-white text-[10px]">Matched</Badge>;
  if (status === "amount_mismatch")
    return <Badge className="bg-amber-500 text-white text-[10px]">Diff</Badge>;
  if (status === "duplicate")
    return <Badge variant="destructive" className="text-[10px]">Duplicate</Badge>;
  return <Badge variant="outline" className="text-[10px]">Unmatched</Badge>;
}

// ----- Run Detail Dialog -----

type Row = {
  id: string;
  consignment_id: string | null;
  merchant_order_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  invoice_date: string | null;
  collected: number;
  total_fee: number;
  payout: number;
  match_status: string;
  matched_order_id: string | null;
  matched_via: string | null;
  amount_diff: number | null;
  match_type?: string | null;
  applied_income_txn_id: string | null;
  applied_expense_txn_id: string | null;
  orders?: { id: string; total: number; shipping_name: string | null; shipping_phone: string | null; status: string; payment_status: string | null } | null;
};

function RunDetailDialog({
  runId,
  brandId,
  onClose,
}: {
  runId: string;
  brandId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"matched" | "mismatch" | "unmatched" | "all">("matched");
  const [applyOpen, setApplyOpen] = useState(false);

  const getFn = useServerFn(getPathaoReconciliationRun);
  const revertFn = useServerFn(revertPathaoReconciliationRun);

  const runQ = useQuery({
    queryKey: ["pathao-reconciliation-run", runId],
    queryFn: () => getFn({ data: { runId } }),
  });

  const revertMut = useMutation({
    mutationFn: () => revertFn({ data: { runId } }),
    onSuccess: (r) => {
      toast.success(`Reverted ${r.reverted} transactions`);
      qc.invalidateQueries({ queryKey: ["pathao-reconciliation-run", runId] });
      qc.invalidateQueries({ queryKey: ["pathao-reconciliation-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (runQ.data?.rows ?? []) as Row[];
  const filtered = useMemo(() => {
    if (tab === "all") return rows;
    if (tab === "matched") return rows.filter((r) => r.match_status === "matched");
    if (tab === "mismatch") return rows.filter((r) => r.match_status === "amount_mismatch");
    return rows.filter((r) => r.match_status === "unmatched" || r.match_status === "duplicate");
  }, [rows, tab]);

  const run = runQ.data?.run;
  const counts = {
    matched: rows.filter((r) => r.match_status === "matched").length,
    mismatch: rows.filter((r) => r.match_status === "amount_mismatch").length,
    unmatched: rows.filter((r) => r.match_status === "unmatched" || r.match_status === "duplicate").length,
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Run {run?.source_filename ?? runId.slice(0, 8)}
            {run && <StatusBadge status={run.status} />}
          </DialogTitle>
          <DialogDescription>
            {run && (
              <span className="text-xs">
                {new Date(run.created_at).toLocaleString()} · Net payout {fmtBdt(run.total_payout)} ·
                Fee {fmtBdt(run.total_fee)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap">
          <TabBtn active={tab === "matched"} onClick={() => setTab("matched")} icon={<CheckCircle2 className="h-3.5 w-3.5" />} count={counts.matched} label="Matched" tone="good" />
          <TabBtn active={tab === "mismatch"} onClick={() => setTab("mismatch")} icon={<AlertTriangle className="h-3.5 w-3.5" />} count={counts.mismatch} label="Amount mismatch" tone="warn" />
          <TabBtn active={tab === "unmatched"} onClick={() => setTab("unmatched")} icon={<XCircle className="h-3.5 w-3.5" />} count={counts.unmatched} label="Unmatched" tone="bad" />
          <TabBtn active={tab === "all"} onClick={() => setTab("all")} icon={<FileText className="h-3.5 w-3.5" />} count={rows.length} label="All" />
        </div>

        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Consignment</TableHead>
                <TableHead>Order / Customer</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead className="text-right">Payout</TableHead>
                <TableHead className="text-right">Diff</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!runQ.isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Empty.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <RowItem key={r.id} row={r} brandId={brandId} runId={runId} />
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2">
          {run && rows.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportReconciliationCsv(run as never, rows as never)}
              >
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportReconciliationPdf(run as never, rows as never)}
              >
                <FileDown className="h-4 w-4 mr-1" /> PDF
              </Button>
            </>
          )}
          {run?.status === "draft" || run?.status === "partial" ? (
            <Button onClick={() => setApplyOpen(true)} disabled={counts.matched === 0 && counts.mismatch === 0}>
              Apply to finance
            </Button>
          ) : run?.status === "applied" || run?.status === "partial" ? (
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm("Revert all transactions for this run?")) revertMut.mutate();
              }}
              disabled={revertMut.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Revert
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>

        {applyOpen && run && (
          <ApplyDialog
            runId={runId}
            brandId={brandId}
            onClose={() => setApplyOpen(false)}
            onApplied={() => {
              setApplyOpen(false);
              qc.invalidateQueries({ queryKey: ["pathao-reconciliation-run", runId] });
              qc.invalidateQueries({ queryKey: ["pathao-reconciliation-runs"] });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  count,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  count: number;
  label: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "data-[active=true]:bg-emerald-500/10 data-[active=true]:text-emerald-700 data-[active=true]:border-emerald-500/40"
      : tone === "warn"
        ? "data-[active=true]:bg-amber-500/10 data-[active=true]:text-amber-700 data-[active=true]:border-amber-500/40"
        : tone === "bad"
          ? "data-[active=true]:bg-red-500/10 data-[active=true]:text-red-700 data-[active=true]:border-red-500/40"
          : "data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:border-primary/40";
  return (
    <button
      type="button"
      data-active={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted ${toneCls}`}
    >
      {icon}
      <span>{label}</span>
      <Badge variant="secondary" className="ml-1 h-4 text-[10px] font-mono">
        {count}
      </Badge>
    </button>
  );
}

function RowItem({ row, brandId, runId }: { row: Row; brandId: string | null; runId: string }) {
  const qc = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const status = row.match_status;

  const statusBadge = (() => {
    if (row.applied_income_txn_id) {
      return <Badge className="bg-emerald-600 text-white text-xs">Applied</Badge>;
    }
    if (status === "matched")
      return <Badge variant="secondary" className="text-xs text-emerald-700">Matched</Badge>;
    if (status === "amount_mismatch")
      return <Badge variant="secondary" className="text-xs text-amber-700">Diff</Badge>;
    if (status === "duplicate")
      return <Badge variant="destructive" className="text-xs">Duplicate</Badge>;
    return <Badge variant="outline" className="text-xs">Unmatched</Badge>;
  })();

  const typeBadge = (() => {
    const t = row.match_type ?? "paid";
    if (t === "return")
      return <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-300">Return</Badge>;
    if (t === "partial")
      return <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">Partial</Badge>;
    return null;
  })();

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex flex-col items-start gap-1">
            {statusBadge}
            {typeBadge}
          </div>
        </TableCell>
        <TableCell className="text-xs font-mono">
          <div>{row.consignment_id ?? "—"}</div>
          <div className="text-muted-foreground">{row.merchant_order_id ?? ""}</div>
        </TableCell>
        <TableCell className="text-xs">
          {row.orders ? (
            <>
              <div className="font-medium">{row.orders.shipping_name ?? "—"}</div>
              <div className="text-muted-foreground">
                {row.orders.shipping_phone} · {fmtBdt(row.orders.total)} · {row.orders.status}
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">{row.recipient_name ?? "—"}</div>
              <div className="text-muted-foreground">{row.recipient_phone ?? ""}</div>
            </>
          )}
        </TableCell>
        <TableCell className="text-right font-mono">{fmtBdt(row.collected)}</TableCell>
        <TableCell className="text-right font-mono text-amber-700">{fmtBdt(row.total_fee)}</TableCell>
        <TableCell className="text-right font-mono text-emerald-700">{fmtBdt(row.payout)}</TableCell>
        <TableCell className="text-right font-mono text-xs">
          {(row.match_type === "return" || row.match_type === "partial")
            ? row.payout < 0
              ? <span className="text-rose-700">−{Math.abs(row.payout).toFixed(0)}</span>
              : "—"
            : row.amount_diff !== null && row.amount_diff !== 0
              ? `${row.amount_diff > 0 ? "+" : ""}${row.amount_diff.toFixed(0)}`
              : "—"}
        </TableCell>
        <TableCell className="text-right">
          {!row.applied_income_txn_id && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setSearchOpen(true)}
            >
              {row.matched_order_id ? "Re-link" : "Link"}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {searchOpen && (
        <ManualMatchDialog
          rowId={row.id}
          brandId={brandId}
          defaultQuery={row.recipient_phone ?? row.recipient_name ?? ""}
          onClose={() => setSearchOpen(false)}
          onSaved={() => {
            setSearchOpen(false);
            qc.invalidateQueries({ queryKey: ["pathao-reconciliation-run", runId] });
          }}
        />
      )}
    </>
  );
}

function ManualMatchDialog({
  rowId,
  brandId,
  defaultQuery,
  onClose,
  onSaved,
}: {
  rowId: string;
  brandId: string | null;
  defaultQuery: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState(defaultQuery);
  const searchFn = useServerFn(searchOrdersForMatch);
  const matchFn = useServerFn(manualMatchReconciliationRow);

  const sQ = useQuery({
    queryKey: ["order-search", brandId, q],
    queryFn: () => searchFn({ data: { brandId: brandId ?? null, q } }),
    enabled: q.trim().length >= 2,
  });

  const mut = useMutation({
    mutationFn: (orderId: string | null) => matchFn({ data: { rowId, orderId } }),
    onSuccess: () => {
      toast.success("Linked");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manually link order</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search by phone or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-[400px] overflow-auto rounded-md border">
          <Table>
            <TableBody>
              {sQ.isLoading && (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground py-6">Searching…</TableCell>
                </TableRow>
              )}
              {!sQ.isLoading && (sQ.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground py-6">No matches.</TableCell>
                </TableRow>
              )}
              {(sQ.data ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-xs">
                    <div className="font-medium">{o.shipping_name}</div>
                    <div className="text-muted-foreground">
                      {o.shipping_phone} · {fmtBdt(o.total)} · {o.status}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => mut.mutate(o.id)} disabled={mut.isPending}>
                      Link
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          {<Button variant="outline" onClick={() => mut.mutate(null)}>Unlink</Button>}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- Apply Dialog -----

function ApplyDialog({
  runId,
  brandId,
  onClose,
  onApplied,
}: {
  runId: string;
  brandId: string | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { brands } = useBrand();
  const qc = useQueryClient();
  const [includeMismatch, setIncludeMismatch] = useState(false);
  // Per-brand chosen wallet (this run only, unless saveAsDefault checked)
  const [brandWallet, setBrandWallet] = useState<Record<string, string>>({});
  const [saveAsDefault, setSaveAsDefault] = useState<Record<string, boolean>>({});

  // Which brands are actually involved in this run's rows?
  const runRowsQ = useQuery({
    queryKey: ["pathao-recon-run-brands", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_reconciliation_rows")
        .select("brand_id")
        .eq("run_id", runId);
      if (error) throw error;
      const ids = [
        ...new Set(
          ((data ?? []) as { brand_id: string | null }[])
            .map((r) => r.brand_id)
            .filter(Boolean) as string[],
        ),
      ];
      return ids;
    },
  });
  const brandsInRun = runRowsQ.data ?? [];

  // Fetch per-brand default COD wallets
  const walletMapQ = useQuery({
    queryKey: ["erp-settings-cod", brandsInRun.join(",")],
    enabled: brandsInRun.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_settings")
        .select("brand_id, default_cod_wallet_id, default_cod_fee_category_id")
        .in("brand_id", brandsInRun);
      if (error) throw error;
      return data ?? [];
    },
  });
  const walletMap = new Map<string, { wallet: string | null; fee: string | null }>();
  (walletMapQ.data ?? []).forEach((s: { brand_id: string; default_cod_wallet_id: string | null; default_cod_fee_category_id: string | null }) => {
    walletMap.set(s.brand_id, { wallet: s.default_cod_wallet_id, fee: s.default_cod_fee_category_id });
  });

  // Load accounts across ALL brands so each per-brand picker can show every wallet
  const accountsQ = useAccounts(brands.map((b) => b.id));
  const allAccounts = useMemo(
    () => (accountsQ.data ?? []) as Array<{ id: string; name: string; brand_id: string | null; account_subtype?: string | null; account_type?: string | null }>,
    [accountsQ.data],
  );
  const accountsByBrand = useMemo(() => {
    // Every brand picker gets the full list (shared + brand-owned)
    const m = new Map<string, typeof allAccounts>();
    for (const bid of brandsInRun) m.set(bid, allAccounts);
    return m;
  }, [allAccounts, brandsInRun]);

  // Effective chosen wallet per brand = local override → default → nothing
  const effectiveWallet = (bid: string) => brandWallet[bid] ?? walletMap.get(bid)?.wallet ?? "";
  const missingBrands = brandsInRun.filter((b) => !effectiveWallet(b));
  const nameOf = (_bid: string, wid: string) =>
    allAccounts.find((a) => a.id === wid)?.name ?? "—";

  const applyFn = useServerFn(applyPathaoReconciliationRun);
  const mut = useMutation({
    mutationFn: async () => {
      // 1) Persist "save as default" choices before apply so future runs pick them up
      const toSave = brandsInRun.filter(
        (b) => saveAsDefault[b] && brandWallet[b] && brandWallet[b] !== walletMap.get(b)?.wallet,
      );
      for (const b of toSave) {
        const { error } = await supabase
          .from("erp_settings")
          .upsert(
            { brand_id: b, default_cod_wallet_id: brandWallet[b] },
            { onConflict: "brand_id" },
          );
        if (error) throw error;
      }
      // 2) Send per-brand overrides for THIS run (server takes precedence over defaults)
      const overrides: Record<string, string> = {};
      for (const b of brandsInRun) {
        const chosen = effectiveWallet(b);
        if (chosen) overrides[b] = chosen;
      }
      return applyFn({
        data: {
          runId,
          brandWallets: Object.keys(overrides).length ? overrides : undefined,
          includeMismatch,
        },
      });
    },
    onSuccess: (r) => {
      if (r.failed === 0) toast.success(`Applied ${r.applied} rows`);
      else toast.warning(`Applied ${r.applied}, failed ${r.failed}`);
      qc.invalidateQueries({ queryKey: ["erp-settings-cod"] });
      onApplied();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Apply to Finance</DialogTitle>
          <DialogDescription>
            Protita brand-er jonno destination wallet niche select koro. Default already set thakle preselected thakbe — chaile ekhon change korte paro, ba "Save as default" tick korle porer bar theke ei-tai default hobe.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {brandsInRun.length > 0 && (
            <div className="rounded-md border bg-muted/20 divide-y">
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Destination wallet · per brand ({brandsInRun.length})
              </div>
              {brandsInRun.map((bid) => {
                const defaultWallet = walletMap.get(bid)?.wallet ?? "";
                const chosen = effectiveWallet(bid);
                const wallets = accountsByBrand.get(bid) ?? [];
                const isChanged = !!brandWallet[bid] && brandWallet[bid] !== defaultWallet;
                return (
                  <div key={bid} className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{brandName(bid)}</span>
                      {defaultWallet ? (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Default: {nameOf(bid, defaultWallet)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" /> No default set
                        </Badge>
                      )}
                    </div>
                    <Select
                      value={chosen}
                      onValueChange={(v) => setBrandWallet((s) => ({ ...s, [bid]: v }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={accountsQ.isLoading ? "Loading wallets…" : "Choose wallet…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {wallets.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No active wallets for this brand</div>
                        ) : (
                          wallets.map((a) => (
                            <SelectItem key={a.id} value={a.id} className="text-sm">
                              {a.name}
                              {a.account_subtype && (
                                <span className="text-muted-foreground ml-1 text-[11px] capitalize">· {a.account_subtype}</span>
                              )}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {isChanged && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={!!saveAsDefault[bid]}
                          onChange={(e) => setSaveAsDefault((s) => ({ ...s, [bid]: e.target.checked }))}
                        />
                        Save "{nameOf(bid, brandWallet[bid])}" as new default for this brand
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeMismatch}
              onChange={(e) => setIncludeMismatch(e.target.checked)}
            />
            Amount mismatch row gulao apply koro (invoice amount diye)
          </label>

          {missingBrands.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Ei brand-gulor jonno wallet select koro: <strong>{missingBrands.map(brandName).join(", ")}</strong></span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || missingBrands.length > 0}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Copy className="h-4 w-4 mr-1" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}