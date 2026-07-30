/** BulkSMSBD (https://bulksmsbd.net) provider helpers — server only. */

const SEND_URL = "https://bulksmsbd.net/api/smsapi";
const BALANCE_URL = "https://bulksmsbd.net/api/getBalanceApi";

export type BulkSmsResult = {
  ok: boolean;
  code: number | null;
  message: string;
  raw: string;
};

const CODE_MESSAGES: Record<number, string> = {
  202: "SMS Submitted Successfully",
  1001: "Invalid Number",
  1002: "Sender ID not correct / disabled",
  1003: "Please fill all required fields / contact system administrator",
  1005: "Internal Error",
  1006: "Balance validity not available",
  1007: "Balance insufficient",
  1011: "User ID not found",
  1012: "Masking SMS must be sent in Bengali",
  1013: "Sender ID has no gateway by API key",
  1014: "Sender type name not found by this API key",
  1015: "No valid gateway for this sender ID",
  1016: "Sender type name active price info not found",
  1017: "Sender type name price info not found",
  1018: "Account is disabled",
  1019: "Sender type name price is disabled",
  1020: "Parent account not found",
  1021: "Parent active sender type price is not found",
  1031: "Account not verified — please contact administrator",
  1032: "IP not whitelisted",
};

function parseResult(raw: string): BulkSmsResult {
  let code: number | null = null;
  let message = raw.slice(0, 300);
  try {
    const json = JSON.parse(raw) as { response_code?: number; success_message?: string; error_message?: string };
    if (typeof json.response_code === "number") code = json.response_code;
    message = json.success_message || json.error_message || CODE_MESSAGES[code ?? -1] || message;
  } catch {
    const m = raw.match(/\d{3,4}/);
    if (m) code = Number(m[0]);
    if (code && CODE_MESSAGES[code]) message = CODE_MESSAGES[code];
  }
  return { ok: code === 202, code, message, raw: raw.slice(0, 1000) };
}

export async function sendBulkSms(args: {
  apiKey: string;
  senderId: string;
  numbers: string[];
  message: string;
}): Promise<BulkSmsResult> {
  const body = new URLSearchParams({
    api_key: args.apiKey,
    type: "text",
    senderid: args.senderId,
    number: args.numbers.join(","),
    message: args.message,
  });
  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const raw = await res.text();
  const parsed = parseResult(raw);
  if (!res.ok && parsed.code === null) {
    return { ok: false, code: res.status, message: `HTTP ${res.status}: ${raw.slice(0, 200)}`, raw };
  }
  return parsed;
}

export async function getBulkSmsBalance(apiKey: string): Promise<{ balance: number | null; raw: string }> {
  const res = await fetch(`${BALANCE_URL}?api_key=${encodeURIComponent(apiKey)}`);
  const raw = await res.text();
  try {
    const json = JSON.parse(raw) as { balance?: number | string; response_code?: number };
    const b = json.balance;
    return { balance: b === undefined ? null : Number(b), raw: raw.slice(0, 500) };
  } catch {
    const m = raw.match(/-?\d+(\.\d+)?/);
    return { balance: m ? Number(m[0]) : null, raw: raw.slice(0, 500) };
  }
}

/** Replace {token} placeholders with values (missing tokens become ""). */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>) {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}