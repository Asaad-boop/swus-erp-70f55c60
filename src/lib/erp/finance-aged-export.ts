import { printHtml } from "@/lib/erp/utils/pdf";
import { exportToXlsx } from "@/lib/erp/utils/excel";

export type AgingBuckets = {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
};

export function bucketize(age: number, amount: number): AgingBuckets {
  const b: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: amount };
  if (age <= 0) b.current = amount;
  else if (age <= 30) b.d1_30 = amount;
  else if (age <= 60) b.d31_60 = amount;
  else if (age <= 90) b.d61_90 = amount;
  else b.d90_plus = amount;
  return b;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n || 0);

type RowBase = {
  name: string;
  contact: string;
  docNo: string;
  docDate: string;
  dueDate: string;
  age: number;
  outstanding: number;
};

export function exportAgedExcel(opts: {
  rows: RowBase[];
  kind: "receivables" | "payables";
  asOfDate: string;
}) {
  const { rows, kind, asOfDate } = opts;
  const isAR = kind === "receivables";
  const nameCol = isAR ? "Customer" : "Supplier";
  const docCol = isAR ? "Invoice/Order #" : "Bill #";
  const dateCol = isAR ? "Invoice Date" : "Bill Date";
  const exportRows = rows.map((r) => {
    const b = bucketize(r.age, r.outstanding);
    return {
      [nameCol]: r.name,
      Contact: r.contact,
      [docCol]: r.docNo,
      [dateCol]: r.docDate,
      "Due Date": r.dueDate,
      Current: b.current,
      "1-30 Days": b.d1_30,
      "31-60 Days": b.d31_60,
      "61-90 Days": b.d61_90,
      "90+ Days": b.d90_plus,
      "Total Due": r.outstanding,
    };
  });
  const fname = `aged_${kind}_${asOfDate}.xlsx`;
  exportToXlsx(exportRows, isAR ? "Aged Receivables" : "Aged Payables", fname);
}

export function exportAgedPdf(opts: {
  rows: RowBase[];
  kind: "receivables" | "payables";
  asOfDate: string;
  companyName?: string;
}) {
  const { rows, kind, asOfDate, companyName } = opts;
  const isAR = kind === "receivables";
  const title = isAR ? "Aged Receivables Report" : "Aged Payables Report";
  const nameCol = isAR ? "Customer" : "Supplier";
  const docCol = isAR ? "Invoice/Order #" : "Bill #";

  const totals: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
  const body = rows.map((r) => {
    const b = bucketize(r.age, r.outstanding);
    totals.current += b.current;
    totals.d1_30 += b.d1_30;
    totals.d31_60 += b.d31_60;
    totals.d61_90 += b.d61_90;
    totals.d90_plus += b.d90_plus;
    totals.total += r.outstanding;
    return `<tr>
      <td>${escape(r.name)}</td>
      <td>${escape(r.contact)}</td>
      <td>${escape(r.docNo)}</td>
      <td>${escape(r.docDate)}</td>
      <td>${escape(r.dueDate)}</td>
      <td class="right">${fmt(b.current)}</td>
      <td class="right">${fmt(b.d1_30)}</td>
      <td class="right">${fmt(b.d31_60)}</td>
      <td class="right">${fmt(b.d61_90)}</td>
      <td class="right">${fmt(b.d90_plus)}</td>
      <td class="right"><strong>${fmt(r.outstanding)}</strong></td>
    </tr>`;
  }).join("");

  const html = `

    <table>
      <thead>
        <tr>
          <th>${nameCol}</th>
          <th>Contact</th>
          <th>${docCol}</th>
          <th>Date</th>
          <th>Due Date</th>
          <th class="right">Current</th>
          <th class="right">1-30</th>
          <th class="right">31-60</th>
          <th class="right">61-90</th>
          <th class="right">90+</th>
          <th class="right">Total Due</th>
        </tr>
      </thead>
      <tbody>${body || `<tr><td colspan="11" class="muted" style="text-align:center;padding:20px;">No outstanding ${kind}.</td></tr>`}</tbody>
      <tfoot>
        <tr class="totals">
          <td colspan="5"><strong>Totals</strong></td>
          <td class="right">${fmt(totals.current)}</td>
          <td class="right">${fmt(totals.d1_30)}</td>
          <td class="right">${fmt(totals.d31_60)}</td>
          <td class="right">${fmt(totals.d61_90)}</td>
          <td class="right">${fmt(totals.d90_plus)}</td>
          <td class="right"><strong>${fmt(totals.total)}</strong></td>
        </tr>
      </tfoot>
    </table>
  `;

  printHtml(html, {
    title: `${title} — ${asOfDate}`,
    docTitle: title,
    subtitle: `As of ${asOfDate}`,
    meta: [companyName || null, `${rows.length} rows`],
    landscape: true,
  });

}

function escape(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}