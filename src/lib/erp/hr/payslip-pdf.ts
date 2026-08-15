import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { HrCompany } from "@/lib/erp/hr/company";

export type PayslipEmployee = {
  full_name: string;
  employee_code?: string | null;
  designation?: string | null;
  department?: string | null;
  join_date?: string | null;
  phone?: string | null;
  email?: string | null;
  payment_method?: string | null;
  payment_number?: string | null;
  employment_type?: string | null;
};

export type PayslipData = {
  employee: PayslipEmployee;
  month: string; // YYYY-MM
  runStatus: string;
  paidAt?: string | null;
  base_salary: number;
  present_days: number;
  absent_days: number;
  overtime_amount: number;
  bonus: number;
  allowance: number;
  deduction: number;
  advance_deduction: number;
  net_pay: number;
  note?: string | null;
};

const ACCENT: [number, number, number] = [79, 70, 229];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [110, 118, 135];

type StatusStyle = {
  key: "draft" | "approved" | "paid";
  chip: string;
  watermark: string;
  color: [number, number, number];
  subtext: string;
};

/** Draft / Approved / Paid each get their own watermark + legal subtext. */
export function payslipStatusStyle(runStatus: string, paidAt?: string | null): StatusStyle {
  const s = String(runStatus || "draft").toLowerCase();
  if (s === "paid" || s === "completed") {
    return {
      key: "paid",
      chip: `Paid${paidAt ? ` · ${String(paidAt).slice(0, 10)}` : ""}`,
      watermark: "PAID",
      color: [22, 163, 74],
      subtext: `Payment released${paidAt ? ` on ${String(paidAt).slice(0, 10)}` : ""}. This payslip is final and valid as a record of payment.`,
    };
  }
  if (s === "approved" || s === "locked") {
    return {
      key: "approved",
      chip: "Approved",
      watermark: "APPROVED",
      color: [217, 119, 6],
      subtext: "Approved by management — payment is scheduled but not yet disbursed.",
    };
  }
  return {
    key: "draft",
    chip: "Draft",
    watermark: "DRAFT",
    color: [220, 38, 38],
    subtext: "Draft only — figures may change and this is not proof of payment.",
  };
}

/** Big translucent diagonal stamp across the page. */
function drawWatermark(doc: jsPDF, text: string, color: [number, number, number]) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const anyDoc = doc as any;
  try {
    if (anyDoc.GState) doc.setGState(new anyDoc.GState({ opacity: 0.08 }));
  } catch {
    /* opacity unsupported — fall back to a light colour */
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(text.length > 6 ? 62 : 80);
  doc.setTextColor(...color);
  doc.text(text, pageW / 2 - 20, pageH * 0.62, { align: "center", angle: 30 });
  try {
    if (anyDoc.GState) doc.setGState(new anyDoc.GState({ opacity: 1 }));
  } catch {
    /* noop */
  }
  doc.setTextColor(...INK);
}

const n = (v: unknown) => Number(v ?? 0) || 0;
/** Helvetica has no Taka glyph, so amounts are printed as `BDT 1,234`. */
const bdt = (v: unknown) => {
  const x = n(v);
  const frac = Math.abs(x % 1) > 0.004 ? 2 : 0;
  return `BDT ${x.toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac })}`;
};

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
};

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoDigits = (x: number): string => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? ` ${ONES[x % 10]}` : ""}`);

/** South-Asian numbering (lakh / crore) — matches how salaries are read out locally. */
export function amountInWords(value: number): string {
  const amount = Math.floor(Math.abs(value));
  if (amount === 0) return "Zero Taka Only";
  const parts: string[] = [];
  const units: Array<[number, string]> = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
    [100, "Hundred"],
  ];
  let rest = amount;
  for (const [div, label] of units) {
    const q = Math.floor(rest / div);
    if (q > 0) {
      parts.push(`${q > 99 ? twoDigits(Math.floor(q / 100)) + " Hundred " : ""}${twoDigits(q % 100)} ${label}`.trim());
      rest %= div;
    }
  }
  if (rest > 0) parts.push(twoDigits(rest));
  const paisa = Math.round((Math.abs(value) - amount) * 100);
  return `${parts.join(" ")} Taka${paisa ? ` and ${twoDigits(paisa)} Paisa` : ""} Only`;
}

/** Loads a logo into a data URL so jsPDF can embed it; returns null when unavailable. */
async function loadLogo(url: string): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("read failed"));
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = data;
    });
    if (!dims.w || !dims.h) return null;
    return { data, ...dims };
  } catch {
    return null;
  }
}

function lastY(doc: jsPDF, fallback: number) {
  // @ts-expect-error jspdf-autotable augments the doc instance
  return (doc.lastAutoTable?.finalY as number | undefined) ?? fallback;
}

function drawPayslipPage(
  doc: jsPDF,
  slip: PayslipData,
  company: HrCompany,
  logo: { data: string; w: number; h: number } | null,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;
  const contentW = pageW - M * 2;
  const status = payslipStatusStyle(slip.runStatus, slip.paidAt);

  /* ---------- header band ---------- */
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, pageW, 104, "F");

  let textX = M;
  if (logo) {
    const h = 44;
    const w = Math.min(120, (logo.w / logo.h) * h);
    try {
      doc.addImage(logo.data, M, 26, w, h, undefined, "FAST");
      textX = M + w + 14;
    } catch {
      /* unsupported image format — fall back to text-only header */
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(company.name || "Company", textX, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const headLines = [
    company.legal_name,
    company.address,
    [company.phone && `Phone: ${company.phone}`, company.email, company.website].filter(Boolean).join("   |   "),
    company.bin && `BIN: ${company.bin}`,
  ].filter(Boolean) as string[];
  let hy = 56;
  for (const line of headLines.slice(0, 4)) {
    doc.text(doc.splitTextToSize(line, contentW - (textX - M) - 150)[0], textX, hy);
    hy += 11;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("PAYSLIP", pageW - M, 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(monthLabel(slip.month), pageW - M, 55, { align: "right" });
  doc.text(status.chip, pageW - M, 68, { align: "right" });

  /* ---------- employee block ---------- */
  const info: Array<[string, string]> = [
    ["Employee", slip.employee.full_name || "—"],
    ["Employee ID", slip.employee.employee_code || "—"],
    ["Designation", slip.employee.designation || "—"],
    ["Department", slip.employee.department || "—"],
    ["Joining date", slip.employee.join_date ? String(slip.employee.join_date).slice(0, 10) : "—"],
    ["Employment", slip.employee.employment_type || "—"],
    ["Contact", slip.employee.phone || slip.employee.email || "—"],
    [
      "Pay mode",
      [slip.employee.payment_method, slip.employee.payment_number].filter(Boolean).join(" · ") || "—",
    ],
  ];
  const body = [];
  for (let i = 0; i < info.length; i += 2) {
    body.push([info[i][0], info[i][1], info[i + 1]?.[0] ?? "", info[i + 1]?.[1] ?? ""]);
  }

  autoTable(doc, {
    startY: 124,
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.5 },
    columnStyles: {
      0: { cellWidth: 78, fontStyle: "bold", textColor: MUTED, fillColor: [248, 250, 252] },
      1: { cellWidth: (contentW - 156) / 2 },
      2: { cellWidth: 78, fontStyle: "bold", textColor: MUTED, fillColor: [248, 250, 252] },
      3: { cellWidth: (contentW - 156) / 2 },
    },
    margin: { left: M, right: M },
  });

  /* ---------- earnings / deductions ---------- */
  const gross = n(slip.base_salary) + n(slip.overtime_amount) + n(slip.bonus) + n(slip.allowance);
  const totalDed = n(slip.deduction) + n(slip.advance_deduction);
  const tableTop = lastY(doc, 200) + 18;
  const colW = (contentW - 16) / 2;

  autoTable(doc, {
    startY: tableTop,
    head: [["Earnings", "Amount"]],
    body: [
      ["Basic salary", bdt(slip.base_salary)],
      ["Overtime", bdt(slip.overtime_amount)],
      ["Bonus", bdt(slip.bonus)],
      ["Allowance", bdt(slip.allowance)],
    ],
    foot: [["Gross earnings", bdt(gross)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: ACCENT, textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [238, 242, 255], textColor: INK, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: colW - 96 }, 1: { cellWidth: 96, halign: "right" } },
    margin: { left: M, right: M },
    tableWidth: colW,
  });
  const leftEnd = lastY(doc, tableTop);

  autoTable(doc, {
    startY: tableTop,
    head: [["Deductions", "Amount"]],
    body: [
      ["Deduction", bdt(slip.deduction)],
      ["Advance adjustment", bdt(slip.advance_deduction)],
      ["Absent adjustment", bdt(0)],
      ["Other", bdt(0)],
    ],
    foot: [["Total deductions", bdt(totalDed)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [100, 116, 139], textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: colW - 96 }, 1: { cellWidth: 96, halign: "right" } },
    margin: { left: M + colW + 16, right: M },
    tableWidth: colW,
  });

  let y = Math.max(leftEnd, lastY(doc, tableTop)) + 20;

  /* ---------- attendance strip ---------- */
  const stats: Array<[string, string]> = [
    ["Present days", `${n(slip.present_days)}`],
    ["Absent days", `${n(slip.absent_days)}`],
    ["Overtime pay", bdt(slip.overtime_amount)],
    ["Gross earnings", bdt(gross)],
  ];
  const boxW = (contentW - 3 * 10) / 4;
  stats.forEach(([label, value], i) => {
    const x = M + i * (boxW + 10);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, boxW, 44, 6, 6, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 10, y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(value, x + 10, y + 33);
  });
  y += 62;

  /* ---------- net pay ---------- */
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.8);
  doc.roundedRect(M, y, contentW, 58, 8, 8, "FD");
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("NET PAYABLE", M + 14, y + 20);
  doc.setTextColor(...ACCENT);
  doc.setFontSize(20);
  doc.text(bdt(slip.net_pay), pageW - M - 14, y + 26, { align: "right" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(
    doc.splitTextToSize(`In words: ${amountInWords(n(slip.net_pay))}`, contentW - 28),
    M + 14,
    y + 44,
  );
  y += 78;

  if (slip.note) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(`Note: ${slip.note}`, contentW), M, y);
    y += 22;
  }

  /* ---------- status subtext ---------- */
  doc.setFillColor(...status.color);
  doc.roundedRect(M, y - 9, 6, 24, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...status.color);
  doc.text(status.watermark, M + 14, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text(doc.splitTextToSize(status.subtext, contentW - 20), M + 14, y + 11);
  y += 30;

  /* ---------- signatures ---------- */
  const pageH = doc.internal.pageSize.getHeight();

  // "End of payslip" rule keeps the blank tail of the page looking intentional.
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  const ruleY = y + 6;
  doc.line(M, ruleY, M + contentW / 2 - 52, ruleY);
  doc.line(M + contentW / 2 + 52, ruleY, M + contentW, ruleY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("END OF PAYSLIP", M + contentW / 2, ruleY + 3, { align: "center" });

  const sigY = Math.max(y + 60, pageH - 120);

  // Document frame — makes the page read as one printed form.
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.7);
  doc.roundedRect(M - 12, 116, contentW + 24, pageH - 116 - 58, 10, 10, "S");
  doc.setDrawColor(180, 188, 200);
  doc.setLineWidth(0.6);
  doc.line(M, sigY, M + 160, sigY);
  doc.line(pageW - M - 160, sigY, pageW - M, sigY);
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.text("Employee signature", M, sigY + 12);
  doc.text(company.signatory_name || company.name || "", pageW - M, sigY + 12, { align: "right" });
  doc.text(company.signatory_title || "Authorised Signatory", pageW - M, sigY + 23, { align: "right" });

  if (company.footer_note) {
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(company.footer_note, contentW), M, pageH - 40);
  }
  doc.setFontSize(7.5);
  doc.text(
    `Generated ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} (Asia/Dhaka)`,
    pageW - M,
    pageH - 28,
    { align: "right" },
  );

  // Stamp last so it reads over the tables instead of being hidden behind them.
  drawWatermark(doc, status.watermark, status.color);
}

/** Builds the payslip document — one A4 page per employee. */
export async function buildPayslipDoc(slips: PayslipData[], company: HrCompany): Promise<jsPDF> {
  if (!slips.length) throw new Error("Kono payslip nei");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const logo = await loadLogo(company.logo_url);

  slips.forEach((slip, i) => {
    if (i > 0) doc.addPage();
    drawPayslipPage(doc, slip, company, logo);
  });

  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`Page ${i} of ${pages}`, 40, doc.internal.pageSize.getHeight() - 30);
    }
  }
  return doc;
}

/** Builds a payslip PDF and triggers a download. */
export async function exportPayslipPdf(slips: PayslipData[], company: HrCompany, filename: string) {
  const doc = await buildPayslipDoc(slips, company);
  doc.save(filename);
}

/** Object URL for in-app preview / print. Caller must revoke it. */
export async function payslipPreviewUrl(slips: PayslipData[], company: HrCompany): Promise<string> {
  const doc = await buildPayslipDoc(slips, company);
  return URL.createObjectURL(doc.output("blob"));
}
