import jsPDF from "jspdf";
import { getDocBranding } from "@/lib/erp/utils/doc-branding";
import autoTable from "jspdf-autotable";
import { fmtBdt } from "@/lib/erp/finance";

export type ExportRow = {
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
  orders?: { shipping_name: string | null; shipping_phone: string | null; total: number; status: string } | null;
};

export type ExportRun = {
  id: string;
  created_at: string;
  source_filename: string | null;
  status: string;
  total_rows: number;
  matched_count: number;
  mismatched_count: number;
  unmatched_count: number;
  total_collected: number;
  total_fee: number;
  total_payout: number;
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(filename: string, mime: string, content: BlobPart) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportReconciliationCsv(run: ExportRun, rows: ExportRow[]) {
  const header = [
    "Status",
    "Consignment",
    "Merchant Order ID",
    "Invoice Date",
    "Customer Name",
    "Customer Phone",
    "Matched Order",
    "Matched Via",
    "Order Total",
    "Collected",
    "Fee",
    "Payout",
    "Amount Diff",
  ];
  const lines: string[] = [];
  lines.push(`Pathao Reconciliation Report`);
  lines.push(`Run,${csvEscape(run.id)}`);
  lines.push(`File,${csvEscape(run.source_filename ?? "")}`);
  lines.push(`Created,${csvEscape(new Date(run.created_at).toLocaleString())}`);
  lines.push(`Status,${csvEscape(run.status)}`);
  lines.push("");
  lines.push("Summary");
  lines.push(`Total rows,${run.total_rows}`);
  lines.push(`Matched,${run.matched_count}`);
  lines.push(`Amount mismatch,${run.mismatched_count}`);
  lines.push(`Unmatched/duplicate,${run.unmatched_count}`);
  lines.push(`Collected,${run.total_collected}`);
  lines.push(`Courier fees,${run.total_fee}`);
  lines.push(`Net payout,${run.total_payout}`);
  lines.push("");
  lines.push(header.join(","));
  for (const r of rows) {
    lines.push(
      [
        r.match_status,
        r.consignment_id ?? "",
        r.merchant_order_id ?? "",
        r.invoice_date ?? "",
        r.orders?.shipping_name ?? r.recipient_name ?? "",
        r.orders?.shipping_phone ?? r.recipient_phone ?? "",
        r.matched_order_id ?? "",
        r.matched_via ?? "",
        r.orders?.total ?? "",
        r.collected,
        r.total_fee,
        r.payout,
        r.amount_diff ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const date = new Date(run.created_at).toISOString().slice(0, 10);
  download(`reconciliation-${date}-${run.id.slice(0, 8)}.csv`, "text/csv;charset=utf-8", lines.join("\n"));
}

export function exportReconciliationPdf(run: ExportRun, rows: ExportRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 32;
  const brand = getDocBranding();
  let y = margin;

  // Branded masthead
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 27, 75);
  doc.text(brand.company || "Synq With Us", margin, y);
  const contact = [brand.address, brand.phone, brand.email, brand.website].filter(Boolean).join(" · ");
  if (contact) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(contact, margin, y + 12);
  }
  doc.setDrawColor(30, 27, 75);
  doc.setLineWidth(1.5);
  y += contact ? 22 : 12;
  doc.line(margin, y, doc.internal.pageSize.getWidth() - margin, y);
  y += 20;

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Pathao Reconciliation Report", margin, y);
  y += 16;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  doc.text(
    `File: ${run.source_filename ?? "—"}    Run: ${run.id.slice(0, 8)}    Status: ${run.status}    Created: ${new Date(run.created_at).toLocaleString()}`,
    margin,
    y,
  );
  doc.setTextColor(0);
  y += 16;


  // Summary block
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Total consignments", String(run.total_rows)],
      ["Matched", String(run.matched_count)],
      ["Amount mismatch", String(run.mismatched_count)],
      ["Unmatched / duplicate", String(run.unmatched_count)],
      ["Total collected", fmtBdt(run.total_collected)],
      ["Courier fees", fmtBdt(run.total_fee)],
      ["Net payout", fmtBdt(run.total_payout)],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: margin, right: margin },
    tableWidth: 280,
  });
  // @ts-expect-error autoTable adds lastAutoTable
  y = (doc.lastAutoTable?.finalY ?? y) + 18;

  const renderSection = (title: string, list: ExportRow[]) => {
    if (!list.length) return;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${title} (${list.length})`, margin, y);
    y += 6;
    autoTable(doc, {
      startY: y + 4,
      head: [["Consignment", "Order ID", "Customer", "Phone", "Collected", "Fee", "Payout", "Diff", "Via"]],
      body: list.map((r) => [
        r.consignment_id ?? "—",
        r.merchant_order_id ?? "—",
        r.orders?.shipping_name ?? r.recipient_name ?? "—",
        r.orders?.shipping_phone ?? r.recipient_phone ?? "—",
        fmtBdt(r.collected),
        fmtBdt(r.total_fee),
        fmtBdt(r.payout),
        r.amount_diff !== null && r.amount_diff !== undefined ? r.amount_diff.toFixed(0) : "—",
        r.matched_via ?? "—",
      ]),
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [37, 99, 235] },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        // page footer
      },
    });
    // @ts-expect-error autoTable adds lastAutoTable
    y = (doc.lastAutoTable?.finalY ?? y) + 18;
  };

  const matched = rows.filter((r) => r.match_status === "matched");
  const mismatch = rows.filter((r) => r.match_status === "amount_mismatch");
  const duplicates = rows.filter((r) => r.match_status === "duplicate");
  const unmatched = rows.filter((r) => r.match_status === "unmatched");

  renderSection("Matched", matched);
  renderSection("Amount mismatch", mismatch);
  renderSection("Duplicates", duplicates);
  renderSection("Unmatched", unmatched);

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - margin,
      doc.internal.pageSize.getHeight() - 12,
      { align: "right" },
    );
  }

  const date = new Date(run.created_at).toISOString().slice(0, 10);
  doc.save(`reconciliation-${date}-${run.id.slice(0, 8)}.pdf`);
}