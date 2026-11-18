/**
 * Packing Station data layer. Packers have no direct rights on orders; every
 * read and status move goes through SECURITY DEFINER RPCs (pack_*), which
 * check the role/brand server-side and only allow
 * confirmed → packaging → packed → ready_to_ship.
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export type PackStatus =
  "confirmed" | "ready_to_pack" | "packaging" | "packed" | "ready_to_ship" | string;
export type PackMode = "auto" | "pack" | "packed" | "ready";

export type PackOrder = {
  id: string;
  invoice_no: string | null;
  status: PackStatus;
  brand_id: string | null;
  customer: string | null;
  area: string | null;
  courier: string | null;
  tracking: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  items: { name: string; variant: string | null; qty: number; image: string | null }[];
  item_count: number;
  last_by: string | null;
  from_status?: PackStatus;
};

export type PackStats = {
  to_pack: number;
  packing: number;
  packed: number;
  ready: number;
  my_packed_today: number;
  my_scans_today: number;
};

export const packQueue = (brandIds: string[] | null) =>
  rpc<PackOrder[]>("pack_queue", { _brand_ids: brandIds && brandIds.length ? brandIds : null });
export const packLookup = (code: string) => rpc<PackOrder[]>("pack_lookup", { _code: code });

export type ScanCodeResult =
  | { result: "ok"; order: PackOrder }
  | { result: "error"; message: string; order: PackOrder | null }
  | { result: "choose"; choices: PackOrder[] }
  | { result: "not_found" };

/** Find + move in one round trip (the scanner path). */
export const packScanCode = (code: string, mode: PackMode) =>
  rpc<ScanCodeResult>("pack_scan_code", { _code: code, _mode: mode });
export const packScan = (orderId: string, mode: PackMode) =>
  rpc<PackOrder>("pack_scan", { _order_id: orderId, _mode: mode });
export const packUndo = (orderId: string) => rpc<PackOrder>("pack_undo", { _order_id: orderId });
export const packStats = (brandIds: string[] | null) =>
  rpc<PackStats | null>("pack_my_stats", {
    _brand_ids: brandIds && brandIds.length ? brandIds : null,
  });

export const PACK_STAGE: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Pending", cls: "bg-blue-500/10 text-blue-700" },
  ready_to_pack: { label: "Ready to pack", cls: "bg-fuchsia-500/10 text-fuchsia-700" },
  packaging: { label: "Packing", cls: "bg-fuchsia-500/10 text-fuchsia-700" },
  packed: { label: "Packed", cls: "bg-purple-500/10 text-purple-700" },
  ready_to_ship: { label: "RTS", cls: "bg-cyan-500/10 text-cyan-700" },
};

export const NEXT_LABEL: Record<string, string> = {
  confirmed: "Packing-এ নেবে",
  ready_to_pack: "Packed হবে",
  packaging: "Packed হবে",
  packed: "RTS হবে",
};
