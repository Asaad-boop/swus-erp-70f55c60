/**
 * Chat → order, without leaving the inbox. Reads the chat (name, phone,
 * address, products, colour, quantity), lets staff check it in one place,
 * books the order and tells the customer in the same chat.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  MapPin,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Truck,
  User2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { extractOrderFn } from "@/lib/erp/inbox/inbox-ai.functions";
import { pathaoMatchAddressFn } from "@/lib/erp/pathao.functions";
import { sendOrderSms } from "@/lib/erp/sms/sms.functions";
import { usePathaoAreas, usePathaoCities, usePathaoZones } from "@/hooks/erp/use-courier-query";
import { bdPhoneError, normalizeBdPhone } from "@/lib/erp/orders";
import {
  PLATFORM_LABEL,
  displayName,
  sendReply,
  updateConversation,
  type InboxConversation,
} from "@/lib/erp/inbox/inbox";
import {
  confirmationText,
  createInboxOrder,
  draftProblems,
  draftTotals,
  matchColor,
  type QuickLine,
  type QuickOrderDraft,
} from "@/lib/erp/inbox/quick-order";

type Place = { id: number; name: string } | null;
type Variant = {
  id: string;
  color_name: string | null;
  color_hex: string | null;
  image: string | null;
  stock: number | null;
};

const tk = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;
const FEES = [0, 70, 120, 130];

export function QuickOrderSheet({
  conversation: c,
  open,
  onOpenChange,
}: {
  conversation: InboxConversation;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const extractFn = useServerFn(extractOrderFn);
  const matchAddressFn = useServerFn(pathaoMatchAddressFn);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState<Place>(null);
  const [zone, setZone] = useState<Place>(null);
  const [area, setArea] = useState<Place>(null);
  const [placeEdit, setPlaceEdit] = useState(false);
  const [lines, setLines] = useState<QuickLine[]>([]);
  const [shippingFee, setShippingFee] = useState(120);
  const feeTouched = useRef(false);
  const [discount, setDiscount] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [advanceSource, setAdvanceSource] = useState("bKash");
  const [advanceNumber, setAdvanceNumber] = useState("");
  const [note, setNote] = useState("");
  const [tellCustomer, setTellCustomer] = useState(true);
  const [found, setFound] = useState<{ name: boolean; phone: boolean; address: boolean }>({
    name: false,
    phone: false,
    address: false,
  });
  const [done, setDone] = useState<{
    id: string;
    invoiceNo: string | null;
    awaiting: boolean;
  } | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // ── read the chat when the sheet opens ───────────────────────────────
  const extract = useMutation({
    mutationFn: () => extractFn({ data: { conversationId: c.id } }),
    onSuccess: (r) => {
      setName(r.name || c.contact_name || "");
      setPhone(r.phone || c.contact_phone || "");
      setAddress(r.address || "");
      setNote(r.note || "");
      setFound({ name: !!r.name, phone: !!r.phone, address: !!r.address });
      setLines(
        r.items.map((it) => ({
          key: crypto.randomUUID(),
          productId: it.productId,
          title: it.title,
          price: it.price,
          quantity: it.quantity,
          image: it.image,
          stock: it.stock,
          variantId: null,
          variantLabel: null,
          needsVariant: false,
          wantedColor: it.color,
        })),
      );
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setName(c.contact_name ?? "");
      setPhone(c.contact_phone ?? "");
    },
  });
  useEffect(() => {
    if (!open) return;
    setDone(null);
    setShowErrors(false);
    setCity(null);
    setZone(null);
    setArea(null);
    setPlaceEdit(false);
    setLines([]);
    setDiscount(0);
    setAdvance(0);
    setAdvanceNumber("");
    setShippingFee(120);
    feeTouched.current = false;
    extract.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, c.id]);

  // ── address → Pathao city / zone / area ──────────────────────────────
  const [debAddr, setDebAddr] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebAddr(address.trim()), 600);
    return () => clearTimeout(t);
  }, [address]);
  const placeQ = useQuery({
    queryKey: ["quick-order-place", c.brand_id, debAddr],
    enabled: open && debAddr.length >= 8,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () =>
      (await matchAddressFn({ data: { address: debAddr, brandId: c.brand_id } })) as {
        found?: boolean;
        city?: Place;
        zone?: Place;
        area?: Place;
      },
  });
  useEffect(() => {
    const r = placeQ.data;
    if (!r) return;
    if (r.found && r.city) {
      setCity(r.city);
      setZone(r.zone ?? null);
      setArea(r.area ?? null);
    } else {
      setPlaceEdit(true);
    }
  }, [placeQ.data]);
  // Dhaka 70, outside 120 — unless someone picked the fee by hand.
  useEffect(() => {
    if (feeTouched.current || !city) return;
    setShippingFee(/dhaka/i.test(city.name) ? 70 : 120);
  }, [city]);

  // ── the customer's earlier orders ────────────────────────────────────
  const cleanPhone = normalizeBdPhone(phone);
  const historyQ = useQuery({
    queryKey: ["quick-order-history", cleanPhone],
    enabled: open && !bdPhoneError(cleanPhone),
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id,status,total,created_at,shipping_name,shipping_address,pathao_city_id,pathao_city_name,pathao_zone_id,pathao_zone_name,pathao_area_id,pathao_area_name",
        )
        .or(`shipping_phone.eq.${cleanPhone},guest_phone.eq.${cleanPhone}`)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{
        id: string;
        status: string;
        total: number | null;
        created_at: string;
        shipping_name: string | null;
        shipping_address: string | null;
        pathao_city_id: number | null;
        pathao_city_name: string | null;
        pathao_zone_id: number | null;
        pathao_zone_name: string | null;
        pathao_area_id: number | null;
        pathao_area_name: string | null;
      }>;
    },
  });
  const history = historyQ.data ?? [];
  const returned = history.filter((o) => /return|cancel/i.test(o.status)).length;
  const delivered = history.filter((o) => /deliver|complete/i.test(o.status)).length;
  const last = history[0];
  const useLast = () => {
    if (!last) return;
    if (last.shipping_name) setName(last.shipping_name);
    if (last.shipping_address) setAddress(last.shipping_address);
    if (last.pathao_city_id)
      setCity({ id: Number(last.pathao_city_id), name: last.pathao_city_name ?? "" });
    setZone(
      last.pathao_zone_id
        ? { id: Number(last.pathao_zone_id), name: last.pathao_zone_name ?? "" }
        : null,
    );
    setArea(
      last.pathao_area_id
        ? { id: Number(last.pathao_area_id), name: last.pathao_area_name ?? "" }
        : null,
    );
  };

  // ── draft & totals ───────────────────────────────────────────────────
  const draft: QuickOrderDraft = {
    brandId: c.brand_id,
    conversationId: c.id,
    source: PLATFORM_LABEL[c.platform],
    name,
    phone,
    address,
    city,
    zone,
    area,
    lines,
    shippingFee,
    discount,
    advance,
    advanceSource,
    advanceNumber,
    note,
    awaiting: false,
  };
  const totals = draftTotals(draft);
  const problems = draftProblems(draft);
  const bad = (k: string) => showErrors && problems.includes(k);

  const create = useMutation({
    mutationFn: async (awaiting: boolean) => {
      const d = { ...draft, awaiting };
      const res = await createInboxOrder(d);
      return { ...res, d };
    },
    onSuccess: ({ id, invoiceNo, d }) => {
      setDone({ id, invoiceNo, awaiting: d.awaiting });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      // Remember who this customer is for next time.
      const patch: Record<string, string> = {};
      if (!c.contact_phone) patch.contact_phone = normalizeBdPhone(d.phone);
      if (!c.contact_name && d.name.trim()) patch.contact_name = d.name.trim();
      if (Object.keys(patch).length) void updateConversation(c.id, patch).catch(() => {});
      if (tellCustomer)
        sendReply(c.id, { text: confirmationText(d, invoiceNo), attachments: [] })
          .then(() => qc.invalidateQueries({ queryKey: ["inbox", "messages", c.id] }))
          .catch((e: Error) => toast.error(`Chat e message jayni: ${e.message}`));
      if (!d.awaiting)
        sendOrderSms({ data: { orderId: id, template: "order_confirm" } }).catch(() => {});
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = (awaiting: boolean) => {
    if (create.isPending) return;
    if (problems.length) {
      setShowErrors(true);
      toast.error(`Aage puron koro: ${problems.map(problemLabel).join(", ")}`);
      return;
    }
    create.mutate(awaiting);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit(false);
    }
  };

  const reading = extract.isPending;
  const inputCls = (err?: boolean) =>
    cn(
      "h-10 w-full rounded-xl border bg-background px-3 text-[14px] outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10",
      err ? "border-rose-400 ring-2 ring-rose-500/15" : "border-border",
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]"
        onKeyDown={onKey}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <Package className="h-4 w-4 text-primary" />
          <SheetTitle className="text-[15px] font-semibold">Chat theke order</SheetTitle>
          <span className="truncate text-[12px] text-muted-foreground">· {displayName(c)}</span>
          {reading && (
            <span className="ml-auto mr-8 flex items-center gap-1.5 text-[11.5px] text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chat porchi…
            </span>
          )}
        </div>

        {done ? (
          <Done
            done={done}
            told={tellCustomer}
            total={totals.cod}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {/* customer */}
              <section className="space-y-2.5">
                <SectionTitle icon={User2} title="Customer" />
                <Field label="Naam" found={found.name && !reading} error={bad("name")}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={reading ? "…" : "Customer er naam"}
                    className={inputCls(bad("name"))}
                  />
                </Field>
                <Field
                  label="Mobile"
                  found={found.phone && !reading}
                  error={bad("phone")}
                  hint={phone && bdPhoneError(phone) ? bdPhoneError(phone)! : undefined}
                >
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      placeholder="01XXXXXXXXX"
                      className={cn(inputCls(bad("phone")), "pl-8 tabular-nums tracking-wide")}
                    />
                  </div>
                </Field>
                {history.length > 0 && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px]",
                      returned >= 2 && returned >= delivered
                        ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
                    )}
                  >
                    <History className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">
                      Ager order {history.length}ta · delivered {delivered} · return/cancel{" "}
                      {returned}
                    </span>
                    {last?.shipping_address && last.shipping_address !== address && (
                      <button
                        type="button"
                        onClick={useLast}
                        className="shrink-0 font-semibold underline-offset-2 hover:underline"
                      >
                        Ager thikana nao
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* address */}
              <section className="space-y-2.5">
                <SectionTitle icon={MapPin} title="Thikana" />
                <Field
                  label="Full address"
                  found={found.address && !reading}
                  error={bad("address")}
                >
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={2}
                    placeholder="Basa/road, area, thana, jela"
                    className={cn(inputCls(bad("address")), "h-auto resize-none py-2 leading-snug")}
                  />
                </Field>
                <PlaceRow
                  brandId={c.brand_id}
                  loading={placeQ.isFetching}
                  city={city}
                  zone={zone}
                  area={area}
                  edit={placeEdit}
                  notFound={placeQ.data?.found === false}
                  onEdit={() => setPlaceEdit((v) => !v)}
                  onCity={(p) => {
                    setCity(p);
                    setZone(null);
                    setArea(null);
                  }}
                  onZone={(p) => {
                    setZone(p);
                    setArea(null);
                  }}
                  onArea={setArea}
                />
              </section>

              {/* products */}
              <section className="space-y-2.5">
                <SectionTitle
                  icon={Package}
                  title="Product"
                  right={
                    totals.qty > 0 ? (
                      <span className="text-[11.5px] text-muted-foreground">{totals.qty}ta</span>
                    ) : null
                  }
                />
                {reading && lines.length === 0 && (
                  <div className="h-16 animate-pulse rounded-xl bg-muted" />
                )}
                {lines.map((l) => (
                  <LineRow
                    key={l.key}
                    line={l}
                    error={showErrors && l.needsVariant && !l.variantId}
                    onChange={(patch) =>
                      setLines((xs) => xs.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))
                    }
                    onRemove={() => setLines((xs) => xs.filter((x) => x.key !== l.key))}
                  />
                ))}
                {bad("product") && (
                  <div className="text-[12px] text-rose-600">Kom kore 1ta product dao</div>
                )}
                <ProductPicker
                  brandId={c.brand_id}
                  onPick={(p) =>
                    setLines((xs) => [
                      ...xs,
                      {
                        key: crypto.randomUUID(),
                        productId: p.id,
                        title: p.title,
                        price: p.price,
                        quantity: 1,
                        image: p.image,
                        stock: p.stock,
                        variantId: null,
                        variantLabel: null,
                        needsVariant: false,
                      },
                    ])
                  }
                />
              </section>

              {/* money */}
              <section className="space-y-2.5">
                <SectionTitle icon={Truck} title="Delivery ar dam" />
                <div className="flex items-center gap-1.5">
                  <span className="w-24 text-[12.5px] text-muted-foreground">Delivery</span>
                  {FEES.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        feeTouched.current = true;
                        setShippingFee(f);
                      }}
                      className={cn(
                        "h-8 rounded-lg border px-2.5 text-[12.5px] font-medium tabular-nums transition",
                        shippingFee === f
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      {f === 0 ? "Free" : f}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    value={FEES.includes(shippingFee) ? "" : shippingFee}
                    onChange={(e) => {
                      feeTouched.current = true;
                      setShippingFee(Math.max(0, Number(e.target.value) || 0));
                    }}
                    placeholder="Onno"
                    className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-[12.5px] tabular-nums outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-24 text-[12.5px] text-muted-foreground">Chhar</span>
                  <input
                    type="number"
                    min={0}
                    value={discount || ""}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    className="h-8 w-24 rounded-lg border border-border bg-background px-2 text-[12.5px] tabular-nums outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-24 text-[12.5px] text-muted-foreground">Advance</span>
                  <input
                    type="number"
                    min={0}
                    value={advance || ""}
                    onChange={(e) => setAdvance(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    className="h-8 w-24 rounded-lg border border-border bg-background px-2 text-[12.5px] tabular-nums outline-none focus:border-primary/50"
                  />
                  {advance > 0 && (
                    <>
                      <select
                        value={advanceSource}
                        onChange={(e) => setAdvanceSource(e.target.value)}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-[12.5px]"
                      >
                        {["bKash", "Nagad", "Rocket", "Bank"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <input
                        value={advanceNumber}
                        onChange={(e) => setAdvanceNumber(e.target.value)}
                        placeholder="Number (shesh 4 digit)"
                        className={cn(
                          "h-8 w-40 rounded-lg border bg-background px-2 text-[12.5px] outline-none focus:border-primary/50",
                          bad("advance") ? "border-rose-400" : "border-border",
                        )}
                      />
                    </>
                  )}
                </div>
                <div className="space-y-1 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px]">
                  <Row label="Product" value={tk(totals.subtotal)} />
                  <Row label="Delivery" value={tk(shippingFee)} />
                  {discount > 0 && <Row label="Chhar" value={`− ${tk(discount)}`} />}
                  {advance > 0 && <Row label="Advance" value={`− ${tk(advance)}`} />}
                  <div className="flex items-baseline justify-between border-t border-border/70 pt-1.5">
                    <span className="font-semibold">Delivery te nibe</span>
                    <span className="text-[18px] font-bold tabular-nums">{tk(totals.cod)}</span>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Note (invoice e jabe) — size, gift, delivery time…"
                  className={cn(inputCls(), "h-auto resize-none py-2 text-[13px]")}
                />
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={tellCustomer}
                    onChange={(e) => setTellCustomer(e.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  Order hoye gele customer ke ei chat e details pathao
                </label>
              </section>
            </div>

            <div className="shrink-0 space-y-2 border-t bg-background px-4 py-3">
              {showErrors && problems.length > 0 && (
                <div className="flex items-center gap-1.5 text-[12px] text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5" /> Baki:{" "}
                  {problems.map(problemLabel).join(", ")}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={create.isPending || reading}
                  onClick={() => submit(false)}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
                >
                  {create.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Order confirm · {tk(totals.cod)}
                </button>
                <button
                  type="button"
                  disabled={create.isPending || reading}
                  onClick={() => submit(true)}
                  title="Order save hobe, call team confirm korbe (Web Orders → Processing)"
                  className="h-11 rounded-xl border border-border px-3 text-[12.5px] font-medium hover:bg-muted disabled:opacity-60"
                >
                  Call e confirm
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Ctrl + Enter = confirm</span>
                <Link
                  to="/erp/orders/new"
                  search={{
                    phone: cleanPhone || undefined,
                    name: name || undefined,
                    brand: c.brand_id,
                    source: PLATFORM_LABEL[c.platform],
                    address: address || undefined,
                    note: note || undefined,
                    items: lines.length ? lines.map((l) => l.productId).join(",") : undefined,
                    conv: c.id,
                  }}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Full form e kholo <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function problemLabel(k: string) {
  return (
    (
      {
        name: "naam",
        phone: "mobile",
        address: "thikana",
        product: "product",
        color: "color",
        advance: "advance number",
      } as Record<string, string>
    )[k] ?? k
  );
}

function SectionTitle({
  icon: Icon,
  title,
  right,
}: {
  icon: typeof User2;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {title}
      <span className="ml-auto">{right}</span>
    </div>
  );
}

function Field({
  label,
  found,
  error,
  hint,
  children,
}: {
  label: string;
  found?: boolean;
  error?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        {label}
        {found && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/10 px-1.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
            <Sparkles className="h-2.5 w-2.5" /> chat theke
          </span>
        )}
        {error && <span className="text-rose-600">· lagbe</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-rose-600">{hint}</span>}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function PlaceRow({
  brandId,
  loading,
  city,
  zone,
  area,
  edit,
  notFound,
  onEdit,
  onCity,
  onZone,
  onArea,
}: {
  brandId: string;
  loading: boolean;
  city: Place;
  zone: Place;
  area: Place;
  edit: boolean;
  notFound: boolean;
  onEdit: () => void;
  onCity: (p: Place) => void;
  onZone: (p: Place) => void;
  onArea: (p: Place) => void;
}) {
  const { data: cities = [] } = usePathaoCities(edit ? brandId : null);
  const { data: zones = [] } = usePathaoZones(edit ? (city?.id ?? null) : null, brandId);
  const { data: areas = [] } = usePathaoAreas(edit ? (zone?.id ?? null) : null, brandId);
  const sel =
    "h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[12.5px] outline-none focus:border-primary/50";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-muted-foreground">Pathao:</span>
        {loading ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> khujchi…
          </span>
        ) : city ? (
          [city, zone, area]
            .filter((p): p is NonNullable<Place> => !!p)
            .map((p) => (
              <span
                key={p.id + p.name}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-800 dark:text-emerald-300"
              >
                <Check className="h-3 w-3" /> {p.name}
              </span>
            ))
        ) : (
          <span
            className={notFound ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}
          >
            {notFound
              ? "Thikana theke bujhte parini — nije select koro"
              : "Thikana dile nije bujhe nibe"}
          </span>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto text-[11.5px] font-medium text-primary hover:underline"
        >
          {edit ? "Thik ache" : "Bodlao"}
        </button>
      </div>
      {edit && (
        <div className="flex gap-1.5">
          <select
            className={sel}
            value={city?.id ?? ""}
            onChange={(e) => {
              const x = cities.find((c) => c.city_id === Number(e.target.value));
              onCity(x ? { id: x.city_id, name: x.city_name } : null);
            }}
          >
            <option value="">City</option>
            {cities.map((c) => (
              <option key={c.city_id} value={c.city_id}>
                {c.city_name}
              </option>
            ))}
          </select>
          <select
            className={sel}
            value={zone?.id ?? ""}
            disabled={!city}
            onChange={(e) => {
              const x = zones.find((z) => z.zone_id === Number(e.target.value));
              onZone(x ? { id: x.zone_id, name: x.zone_name } : null);
            }}
          >
            <option value="">Zone</option>
            {zones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>
                {z.zone_name}
              </option>
            ))}
          </select>
          <select
            className={sel}
            value={area?.id ?? ""}
            disabled={!zone}
            onChange={(e) => {
              const x = areas.find((a) => a.area_id === Number(e.target.value));
              onArea(x ? { id: x.area_id, name: x.area_name } : null);
            }}
          >
            <option value="">Area</option>
            {areas.map((a) => (
              <option key={a.area_id} value={a.area_id}>
                {a.area_name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function LineRow({
  line: l,
  error,
  onChange,
  onRemove,
}: {
  line: QuickLine;
  error: boolean;
  onChange: (patch: Partial<QuickLine>) => void;
  onRemove: () => void;
}) {
  const { data: variants = [] } = useQuery({
    queryKey: ["order-product-variants-lite", l.productId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_variants")
        .select("id,color_name,color_hex,image,stock,is_active,display_order")
        .eq("product_id", l.productId)
        .eq("is_active", true)
        .order("display_order");
      return ((data ?? []) as Variant[]).filter((v) => v.color_name);
    },
  });
  // Product has colours → one must be chosen; pre-pick the one the customer asked for.
  useEffect(() => {
    const needs = variants.length > 0;
    if (needs !== l.needsVariant) onChange({ needsVariant: needs });
    if (needs && !l.variantId) {
      const hit =
        matchColor(l.wantedColor, variants) ?? (variants.length === 1 ? variants[0]! : null);
      if (hit)
        onChange({
          needsVariant: true,
          variantId: hit.id,
          variantLabel: hit.color_name,
          image: hit.image || l.image,
          stock: hit.stock ?? l.stock,
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants]);
  const lowStock = l.stock != null && l.stock < l.quantity;
  return (
    <div
      className={cn(
        "rounded-xl border p-2.5",
        error ? "border-rose-400 ring-2 ring-rose-500/15" : "border-border",
      )}
    >
      <div className="flex gap-2.5">
        {l.image ? (
          <img src={l.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="line-clamp-2 flex-1 text-[13px] font-medium leading-snug">
              {l.title}
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-rose-600"
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border">
              <button
                type="button"
                onClick={() => onChange({ quantity: Math.max(1, l.quantity - 1) })}
                className="flex h-7 w-7 items-center justify-center hover:bg-muted"
                aria-label="Kom"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-7 text-center text-[13px] font-semibold tabular-nums">
                {l.quantity}
              </span>
              <button
                type="button"
                onClick={() => onChange({ quantity: Math.min(99, l.quantity + 1) })}
                className="flex h-7 w-7 items-center justify-center hover:bg-muted"
                aria-label="Beshi"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <span className="text-[12px] text-muted-foreground">×</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
                ৳
              </span>
              <input
                type="number"
                min={0}
                value={l.price}
                onChange={(e) => onChange({ price: Math.max(0, Number(e.target.value) || 0) })}
                className="h-7 w-20 rounded-lg border border-border bg-background pl-5 pr-1 text-[13px] tabular-nums outline-none focus:border-primary/50"
              />
            </div>
            <span className="ml-auto text-[13px] font-semibold tabular-nums">
              {tk(l.price * l.quantity)}
            </span>
          </div>
          {lowStock && (
            <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
              Stock e ache {l.stock}ta
            </div>
          )}
        </div>
      </div>
      {variants.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2">
          {variants.map((v) => {
            const on = l.variantId === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() =>
                  onChange({
                    variantId: v.id,
                    variantLabel: v.color_name,
                    image: v.image || l.image,
                    stock: v.stock ?? l.stock,
                  })
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] transition",
                  on
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border hover:bg-muted",
                  (v.stock ?? 0) <= 0 && !on && "opacity-50",
                )}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-black/10"
                  style={{ background: v.color_hex || "#e5e7eb" }}
                />
                {v.color_name}
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {v.stock ?? 0}
                </span>
              </button>
            );
          })}
          {!l.variantId && (
            <span className="text-[11px] font-medium text-rose-600">
              color select koro{l.wantedColor ? ` (customer: ${l.wantedColor})` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

type Hit = { id: string; title: string; price: number; image: string | null; stock: number | null };

function ProductPicker({ brandId, onPick }: { brandId: string; onPick: (p: Hit) => void }) {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDeb(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);
  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["quick-order-products", brandId, deb],
    enabled: deb.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const clean = deb.replace(/[,&()%]/g, " ");
      const { data } = await supabase
        .from("products")
        .select("id,title,price,image,available_stock")
        .eq("is_active", true)
        .or(`title.ilike.%${clean}%,sku.ilike.%${clean}%`)
        .order("updated_at", { ascending: false })
        .limit(8);
      const rows = (data ?? []) as Array<{
        id: string;
        title: string;
        price: number | null;
        image: string | null;
        available_stock: number | null;
      }>;
      const { data: listings } = await supabase
        .from("product_brand_listings")
        .select("product_id,price,title_override,image_override")
        .eq("brand_id", brandId)
        .eq("is_active", true)
        .in(
          "product_id",
          rows.map((r) => r.id),
        );
      const ovr = new Map(
        (
          (listings ?? []) as Array<{
            product_id: string;
            price: number | null;
            title_override: string | null;
            image_override: string | null;
          }>
        ).map((l) => [l.product_id, l]),
      );
      return rows.map((r) => {
        const o = ovr.get(r.id);
        return {
          id: r.id,
          title: o?.title_override ?? r.title,
          price: Number(o?.price ?? r.price ?? 0),
          image: o?.image_override ?? r.image,
          stock: r.available_stock,
        } as Hit;
      });
    },
  });
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Aro product khujo (naam / SKU)…"
        className="h-10 w-full rounded-xl border border-dashed border-border bg-background pl-8 pr-8 text-[13px] outline-none focus:border-primary/50 focus:border-solid"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {deb.length >= 2 && (
        <div className="absolute inset-x-0 top-11 z-10 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
          {isFetching && hits.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> khujchi…
            </div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-muted-foreground">Kichu pai nai</div>
          ) : (
            hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  onPick(h);
                  setQ("");
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
              >
                {h.image ? (
                  <img src={h.image} alt="" className="h-9 w-9 rounded-md object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-md bg-muted" />
                )}
                <span className="line-clamp-1 flex-1 text-[12.5px]">{h.title}</span>
                <span className="text-[12px] font-semibold tabular-nums">{tk(h.price)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Done({
  done,
  told,
  total,
  onClose,
}: {
  done: { id: string; invoiceNo: string | null; awaiting: boolean };
  told: boolean;
  total: number;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="h-7 w-7 text-emerald-600" />
      </div>
      <div className="text-[17px] font-semibold">
        {done.awaiting ? "Order rakha holo" : "Order confirm hoyeche"}
      </div>
      <div className="text-[13px] text-muted-foreground">
        {done.invoiceNo ? `Invoice ${done.invoiceNo} · ` : ""}
        Delivery te nibe {tk(total)}
        {done.awaiting ? " · call team confirm korbe" : ""}
      </div>
      {told && (
        <div className="text-[12px] text-muted-foreground">
          Customer ke chat e details pathano hocche
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <Link
          to="/erp/orders/$orderId"
          params={{ orderId: done.id }}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-[13px] font-medium hover:bg-muted"
        >
          Order dekho <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-xl bg-primary px-5 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
        >
          Chat e fire jao
        </button>
      </div>
    </div>
  );
}
