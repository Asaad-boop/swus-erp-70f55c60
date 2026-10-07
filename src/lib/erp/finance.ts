export type TxnType = "income" | "expense" | "transfer" | "adjustment";

export type Account = {
  id: string;
  brand_id: string | null;
  name: string;
  account_type: string;
  account_number: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  notes: string | null;
  wallet_type?: string;
  account_subtype?: string | null;
};

export type Category = {
  id: string;
  brand_id: string;
  name: string;
  kind: string;
  is_active: boolean;
};

export type Transaction = {
  id: string;
  brand_id: string;
  txn_type: string;
  category_id: string | null;
  account_id: string | null;
  to_account_id: string | null;
  amount: number;
  reference_type: string | null;
  reference_id: string | null;
  supplier_id: string | null;
  description: string | null;
  transaction_date: string;
  created_at: string;
};

export const TXN_TYPE_LABEL: Record<string, { label: string; className: string }> = {
  income: { label: "Income", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  expense: { label: "Expense", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  transfer: { label: "Transfer", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  adjustment: { label: "Adjustment", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
};

export const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "rocket", label: "Rocket" },
  { value: "other", label: "Other" },
] as const;

export type AccountTypeMeta = {
  value: string;
  label: string;
  group: "cash" | "bank" | "mfs" | "courier" | "loan" | "equity" | "other";
  hint?: string;
};

export const ACCOUNT_TYPE_CATALOG: AccountTypeMeta[] = [
  { value: "cash", label: "Cash in Hand", group: "cash", hint: "Office / drawer cash" },
  { value: "petty_cash", label: "Petty Cash", group: "cash", hint: "Small daily expenses" },

  { value: "bank", label: "Bank Account", group: "bank", hint: "Current / savings" },
  { value: "bank_savings", label: "Bank — Savings", group: "bank" },
  { value: "bank_current", label: "Bank — Current", group: "bank" },

  { value: "bkash", label: "bKash", group: "mfs" },
  { value: "nagad", label: "Nagad", group: "mfs" },
  { value: "rocket", label: "Rocket", group: "mfs" },
  { value: "upay", label: "Upay", group: "mfs" },

  { value: "courier_wallet", label: "Courier COD Wallet", group: "courier", hint: "Pathao / Steadfast / RedX" },

  { value: "loan", label: "Loan / Liability", group: "loan", hint: "Money you owe" },
  { value: "credit_card", label: "Credit Card", group: "loan" },

  { value: "equity", label: "Owner Equity", group: "equity", hint: "Capital invested" },

  { value: "other", label: "Other", group: "other" },
];

export const ACCOUNT_GROUP_META: Record<AccountTypeMeta["group"], { label: string; icon: string; accent: string }> = {
  cash:    { label: "Cash",         icon: "💵", accent: "text-emerald-600" },
  bank:    { label: "Bank",         icon: "🏦", accent: "text-blue-600" },
  mfs:     { label: "Mobile Wallet", icon: "📱", accent: "text-pink-600" },
  courier: { label: "Courier COD",  icon: "🚚", accent: "text-orange-600" },
  loan:    { label: "Loan / Credit", icon: "💳", accent: "text-red-600" },
  equity:  { label: "Equity",       icon: "🏛️", accent: "text-purple-600" },
  other:   { label: "Other",        icon: "📂", accent: "text-muted-foreground" },
};

export function fmtBdt(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  const hasFraction = Math.round(Math.abs(v) * 100) % 100 !== 0;
  return "৳" + v.toLocaleString("en-IN", { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2 });
}

export function exportTransactionsCsv(
  rows: Transaction[],
  catMap: Map<string, string>,
  accMap: Map<string, string>,
): string {
  const headers = ["Date", "Type", "Category", "Account", "To Account", "Amount", "Reference", "Description"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const t of rows) {
    lines.push([
      t.transaction_date,
      t.txn_type,
      t.category_id ? catMap.get(t.category_id) ?? "" : "",
      t.account_id ? accMap.get(t.account_id) ?? "" : "",
      t.to_account_id ? accMap.get(t.to_account_id) ?? "" : "",
      t.amount,
      t.reference_type ?? "",
      t.description ?? "",
    ].map(esc).join(","));
  }
  return lines.join("\n");
}
/** Today's date (YYYY-MM-DD) in Asia/Dhaka — never use UTC toISOString for business dates. */
export function dhakaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}
