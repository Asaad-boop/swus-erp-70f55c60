import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Search, ArrowLeft, Loader2, Sparkles, Truck, Package,
  Star, MinusCircle, PlusCircle, ImageIcon, Info, Wand2, History,
  CheckCircle2, XCircle, AlertCircle, MapPin, User2, Receipt, ArrowRight, ChevronsUpDown, Check, X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useBrand } from "@/contexts/brand-context";
import { usePathaoCities, usePathaoZones, usePathaoAreas } from "@/hooks/erp/use-courier-query";
import { pathaoLookupByPhoneFn, pathaoMatchAddressFn } from "@/lib/erp/pathao.functions";
import { parseCustomerTextFn } from "@/lib/erp/parse-customer.functions";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { cn } from "@/lib/utils";
import { OrderSuccessDialog } from "@/components/erp/orders/order-success-dialog";

export const Route = createFileRoute("/_authenticated/erp/orders/new")({
  head: () => ({ meta: [{ title: "New Order — ERP" }] }),
  component: NewOrderPage,
});

type LineItem = {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  image: string | null;
  sku?: string | null;
  stock?: number | null;
  variant_id?: string | null;
  variant_label?: string | null;
  needsVariant?: boolean;
};

type ProductHit = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  stock: number;
  is_featured: boolean;
  sku?: string | null;
};

type DeliveryMethod = "pathao" | "steadfast" | "manual";

type PathaoAddressResult =
  | {
      found: true;
      city: { id: number; name: string };
      zone: { id: number; name: string } | null;
      area: { id: number; name: string } | null;
      source: string;
      confidence?: number;
    }
  | { found: false; message: string };

function pathaoSourceLabel(source?: string) {
  if (source === "pathao_address_parser") return "Pathao merchant address parser";
  return "Pathao API";
}

function NewOrderPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeBrand, brands, isAllBrands } = useBrand();
  const [pickedBrandId, setPickedBrandId] = useState<string>("");
  // In All-Brands mode user must pick a target brand for the new order.
  // Outside of that mode, the active brand wins.
  const effectiveBrand = useMemo(
    () => activeBrand ?? brands.find((b) => b.id === pickedBrandId) ?? null,
    [activeBrand, brands, pickedBrandId],
  );
  const effectiveBrandId = effectiveBrand?.id ?? null;

  // ── customer & shipping ───────────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [shippingNote, setShippingNote] = useState(
    "🙏 মার্চেন্টের অনুমতি ছাড়া প্রোডাক্ট খোলা সম্পূর্ণ নিষিদ্ধ। খুলে দেখতে চাইলে আগে কল করুন।",
  );
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("pathao");
  const [isPreorder, setIsPreorder] = useState(false);
  const [isCrossSale, setIsCrossSale] = useState(false);
  const [orderSource, setOrderSource] = useState<string>("");

  // ── brand-defined order sources ───────────────────────────────────────
  const { data: brandSources = [] } = useQuery({
    queryKey: ["brand-order-sources", effectiveBrandId],
    enabled: !!effectiveBrandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("settings")
        .eq("id", effectiveBrandId!)
        .maybeSingle();
      if (error) throw error;
      const s = (data?.settings ?? {}) as { order_sources?: string[] };
      const list = Array.isArray(s.order_sources) ? s.order_sources.filter(Boolean) : [];
      return list.length > 0
        ? list
        : ["Facebook", "Instagram", "WhatsApp", "Messenger", "Phone Call", "Website", "Walk-in", "Others"];
    },
  });

  // ── AI paste field ────────────────────────────────────────────────────
  const [pasteText, setPasteText] = useState("");
  const parseFn = useServerFn(parseCustomerTextFn);
  const parse = useMutation({
    mutationFn: async () => parseFn({ data: { text: pasteText.trim() } }),
    onSuccess: (r) => {
      let filled = 0;
      if (r.name) { setName(r.name); filled++; }
      if (r.phone) { setPhone(r.phone); filled++; }
      if (r.address) { setAddress(r.address); filled++; }
      if (filled === 0) toast.error("Kichu extract korte parini");
      else toast.success(`AI ne ${filled} field fill koreche`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── debounced phone → customer & courier history ──────────────────────
  const [debouncedPhone, setDebouncedPhone] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      const digits = phone.replace(/\D/g, "");
      setDebouncedPhone(digits.length >= 11 ? digits.slice(-11).replace(/^(?!0)/, "0") : "");
    }, 500);
    return () => clearTimeout(t);
  }, [phone]);

  // Past orders breakdown for this phone in this brand
  const { data: pastOrders } = useQuery({
    queryKey: ["new-order-customer-history", effectiveBrandId, debouncedPhone],
    enabled: !!effectiveBrandId && !!debouncedPhone,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,total,status,created_at,shipping_name,shipping_address,shipping_city,pathao_city_id,pathao_city_name,pathao_zone_id,pathao_zone_name,pathao_area_id,pathao_area_name")
        .eq("brand_id", effectiveBrandId!)
        .or(`shipping_phone.eq.${debouncedPhone},guest_phone.eq.${debouncedPhone}`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = data ?? [];
      const delivered = rows.filter((o) => o.status === "delivered").length;
      const cancelled = rows.filter((o) => o.status === "cancelled" || o.status === "fake").length;
      const returned = rows.filter((o) => o.status === "returned").length;
      const spent = rows.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.total ?? 0), 0);
      return { total: rows.length, delivered, cancelled, returned, spent, last: rows[0] ?? null, recent: rows.slice(0, 5) };
    },
  });

  // Courier history (Pathao + Steadfast)
  const historyFn = useServerFn(fetchCourierHistoryFn);
  const { data: courier, isFetching: courierFetching } = useQuery({
    queryKey: ["new-order-courier-history", effectiveBrandId, debouncedPhone],
    enabled: !!effectiveBrandId && !!debouncedPhone,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const r = await historyFn({ data: { phones: [debouncedPhone], brandId: effectiveBrandId! } });
      return r.results[debouncedPhone] ?? null;
    },
  });

  // ── pathao city/zone/area ─────────────────────────────────────────────
  const [cityId, setCityId] = useState<number | null>(null);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [cityName, setCityName] = useState<string>("");
  const [zoneName, setZoneName] = useState<string>("");
  const [areaName, setAreaName] = useState<string>("");
  const showPathao = deliveryMethod === "pathao";
  const { data: cities = [], isLoading: cityLoading, error: cityError } = usePathaoCities(effectiveBrandId);
  const { data: zones = [] } = usePathaoZones(showPathao ? cityId : null, effectiveBrandId);
  const { data: areas = [] } = usePathaoAreas(showPathao ? zoneId : null, effectiveBrandId);
  const lookupPhoneFn = useServerFn(pathaoLookupByPhoneFn);
  const matchAddressFn = useServerFn(pathaoMatchAddressFn);
  const [pathaoAddressResult, setPathaoAddressResult] = useState<PathaoAddressResult | null>(null);
  const [pathaoAddressDetecting, setPathaoAddressDetecting] = useState(false);

  // ── Pathao customer phone lookup ─────────────────────────────────────
  // Uses Pathao's official customer-info endpoint (same call their
  // merchant portal makes when an operator types a phone in "New
  // Delivery"). When the buyer has shipped with any Pathao merchant
  // before, we get authoritative City / Zone / Area without guessing.
  const [phoneLookup, setPhoneLookup] = useState<null | {
    name: string; address: string;
    city?: { id: number; name: string } | null;
    zone?: { id: number; name: string } | null;
    area?: { id: number; name: string } | null;
    success_ratio: number | null;
  }>(null);
  useEffect(() => {
    const p = (debouncedPhone || "").replace(/\D/g, "");
    if (!showPathao || p.length < 11) { setPhoneLookup(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const r: any = await lookupPhoneFn({ data: { phone: p, brandId: effectiveBrandId ?? undefined } });
        if (cancelled || !r?.found) return;
        setPhoneLookup({
          name: r.recipient_name || "",
          address: r.recipient_address || "",
          city: r.city, zone: r.zone, area: r.area,
          success_ratio: r.success_ratio ?? null,
        });
        // Phone history is shown only as customer context. City/Zone/Area must
        // come from the typed address via Pathao's merchant address parser, so
        // stale phone history can never override the reception-address result.
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPhone, showPathao, effectiveBrandId]);

  // ── Pathao Merchant address parser auto-fill ─────────────────────────
  // Same flow as Pathao New Delivery: typed recipient address goes to
  // Pathao's address-parser API first, then we display/apply the exact
  // City/Zone/Area Pathao returns. Local list matching is only backend fallback.
  const [debouncedAddress, setDebouncedAddress] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAddress(address.trim()), 700);
    return () => clearTimeout(t);
  }, [address]);
  useEffect(() => {
    if (!showPathao) { setPathaoAddressResult(null); setPathaoAddressDetecting(false); return; }
    if (debouncedAddress.length < 10) { setPathaoAddressResult(null); setPathaoAddressDetecting(false); return; }
    let cancelled = false;
    setPathaoAddressDetecting(true);
    (async () => {
      try {
        const r: any = await matchAddressFn({ data: { address: debouncedAddress, brandId: effectiveBrandId ?? undefined } });
        if (cancelled) return;
        if (!r?.found || !r.city) {
          setCityId(null); setCityName("");
          setZoneId(null); setZoneName("");
          setAreaId(null); setAreaName("");
          setPathaoAddressResult({ found: false, message: "Pathao এই address থেকে city/zone/area detect করতে পারেনি" });
          return;
        }
        if (r.city) {
          setCityId(r.city.id);
          setCityName(r.city.name);
        }
        if (r.zone) {
          setZoneId(r.zone.id);
          setZoneName(r.zone.name);
        } else {
          setZoneId(null);
          setZoneName("");
        }
        if (r.area) {
          setAreaId(r.area.id);
          setAreaName(r.area.name);
        } else {
          setAreaId(null);
          setAreaName("");
        }
        setPathaoAddressResult({
          found: true,
          city: r.city,
          zone: r.zone ?? null,
          area: r.area ?? null,
          source: r.source,
          confidence: r.confidence,
        });
      } catch (e) {
        if (!cancelled) setPathaoAddressResult({ found: false, message: (e as Error).message || "Pathao address parser failed" });
      } finally {
        if (!cancelled) setPathaoAddressDetecting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedAddress, showPathao, effectiveBrandId]);

  // ── autofill suggestion from latest past order for this phone ────────
  const [dismissedAutofillPhone, setDismissedAutofillPhone] = useState<string>("");
  const autofillSuggestion = useMemo(() => {
    const last: any = pastOrders?.last;
    if (!debouncedPhone || !last) return null;
    const fields: { key: string; label: string; value: string }[] = [];
    if (last.shipping_name && last.shipping_name !== name) fields.push({ key: "name", label: "Name", value: last.shipping_name });
    if (last.shipping_address && last.shipping_address !== address) fields.push({ key: "address", label: "Address", value: last.shipping_address });
    if (last.pathao_city_id && Number(last.pathao_city_id) !== cityId)
      fields.push({ key: "city", label: "City", value: last.pathao_city_name ?? last.shipping_city ?? "" });
    if (last.pathao_zone_id && Number(last.pathao_zone_id) !== zoneId)
      fields.push({ key: "zone", label: "Zone", value: last.pathao_zone_name ?? "" });
    if (last.pathao_area_id && Number(last.pathao_area_id) !== areaId)
      fields.push({ key: "area", label: "Area", value: last.pathao_area_name ?? "" });
    if (fields.length === 0) return null;
    return { last, fields };
  }, [debouncedPhone, pastOrders, name, address, cityId, zoneId, areaId]);

  const applyAutofill = () => {
    const last: any = pastOrders?.last;
    if (!last) return;
    if (last.shipping_name) setName(last.shipping_name);
    if (last.shipping_address) setAddress(last.shipping_address);
    if (last.pathao_city_id) {
      setCityId(Number(last.pathao_city_id));
      setCityName(last.pathao_city_name ?? last.shipping_city ?? "");
    }
    if (last.pathao_zone_id) {
      setZoneId(Number(last.pathao_zone_id));
      setZoneName(last.pathao_zone_name ?? "");
    }
    if (last.pathao_area_id) {
      setAreaId(Number(last.pathao_area_id));
      setAreaName(last.pathao_area_name ?? "");
    }
    toast.success("Previous info theke auto-fill holo");
  };

  // ── items ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState<LineItem[]>([]);
  const [skuQuery, setSkuQuery] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const { data: products = [], isFetching: searching } = useQuery({
    queryKey: ["new-order-products", effectiveBrandId, nameQuery, skuQuery, featuredOnly],
    enabled: !!effectiveBrandId,
    queryFn: async () => {
      // Read via listings so cross-brand products (Toyra ↔ Hobishop) appear on
      // the current storefront with per-brand price/title override.
      let q = supabase
        .from("product_brand_listings")
        .select("price,title_override,image_override,products!inner(id,title,price,image,stock,is_featured,is_active,updated_at)")
        .eq("brand_id", effectiveBrandId!)
        .eq("is_active", true)
        .eq("products.is_active", true)
        .order("updated_at", { ascending: false, referencedTable: "products" })
        .limit(30);
      if (nameQuery.trim()) q = q.ilike("products.title", `%${nameQuery.trim()}%`);
      if (featuredOnly) q = q.eq("products.is_featured", true);
      const { data, error } = await q;
      if (error) throw error;
      type Row = {
        price: number | null;
        title_override: string | null;
        image_override: string | null;
        products: { id: string; title: string; price: number; image: string; stock: number; is_featured: boolean };
      };
      let rows: ProductHit[] = ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.products.id,
        title: r.title_override ?? r.products.title,
        price: Number(r.price ?? r.products.price),
        image: r.image_override ?? r.products.image,
        stock: r.products.stock,
        is_featured: r.products.is_featured,
      }));
      if (skuQuery.trim()) {
        const { data: vs } = await supabase
          .from("product_variants")
          .select("product_id,sku")
          .ilike("sku", `%${skuQuery.trim()}%`)
          .limit(50);
        const ids = new Set((vs ?? []).map((v) => v.product_id));
        rows = rows.filter((p) => ids.has(p.id));
      }
      return rows;
    },
  });

  const addItem = (p: ProductHit) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.product_id === p.id && !x.variant_id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        { product_id: p.id, name: p.title, unit_price: Number(p.price), quantity: 1, image: p.image, stock: p.stock, variant_id: null, variant_label: null },
      ];
    });
  };
  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // Multi-color: each selected color becomes its own line item (mixed colors allowed)
  const toggleVariant = (productId: string, v: VariantOpt) => {
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.product_id === productId && i.variant_id === v.id);
      const label = [v.color_name, v.sku].filter(Boolean).join(" · ");
      if (existing >= 0) {
        const rest = prev.filter((_, i) => i !== existing);
        if (!rest.some((i) => i.product_id === productId)) {
          const next = [...prev];
          next[existing] = { ...next[existing], variant_id: null, variant_label: null };
          return next;
        }
        return rest;
      }
      const baseIdx = prev.findIndex((i) => i.product_id === productId && !i.variant_id);
      if (baseIdx >= 0) {
        const next = [...prev];
        next[baseIdx] = {
          ...next[baseIdx],
          variant_id: v.id,
          variant_label: label,
          image: v.image || next[baseIdx].image,
          stock: v.stock ?? next[baseIdx].stock,
        };
        return next;
      }
      const tmpl = prev.find((i) => i.product_id === productId);
      if (!tmpl) return prev;
      return [
        ...prev,
        { ...tmpl, quantity: 1, variant_id: v.id, variant_label: label, image: v.image || tmpl.image, stock: v.stock ?? tmpl.stock },
      ];
    });
  };

  // ── totals ────────────────────────────────────────────────────────────
  const [discount, setDiscount] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [shippingFee, setShippingFee] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [advanceSource, setAdvanceSource] = useState("");
  const [advanceNumber, setAdvanceNumber] = useState("");
  const [advanceTxnId, setAdvanceTxnId] = useState("");

  // Success animation overlay
  const [successInfo, setSuccessInfo] = useState<{ id: string; invoice_no: string | null } | null>(null);

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.unit_price * i.quantity, 0), [items]);
  // Grand total = items + shipping − discount (advance is NOT subtracted; DB trigger enforces this)
  const grandTotal = Math.max(0, subtotal + Number(shippingFee || 0) - Number(discount || 0));
  // Payable = what customer still owes (e.g. via COD) after advance
  const payable = Math.max(0, grandTotal - Number(advance || 0));
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  // ── submit ────────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async () => {
      if (!effectiveBrand) throw new Error("Brand select korun");
      if (!name.trim() || !phone.trim()) throw new Error("Name & Mobile lagbe");
      if (!address.trim()) throw new Error("Address lagbe");
      if (items.length === 0) throw new Error("At least 1 product add korun");
      if (items.some((i) => i.needsVariant && !i.variant_id)) {
        throw new Error("Product er color select korun");
      }
      if (Number(advance) > 0) {
        if (!advanceSource) throw new Error("Advance source select korun");
        if (!advanceNumber || advanceNumber.length < 4) throw new Error("Advance number (min 4 digit) din");
      }

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? null;

      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .insert({
          brand_id: effectiveBrand.id,
          status: "confirmed",
          confirmation_status: "confirmed",
          confirmed_by: currentUserId,
          confirmed_at: new Date().toISOString(),
          source: "manual",
          source_platform: orderSource || null,
          is_guest_order: true,
          guest_name: name,
          guest_phone: phone,
          shipping_name: name,
          shipping_phone: phone,
          shipping_address: address,
          shipping_city: cityName || null,
          shipping_thana: zoneName || null,
          shipping_district: areaName || null,
          pathao_city_id: cityId,
          pathao_city_name: cityName || null,
          pathao_zone_id: zoneId,
          pathao_zone_name: zoneName || null,
          pathao_area_id: areaId,
          pathao_area_name: areaName || null,
          payment_method: paymentMethod,
          subtotal,
          shipping_fee: Number(shippingFee || 0),
          discount_amount: Number(discount || 0),
          advance_amount: Number(advance || 0),
          advance_source: Number(advance) > 0 ? advanceSource : null,
          advance_payment_number: Number(advance) > 0 ? advanceNumber : null,
          advance_txn_id: Number(advance) > 0 && advanceTxnId ? advanceTxnId : null,
          total: grandTotal,
          shipping_note: shippingNote || null,
          is_preorder: isPreorder,
          is_cross_sale: isCrossSale,
          courier_name: deliveryMethod !== "manual" ? deliveryMethod : null,
        })
        .select("id, invoice_no")
        .single();
      if (orderErr) throw orderErr;

      const orderId = orderData.id;
      const itemRows = items.map((i) => ({
        order_id: orderId,
        product_id: i.product_id,
        name: i.name,
        image: i.image,
        price: i.unit_price,
        unit_price: i.unit_price,
        quantity: i.quantity,
        line_total: i.unit_price * i.quantity,
        variant_id: i.variant_id ?? null,
        variant_label: i.variant_label ?? null,
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
      if (itemsErr) throw itemsErr;
      // Stock reservation is handled by DB triggers (tg_orders_stock_reservation
      // + trg_order_items_reserved) — they touch reserved_stock only. Do NOT
      // call the legacy 1-arg reserve_stock RPC here: it decrements physical
      // products.stock unlogged and double-counts with the trigger.

      // Telegram notification handled by DB webhook on orders insert — avoid double-firing.
      return { id: orderId, invoice_no: (orderData as { invoice_no?: string | null }).invoice_no ?? null };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      setSuccessInfo(res);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/70 to-slate-50 pb-32 dark:from-background dark:to-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate({ to: "/erp/orders" })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold tracking-tight md:text-xl">
                New Order <span className="ml-1 font-normal text-muted-foreground">— নতুন অর্ডার</span>
              </h1>
              <div className="text-[11px] text-muted-foreground">{effectiveBrand?.name ?? (isAllBrands ? "Pick a brand for this order" : "Select a brand")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAllBrands && (
              <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Choose brand *" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="hidden items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground md:flex">
              <Info className="h-3.5 w-3.5 text-sky-500" />
              Address likhle field গুলো auto-fill হবে।
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {/* AI Smart Paste */}
        <Card className="overflow-hidden border-indigo-200/70 shadow-sm dark:border-indigo-900/40">
          <div className="bg-gradient-to-br from-indigo-50/80 via-indigo-50/40 to-fuchsia-50/40 p-4 dark:from-indigo-950/30 dark:via-indigo-950/10 dark:to-fuchsia-950/10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-950/40">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">AI Smart Paste <span className="ml-1 text-xs font-normal text-indigo-600 dark:text-indigo-300">স্মার্ট পেস্ট</span></div>
                  <div className="text-[11px] text-muted-foreground">
                    Messy text (name + mobile + address) paste করুন — auto fill হবে।
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
                disabled={parse.isPending || pasteText.trim().length < 5}
                onClick={() => parse.mutate()}
              >
                {parse.isPending
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Parsing…</>
                  : <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Parse & Fill</>}
              </Button>
            </div>
            <Textarea
              rows={2}
              placeholder={`e.g. "Rahim Uddin, 01712345678, House 12, Road 5, Dhanmondi, Dhaka"`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="resize-none border-indigo-100 bg-background/80 focus-visible:ring-indigo-500/30 dark:border-indigo-900/40"
            />
          </div>
        </Card>

        {/* Customer history strip */}
        {debouncedPhone && (
          <CustomerHistoryStrip
            phone={debouncedPhone}
            past={pastOrders}
            courier={courier}
            loading={courierFetching}
          />
        )}

        {/* Main grid: Customer + Courier (left)  |  Quick add + Extras (right) */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* LEFT: Customer + Courier + Items + Totals */}
          <div className="space-y-6 lg:col-span-8">
            {/* Customer card */}
            <Card className="overflow-hidden shadow-sm">
              <CardContent className="space-y-5 p-5">
                <SectionHeader icon={<User2 className="h-3.5 w-3.5" />} accent="bg-indigo-600" title="Customer Details" sub="গ্রাহকের বিবরণ" />
                {autofillSuggestion && dismissedAutofillPhone !== debouncedPhone && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] dark:border-amber-900/40 dark:bg-amber-950/20">
                    <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                      <History className="h-4 w-4 shrink-0" />
                      <span className="font-semibold">Previous info found</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {autofillSuggestion.fields.map((f) => (
                        <span key={f.key} className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                          {f.label}
                        </span>
                      ))}
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px] text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40" onClick={() => setDismissedAutofillPhone(debouncedPhone)}>
                        Dismiss
                      </Button>
                      <Button size="sm" className="h-7 gap-1.5 bg-amber-600 px-2.5 text-[12px] font-bold text-white hover:bg-amber-700" onClick={applyAutofill}>
                        <Wand2 className="h-3.5 w-3.5" /> Autofill
                      </Button>
                    </div>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Mobile Number" bn="মোবাইল নম্বর" required>
                    <Input
                      placeholder="01XXXXXXXXX"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-10 bg-muted/30 focus-visible:bg-background"
                    />
                  </Field>
                  <Field label="Customer Name" bn="নাম" required>
                    <Input
                      placeholder="Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-10 bg-muted/30 focus-visible:bg-background"
                    />
                  </Field>
                  <Field label="Full Address" bn="বিস্তারিত ঠিকানা" required className="md:col-span-2">
                    <Textarea
                      placeholder="House, Road, Area, Thana, District…"
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="bg-muted/30 focus-visible:bg-background"
                    />
                    {showPathao && (
                      <div className="mt-2 min-h-6">
                        {pathaoAddressDetecting ? (
                          <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Pathao address parser checking…
                          </div>
                        ) : pathaoAddressResult?.found ? (
                          <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              {pathaoSourceLabel(pathaoAddressResult.source)}: {pathaoAddressResult.city.name}
                              {pathaoAddressResult.zone && ` → ${pathaoAddressResult.zone.name}`}
                              {pathaoAddressResult.area && ` → ${pathaoAddressResult.area.name}`}
                            </span>
                          </div>
                        ) : pathaoAddressResult ? (
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {pathaoAddressResult.message}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </Field>
                </div>
              </CardContent>

              {/* Pathao auto-detect rail tucked inside the same card */}
              {showPathao && (
                <div className="border-t border-emerald-100 bg-emerald-50/50 px-5 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/15">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      Pathao Reception Address Parser
                    </span>
                    <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/70">— customer address দিলে Pathao portal-এর exact City / Zone / Area আসবে</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="City">
                      <LocationCombobox
                        items={cities.map((c) => ({ id: c.city_id, name: c.city_name }))}
                        valueId={cityId}
                        valueName={cityName}
                        placeholder={cityLoading ? "Loading…" : cityError ? "Pathao config missing" : "Search city…"}
                        onChange={(id, name) => {
                          setCityId(id); setCityName(name);
                          setZoneId(null); setZoneName(""); setAreaId(null); setAreaName("");
                        }}
                        onClear={() => {
                          setCityId(null); setCityName("");
                          setZoneId(null); setZoneName(""); setAreaId(null); setAreaName("");
                        }}
                      />
                    </Field>
                    <Field label="Zone">
                      <LocationCombobox
                        items={zones.map((z) => ({ id: z.zone_id, name: z.zone_name }))}
                        valueId={zoneId}
                        valueName={zoneName}
                        placeholder={!cityId ? "Pick a city first" : "Search zone…"}
                        disabled={!cityId}
                        onChange={(id, name) => {
                          setZoneId(id); setZoneName(name);
                          setAreaId(null); setAreaName("");
                        }}
                        onClear={() => {
                          setZoneId(null); setZoneName("");
                          setAreaId(null); setAreaName("");
                        }}
                      />
                    </Field>
                    <Field label="Area">
                      <LocationCombobox
                        items={areas.map((a) => ({ id: a.area_id, name: a.area_name }))}
                        valueId={areaId}
                        valueName={areaName}
                        placeholder={!zoneId ? "Pick a zone first" : "Search area…"}
                        disabled={!zoneId}
                        onChange={(id, name) => { setAreaId(id); setAreaName(name); }}
                        onClear={() => { setAreaId(null); setAreaName(""); }}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </Card>

            {/* Ordered Products */}
            <Card className="overflow-hidden shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <SectionHeader icon={<Package className="h-3.5 w-3.5" />} accent="bg-orange-500" title="Ordered Products" sub="অর্ডারকৃত পণ্য" />
                  <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
                    {items.length} items · {totalQty} qty
                  </span>
                </div>

                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-muted-foreground/15 bg-muted/20 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-background shadow-sm">
                      <Package className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No products added</p>
                    <p className="text-[11px] text-muted-foreground/80">ডান পাশ থেকে product add করুন</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => (
                      <div key={idx} className="rounded-xl border bg-background p-2.5 transition-all hover:border-indigo-200 hover:shadow-sm">
                       <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
                          {it.image ? (
                            <img src={it.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{it.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            ৳{it.unit_price.toLocaleString()} · stock {it.stock ?? "—"}
                          </div>
                          {it.variant_label && (
                            <div className="truncate text-[11px] font-medium text-indigo-600 dark:text-indigo-400">{it.variant_label}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5">
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md"
                            onClick={() => updateItem(idx, { quantity: Math.max(1, it.quantity - 1) })}>
                            <MinusCircle className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number" min={1}
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                            className="h-7 w-12 border-0 bg-transparent text-center font-semibold shadow-none focus-visible:ring-0"
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md"
                            onClick={() => updateItem(idx, { quantity: it.quantity + 1 })}>
                            <PlusCircle className="h-4 w-4" />
                          </Button>
                        </div>
                        <Input
                          type="number" min={0}
                          value={it.unit_price}
                          onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                          className="h-8 w-24"
                        />
                        <div className="w-24 shrink-0 text-right text-sm font-bold tabular-nums">
                          ৳{(it.unit_price * it.quantity).toLocaleString()}
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                       </div>
                       {items.findIndex((x) => x.product_id === it.product_id) === idx && (
                         <ColorSelector
                           productId={it.product_id}
                           selectedIds={items.filter((x) => x.product_id === it.product_id && x.variant_id).map((x) => x.variant_id as string)}
                           onMeta={(hasVariants) => {
                             if (!!it.needsVariant !== hasVariants) updateItem(idx, { needsVariant: hasVariants });
                           }}
                           onToggle={(v) => toggleVariant(it.product_id, v)}
                         />
                       )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Totals */}
            <Card className="shadow-sm">
              <CardContent className="space-y-4 p-5">
                <SectionHeader icon={<Receipt className="h-3.5 w-3.5" />} accent="bg-rose-500" title="Financial Summary" sub="হিসাব" />
                <div className="grid gap-3 md:grid-cols-5">
                  <MoneyField label="Discount">
                    <Input type="number" min={0} value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="0"
                      className="h-10 border-0 bg-transparent pl-7 text-sm font-semibold tabular-nums shadow-none focus-visible:ring-0" />
                  </MoneyField>
                  <MoneyField label="Advance">
                    <Input type="number" min={0} value={advance || ""} onChange={(e) => setAdvance(Number(e.target.value))} placeholder="0"
                      className="h-10 border-0 bg-transparent pl-7 text-sm font-semibold tabular-nums shadow-none focus-visible:ring-0" />
                  </MoneyField>
                  <MoneyField label="Sub Total" readOnly>
                    <div className="px-3 py-2 text-sm font-bold tabular-nums text-muted-foreground">
                      ৳ {subtotal.toLocaleString()}
                    </div>
                  </MoneyField>
                  <MoneyField label="Delivery">
                    <Input type="number" min={0} value={shippingFee || ""} onChange={(e) => setShippingFee(Number(e.target.value))} placeholder="0"
                      className="h-10 border-0 bg-transparent pl-7 text-sm font-semibold tabular-nums shadow-none focus-visible:ring-0" />
                  </MoneyField>
                  <MoneyField label="Grand Total" tone="danger">
                    <div className="px-3 py-2 text-base font-black tabular-nums text-rose-600">
                      ৳ {grandTotal.toLocaleString()}
                    </div>
                  </MoneyField>
                </div>
                {Number(advance) > 0 && (
                  <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-lg border border-dashed border-amber-300/70 bg-amber-50/50 px-4 py-2 text-sm dark:bg-amber-950/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Advance Paid</span>
                      <span className="font-bold tabular-nums text-emerald-600">৳ {Number(advance).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Due ({paymentMethod})</span>
                      <span className="font-black tabular-nums text-indigo-600">৳ {payable.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Advance details */}
            {Number(advance) > 0 && (
              <Card className="border-amber-300/60 bg-amber-50/40 shadow-sm dark:bg-amber-950/10">
                <CardContent className="space-y-4 p-5">
                  <SectionHeader icon={<Sparkles className="h-3.5 w-3.5" />} accent="bg-amber-500" title="Advance Payment Details" sub="অগ্রিম পেমেন্টের তথ্য" />
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Payment Method">
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="COD">Cash on Delivery</SelectItem>
                          <SelectItem value="bKash">bKash</SelectItem>
                          <SelectItem value="Nagad">Nagad</SelectItem>
                          <SelectItem value="Bank">Bank Transfer</SelectItem>
                          <SelectItem value="Cash">Cash</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Advance Source" required>
                      <Select value={advanceSource} onValueChange={setAdvanceSource}>
                        <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                        <SelectContent>
                          {["bKash", "Nagad", "Rocket", "Upay", "Bank", "Card", "Cash", "Other"].map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Payment Number / Last 4" required>
                      <Input
                        inputMode="numeric"
                        maxLength={20}
                        value={advanceNumber}
                        onChange={(e) => setAdvanceNumber(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="01712345678 / 5678"
                      />
                    </Field>
                    <Field label="Transaction ID (optional)">
                      <Input maxLength={50} value={advanceTxnId} onChange={(e) => setAdvanceTxnId(e.target.value)} placeholder="e.g. 9F7A2BX1Q" />
                    </Field>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT: Quick add + Delivery + Extras */}
          <div className="space-y-6 lg:col-span-4">
            {/* Delivery method */}
            <Card className="shadow-sm">
              <CardContent className="space-y-4 p-5">
                <Field label="Order Source" bn="অর্ডার সোর্স">
                  <Select value={orderSource} onValueChange={setOrderSource}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Where did this order come from?" />
                    </SelectTrigger>
                    <SelectContent>
                      {brandSources.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Delivery Method" bn="ডেলিভারি">
                  <Select value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as DeliveryMethod)}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pathao">Pathao Courier</SelectItem>
                      <SelectItem value="steadfast">Steadfast</SelectItem>
                      <SelectItem value="manual">Manual / Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Shipping Note" hint={`${shippingNote.length}/350`}>
                  <Textarea
                    rows={4}
                    maxLength={350}
                    value={shippingNote}
                    onChange={(e) => setShippingNote(e.target.value)}
                    className="resize-none bg-muted/30 focus-visible:bg-background"
                  />
                </Field>
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Extra Options</div>
                  <ToggleRow label="Preorder" checked={isPreorder} onChange={setIsPreorder} />
                  <ToggleRow label="Cross Sale" checked={isCrossSale} onChange={setIsCrossSale} />
                </div>
              </CardContent>
            </Card>

            {/* Quick add products */}
            <Card className="shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Quick Add Products</div>
                    <div className="text-[11px] text-muted-foreground">পণ্য যোগ করুন</div>
                  </div>
                  <Button
                    size="icon"
                    variant={featuredOnly ? "default" : "outline"}
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setFeaturedOnly((v) => !v)}
                    title="Featured only"
                  >
                    <Star className={cn("h-4 w-4", featuredOnly && "fill-current")} />
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-9 pl-9" placeholder="Search by Code / SKU" value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} />
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-9 pl-9" placeholder="Search by Name" value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} />
                  </div>
                </div>
                <div className="max-h-[520px] space-y-1.5 overflow-y-auto rounded-xl border bg-muted/20 p-2">
                  {searching && (
                    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                    </div>
                  )}
                  {!searching && products.length === 0 && (
                    <div className="p-6 text-center text-xs text-muted-foreground">No products found</div>
                  )}
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addItem(p)}
                      className="group flex w-full items-center gap-3 rounded-lg border border-transparent bg-background p-2 text-left transition-all hover:border-indigo-200 hover:shadow-sm"
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                        {p.image ? (
                          <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <div className="line-clamp-2 text-[12px] font-semibold leading-tight">{p.title}</div>
                          {p.is_featured && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums">
                          <span className="font-bold text-primary">৳{Number(p.price).toLocaleString()}</span>
                          <span className={cn("font-semibold", p.stock <= 0 ? "text-rose-600" : "text-emerald-700")}>
                            stock {p.stock}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-md bg-muted p-1 text-muted-foreground transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                        <Plus className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Sleek sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/85 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="hidden items-center gap-6 md:flex">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Truck className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Courier</div>
                <div className="text-sm font-semibold capitalize">{deliveryMethod}</div>
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Items</div>
              <div className="text-sm font-bold tabular-nums">{totalQty} pcs</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subtotal</div>
              <div className="text-sm font-bold tabular-nums">৳ {subtotal.toLocaleString()}</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right md:block">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payable</div>
              <div className="text-lg font-black tabular-nums text-indigo-600">৳ {payable.toLocaleString()}</div>
            </div>
            <Button
              size="lg"
              className="group h-12 gap-2 rounded-xl bg-emerald-600 px-6 text-base font-bold text-white shadow-lg shadow-emerald-200/60 hover:bg-emerald-700 dark:shadow-emerald-950/30"
              disabled={create.isPending || items.length === 0}
              onClick={() => create.mutate()}
            >
              {create.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
              ) : (
                <>
                  <span>Create Order</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      <OrderSuccessDialog
        open={!!successInfo}
        invoiceNo={successInfo?.invoice_no ?? null}
        orderId={successInfo?.id ?? null}
        onView={() => {
          const id = successInfo?.id;
          setSuccessInfo(null);
          if (id) navigate({ to: "/erp/orders", search: { open: id } as never });
        }}
        onNew={() => {
          setSuccessInfo(null);
          window.location.reload();
        }}
      />
    </div>
  );
}

function Field({
  label, required, hint, children, bn, className,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode; bn?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <Label className="flex items-baseline gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</span>
          {bn && <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70">{bn}</span>}
        </Label>
        {hint && <span className="text-[10px] text-muted-foreground tabular-nums">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function LocationCombobox({
  items, valueId, valueName, placeholder, disabled, onChange, onClear,
}: {
  items: { id: number; name: string }[];
  valueId: number | null;
  valueName: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (id: number, name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = valueId ? (items.find((i) => i.id === valueId)?.name ?? valueName) : "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between border-emerald-200/70 bg-background px-3 font-normal",
            !label && "text-muted-foreground",
          )}
        >
          <span className="truncate">{label || placeholder}</span>
          <span className="ml-2 flex items-center gap-1">
            {valueId ? (
              <X
                className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
              />
            ) : null}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to search…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No match</CommandEmpty>
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.id}
                  value={`${it.name} ${it.id}`}
                  onSelect={() => { onChange(it.id, it.name); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", valueId === it.id ? "opacity-100" : "opacity-0")} />
                  {it.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2 transition-colors hover:bg-background">
      <span className="text-xs font-semibold">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SectionHeader({
  icon, accent, title, sub,
}: { icon: React.ReactNode; accent: string; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("inline-block h-4 w-1 rounded-full", accent)} />
      <div className="flex items-center gap-1.5 text-muted-foreground/70">{icon}</div>
      <div className="text-sm font-bold text-foreground">
        {title}
        {sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">— {sub}</span>}
      </div>
    </div>
  );
}

function MoneyField({
  label, children, tone, readOnly,
}: { label: string; children: React.ReactNode; tone?: "danger"; readOnly?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className={cn(
        "block text-[10px] font-bold uppercase tracking-wider",
        tone === "danger" ? "text-rose-500" : "text-muted-foreground",
      )}>{label}</Label>
      <div className={cn(
        "relative flex items-center rounded-lg border bg-muted/30 transition-colors focus-within:bg-background focus-within:ring-2 focus-within:ring-indigo-500/20",
        tone === "danger" && "border-rose-200 bg-rose-50/60 focus-within:ring-rose-500/20 dark:border-rose-900/40 dark:bg-rose-950/20",
        readOnly && "bg-muted/40",
      )}>
        {!readOnly && (
          <span className={cn(
            "pointer-events-none absolute left-3 text-sm font-semibold",
            tone === "danger" ? "text-rose-400" : "text-muted-foreground/60",
          )}>৳</span>
        )}
        {children}
      </div>
    </div>
  );
}

type PastSummary = {
  total: number; delivered: number; cancelled: number; returned: number; spent: number;
  last: { id: string; created_at: string; total: number; status: string } | null;
  recent?: { id: string; created_at: string; total: number; status: string }[];
} | undefined;

type CourierData = {
  found: boolean;
  summary: { total: number; success: number; cancelled: number };
  providers: { name: string; label: string; ok: boolean; total: number; success: number; cancelled: number }[];
} | null | undefined;

function CustomerHistoryStrip({
  phone, past, courier, loading,
}: { phone: string; past: PastSummary; courier: CourierData; loading: boolean }) {
  const totalCourier = courier?.summary.total ?? 0;
  const successCourier = courier?.summary.success ?? 0;
  const pct = totalCourier > 0 ? Math.round((successCourier / totalCourier) * 100) : null;

  const navigate = useNavigate();
  const recent = past?.recent ?? [];
  const connectedProviders = (courier?.providers ?? []).filter((p) => p.ok && p.total > 0);

  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
      {/* 1) Our Record — dark customer card */}
      <OurRecordCard
        phone={phone}
        past={past}
        loading={loading}
        recent={recent}
        onOpenOrder={(id) => navigate({ to: "/erp/orders/$orderId", params: { orderId: id } })}
        onViewAll={() => phone && navigate({ to: "/erp/orders/web", search: { search: phone } as never })}
      />

      {/* 2) Overall courier card */}
      {pct != null && (
        <CourierStatCard
          label="Overall"
          successRate={pct}
          total={totalCourier}
          success={successCourier}
          cancelled={totalCourier - successCourier}
          variant="neutral"
        />
      )}

      {/* 3+) Each connected provider as colored card */}
      {connectedProviders.map((p) => {
        const ppct = p.total > 0 ? Math.round((p.success / p.total) * 100) : 0;
        return (
          <CourierStatCard
            key={p.name}
            label={p.label}
            providerKey={p.name.toLowerCase()}
            successRate={ppct}
            total={p.total}
            success={p.success}
            cancelled={p.cancelled}
          />
        );
      })}

      {/* Loading skeleton for couriers */}
      {loading && !courier && (
        <div className="col-span-full flex items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading courier history…
        </div>
      )}
    </div>
  );
}

function OurRecordCard({
  phone, past, loading, recent, onOpenOrder, onViewAll,
}: {
  phone: string;
  past: PastSummary;
  loading: boolean;
  recent: RecentOrder[];
  onOpenOrder: (id: string) => void;
  onViewAll: () => void;
}) {
  const total = past?.total ?? 0;
  const delivered = past?.delivered ?? 0;
  const cancelled = past?.cancelled ?? 0;
  const returned = past?.returned ?? 0;
  const spent = past?.spent ?? 0;
  const successPct = total > 0 ? Math.round((delivered / total) * 100) : null;

  return (
    <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-3 text-white shadow-md ring-1 ring-indigo-500/30">
      {/* glow */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-indigo-500/20 blur-2xl" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/20">
            <User2 className="h-3.5 w-3.5" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Our Record</span>
        </div>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-indigo-300" />}
      </div>

      <div className="relative mt-1 truncate text-[13px] font-bold tabular-nums">{phone || "—"}</div>

      {total === 0 ? (
        <div className="relative mt-3 rounded-lg bg-white/5 px-2 py-2 text-[11px] italic text-indigo-200 ring-1 ring-white/10">
          New customer · প্রথম অর্ডার
        </div>
      ) : (
        <>
          <div className="relative mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <RecordLine dot="bg-sky-400" label="Total" value={total} />
            {delivered > 0 && <RecordLine dot="bg-emerald-400" label="Delivered" value={delivered} />}
            {cancelled > 0 && <RecordLine dot="bg-rose-400"    label="Cancelled" value={cancelled} />}
            {returned > 0  && <RecordLine dot="bg-amber-400"   label="Returned"  value={returned} />}
          </div>

          {spent > 0 && (
            <div className="relative mt-2 flex items-center justify-between text-[10px] text-indigo-200">
              <span>Spent</span>
              <span className="font-extrabold tabular-nums text-white">৳{spent.toLocaleString()}</span>
            </div>
          )}

          {successPct != null && delivered > 0 && (
            <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full",
                  successPct >= 80 ? "bg-emerald-400" : successPct >= 50 ? "bg-amber-400" : "bg-rose-400",
                )}
                style={{ width: `${successPct}%` }}
              />
            </div>
          )}

          {/* Recent orders mini-list */}
          {recent.length > 0 && (
            <div className="relative mt-2 space-y-1">
              {recent.slice(0, 2).map((o) => (
                <RecentOrderPreview key={o.id} order={o} onOpen={() => onOpenOrder(o.id)} />
              ))}
              {total > 2 && (
                <button
                  type="button"
                  onClick={onViewAll}
                  className="flex w-full items-center justify-center gap-1 rounded-md bg-white/10 px-1.5 py-1 text-[10px] font-semibold ring-1 ring-white/20 transition hover:bg-white/15"
                >
                  View all {total} <ArrowRight className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RecordLine({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-indigo-200">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </span>
      <span className="font-extrabold tabular-nums text-white">{value}</span>
    </div>
  );
}

type VariantOpt = {
  id: string;
  color_name: string | null;
  color_hex: string | null;
  sku: string | null;
  image: string | null;
  stock: number | null;
};

function ColorSelector({
  productId, selectedIds, onToggle, onMeta,
}: {
  productId: string;
  selectedIds: string[];
  onToggle: (v: VariantOpt) => void;
  onMeta: (hasVariants: boolean) => void;
}) {
  const { data: variants = [] } = useQuery({
    queryKey: ["order-product-variants", productId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,color_name,color_hex,sku,image,stock,is_active,display_order")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return ((data ?? []) as any[]).filter((v) => v.color_name) as VariantOpt[];
    },
  });

  useEffect(() => { onMeta(variants.length > 0); }, [variants.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (variants.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color * (একাধিক select করা যাবে)</span>
      {variants.map((v) => {
        const active = selectedIds.includes(v.id);
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onToggle(v)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition",
              active ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "hover:bg-muted",
            )}
          >
            <span className="h-3.5 w-3.5 rounded-full border" style={{ background: v.color_hex || "#e5e7eb" }} />
            <span>{v.color_name}</span>
            {v.sku && <span className="font-mono text-[9px] text-muted-foreground">{v.sku}</span>}
            <span className="text-[9px] text-muted-foreground tabular-nums">({v.stock ?? 0})</span>
          </button>
        );
      })}
      {selectedIds.length === 0 && <span className="text-[10px] font-medium text-rose-600">color select korun</span>}
    </div>
  );
}

function RecentOrderPreview({ order, onOpen }: { order: RecentOrder; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const date = new Date(order.created_at);
  const tone = STATUS_TONE[order.status] ?? "bg-muted text-muted-foreground";
  const { data: detail, isLoading } = useQuery({
    queryKey: ["new-order-recent-preview", order.id],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [o, i] = await Promise.all([
        supabase
          .from("orders")
          .select("payment_method,payment_status,shipping_address,shipping_city,subtotal")
          .eq("id", order.id)
          .maybeSingle(),
        supabase
          .from("order_items")
          .select("id,name,image,quantity,unit_price,line_total,variant_label")
          .eq("order_id", order.id)
          .limit(6),
      ]);
      return { order: o.data, items: i.data ?? [] };
    },
  });
  const items = detail?.items ?? [];
  const od = detail?.order;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-md bg-white/95 px-2 py-1 text-left text-[10px] text-slate-900 ring-1 ring-white/20 shadow-sm transition hover:bg-white"
        >
          <span className="truncate font-mono font-semibold tabular-nums text-slate-700">#{order.id.slice(0, 8)}</span>
          <span className={cn("rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wider", tone)}>{order.status}</span>
          <span className="font-extrabold tabular-nums text-slate-900">৳{Number(order.total ?? 0).toLocaleString()}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-80 p-0">
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-indigo-50 to-sky-50 px-3 py-2 dark:from-indigo-950/30 dark:to-sky-950/20">
          <div className="leading-tight">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Order</div>
            <div className="font-mono text-xs font-bold tabular-nums">#{order.id.slice(0, 12)}</div>
          </div>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", tone)}>{order.status}</span>
        </div>
        <div className="space-y-1.5 px-3 py-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Placed</span>
            <span className="font-semibold tabular-nums">
              {date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · {date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          {od?.payment_method && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Payment</span>
              <span className="font-semibold uppercase">{od.payment_method}{od.payment_status ? ` · ${od.payment_status}` : ""}</span>
            </div>
          )}
          {(od?.shipping_city || od?.shipping_address) && (
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Ship to</span>
              <span className="text-right font-medium line-clamp-2">{[od?.shipping_address, od?.shipping_city].filter(Boolean).join(", ")}</span>
            </div>
          )}
        </div>
        <div className="border-t bg-muted/20 px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Items{items.length ? ` · ${items.length}` : ""}</span>
            <span>Qty × Price</span>
          </div>
          {isLoading ? (
            <div className="space-y-1.5">
              {[0, 1].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-muted" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="py-2 text-center text-[11px] text-muted-foreground">No items</div>
          ) : (
            <div className="space-y-1.5">
              {items.slice(0, 4).map((it: any) => (
                <div key={it.id} className="flex items-center gap-2 rounded-md bg-background px-1.5 py-1 ring-1 ring-border">
                  {it.image ? (
                    <img src={it.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover ring-1 ring-border" />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold leading-tight">{it.name}</div>
                    {it.variant_label && <div className="truncate text-[9px] text-muted-foreground">{it.variant_label}</div>}
                  </div>
                  <div className="shrink-0 text-right text-[10px] tabular-nums">
                    <div className="font-bold">×{it.quantity}</div>
                    <div className="text-muted-foreground">৳{Number(it.unit_price ?? 0).toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {items.length > 4 && (
                <div className="text-center text-[10px] text-muted-foreground">+{items.length - 4} more item{items.length - 4 > 1 ? "s" : ""}</div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</span>
          <span className="text-base font-extrabold tabular-nums text-indigo-700 dark:text-indigo-300">৳{Number(order.total ?? 0).toLocaleString()}</span>
        </div>
        <div className="border-t bg-muted/30 p-2">
          <Button
            size="sm"
            className="w-full gap-1.5 bg-gradient-to-br from-indigo-600 to-sky-600 text-white hover:from-indigo-700 hover:to-sky-700"
            onClick={() => { setOpen(false); onOpen(); }}
          >
            Open order <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type CourierVariant = "emerald" | "violet" | "rose" | "sky" | "amber" | "neutral";
const COURIER_VARIANTS: Record<CourierVariant, { ring: string; tag: string; accent: string; bar: string; surface: string }> = {
  emerald: { ring: "ring-emerald-200 dark:ring-emerald-900/50", tag: "bg-gradient-to-br from-emerald-500 to-teal-600", accent: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", surface: "bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background" },
  violet:  { ring: "ring-violet-200 dark:ring-violet-900/50",   tag: "bg-gradient-to-br from-violet-500 to-purple-600", accent: "text-violet-700 dark:text-violet-300",   bar: "bg-violet-500",  surface: "bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/30 dark:to-background" },
  rose:    { ring: "ring-rose-200 dark:ring-rose-900/50",       tag: "bg-gradient-to-br from-rose-500 to-red-600",      accent: "text-rose-700 dark:text-rose-300",       bar: "bg-rose-500",    surface: "bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/30 dark:to-background" },
  sky:     { ring: "ring-sky-200 dark:ring-sky-900/50",         tag: "bg-gradient-to-br from-sky-500 to-blue-600",      accent: "text-sky-700 dark:text-sky-300",         bar: "bg-sky-500",     surface: "bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/30 dark:to-background" },
  amber:   { ring: "ring-amber-200 dark:ring-amber-900/50",     tag: "bg-gradient-to-br from-amber-500 to-orange-600",  accent: "text-amber-700 dark:text-amber-300",     bar: "bg-amber-500",   surface: "bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-background" },
  neutral: { ring: "ring-slate-200 dark:ring-slate-800",        tag: "bg-gradient-to-br from-slate-600 to-slate-800",   accent: "text-slate-700 dark:text-slate-200",     bar: "bg-slate-600",   surface: "bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/40 dark:to-background" },
};
const PROVIDER_VARIANT: Record<string, CourierVariant> = {
  pathao: "emerald", steadfast: "violet", redx: "rose", paperfly: "sky", ecourier: "amber",
};

function CourierStatCard({
  label, providerKey, variant, successRate, total, success, cancelled,
}: {
  label: string;
  providerKey?: string;
  variant?: CourierVariant;
  successRate: number;
  total: number;
  success: number;
  cancelled: number;
}) {
  const v: CourierVariant = variant ?? (providerKey ? PROVIDER_VARIANT[providerKey] : undefined) ?? "neutral";
  const t = COURIER_VARIANTS[v];
  const rateTone =
    successRate >= 80 ? "text-emerald-600 dark:text-emerald-400"
    : successRate >= 50 ? "text-amber-600 dark:text-amber-400"
    : "text-rose-600 dark:text-rose-400";

  return (
    <div className={cn("relative overflow-hidden rounded-xl border p-3 shadow-sm ring-1 ring-inset", t.ring, t.surface)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm", t.tag)}>
          <Truck className="h-3 w-3" /> {label}
        </span>
        <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
          {total}
        </span>
      </div>

      {/* Big rate */}
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn("text-2xl font-extrabold tabular-nums leading-none", rateTone)}>{successRate}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Success</span>
      </div>

      {/* Mini stats */}
      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          <span className="font-bold tabular-nums">{success}</span>
        </span>
        <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
          <XCircle className="h-3 w-3" />
          <span className="font-bold tabular-nums">{cancelled}</span>
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{success}/{total}</span>
      </div>

      {/* Bottom progress */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", t.bar)} style={{ width: `${successRate}%` }} />
      </div>
    </div>
  );
}

function InlineStat({ label, value, tone, onClick, hint }: { label: string; value: React.ReactNode; tone?: string; onClick?: () => void; hint?: string }) {
  const content = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("text-base font-extrabold tabular-nums leading-none", tone ?? "text-foreground")}>{value}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={hint}
        className="group flex shrink-0 flex-col items-start gap-0.5 rounded-md px-1.5 py-1 leading-tight transition-colors hover:bg-sky-100/60 dark:hover:bg-sky-900/30"
      >
        {content}
        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-sky-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-sky-400">
          {hint ?? "Open"} <ArrowRight className="h-2.5 w-2.5" />
        </span>
      </button>
    );
  }
  return (
    <div className="flex shrink-0 flex-col gap-0.5 leading-tight">
      {content}
    </div>
  );
}

type RecentOrder = { id: string; created_at: string; total: number; status: string };

const STATUS_TONE: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  confirmed:  "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  processing: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  shipped:    "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  delivered:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled:  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  fake:       "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  returned:   "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

function OrdersPopoverStat({
  total, recent, phone, onOpen, onViewAll,
}: {
  total: number;
  recent: RecentOrder[];
  phone: string;
  onOpen: (id: string) => void;
  onViewAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex shrink-0 flex-col items-start gap-0.5 rounded-md px-1.5 py-1 leading-tight transition-colors hover:bg-sky-100/60 dark:hover:bg-sky-900/30"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Orders</span>
          <span className="text-base font-extrabold tabular-nums leading-none text-foreground">{total}</span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-sky-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-sky-400">
            Preview <ArrowRight className="h-2.5 w-2.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-sky-50 to-indigo-50/50 px-3 py-2 dark:from-sky-950/30 dark:to-indigo-950/20">
          <div className="leading-tight">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recent orders</div>
            <div className="text-sm font-bold tabular-nums">{phone}</div>
          </div>
          <span className="rounded-full bg-sky-600/10 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">{total} total</span>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {recent.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No orders</div>
          ) : recent.map((o) => {
            const tone = STATUS_TONE[o.status] ?? "bg-muted text-muted-foreground";
            const date = new Date(o.created_at);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => { setOpen(false); onOpen(o.id); }}
                className="group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500/15 to-indigo-500/10 text-sky-700 dark:text-sky-300">
                  <Package className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[11px] font-bold tabular-nums">#{o.id.slice(0, 8)}</span>
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", tone)}>
                      {o.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </div>
                </div>
                <div className="text-right leading-tight">
                  <div className="text-sm font-extrabold tabular-nums">৳{Number(o.total ?? 0).toLocaleString()}</div>
                  <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </button>
            );
          })}
        </div>
        {total > recent.length && (
          <div className="border-t p-1.5">
            <button
              type="button"
              onClick={() => { setOpen(false); onViewAll(); }}
              className="flex w-full items-center justify-center gap-1 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted"
            >
              View all {total} orders <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

type ProviderRow = { name: string; label: string; ok: boolean; total: number; success: number; cancelled: number };

const PROVIDER_THEME: Record<string, { badge: string; ring: string; text: string; dot: string }> = {
  pathao:    { badge: "bg-gradient-to-br from-emerald-500 to-teal-600",  ring: "ring-emerald-300/70 dark:ring-emerald-700/40", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  steadfast: { badge: "bg-gradient-to-br from-violet-500 to-purple-600", ring: "ring-violet-300/70 dark:ring-violet-700/40",   text: "text-violet-700 dark:text-violet-300",   dot: "bg-violet-500" },
  redx:      { badge: "bg-gradient-to-br from-rose-500 to-red-600",      ring: "ring-rose-300/70 dark:ring-rose-700/40",       text: "text-rose-700 dark:text-rose-300",       dot: "bg-rose-500" },
  paperfly:  { badge: "bg-gradient-to-br from-sky-500 to-blue-600",      ring: "ring-sky-300/70 dark:ring-sky-700/40",         text: "text-sky-700 dark:text-sky-300",         dot: "bg-sky-500" },
  ecourier:  { badge: "bg-gradient-to-br from-amber-500 to-orange-600",  ring: "ring-amber-300/70 dark:ring-amber-700/40",     text: "text-amber-700 dark:text-amber-300",     dot: "bg-amber-500" },
};

function CourierProviderChip({ provider }: { provider: ProviderRow }) {
  const key = provider.name.toLowerCase();
  const theme = PROVIDER_THEME[key] ?? { badge: "bg-slate-500", ring: "ring-border", text: "text-foreground", dot: "bg-slate-400" };
  const pct = provider.total > 0 ? Math.round((provider.success / provider.total) * 100) : null;

  const scoreTone =
    pct == null ? "text-muted-foreground"
    : pct >= 80 ? "text-emerald-600 dark:text-emerald-400"
    : pct >= 50 ? "text-amber-600 dark:text-amber-400"
    : "text-rose-600 dark:text-rose-400";

  const barTone =
    pct == null ? "bg-muted-foreground/30"
    : pct >= 80 ? "bg-emerald-500"
    : pct >= 50 ? "bg-amber-500"
    : "bg-rose-500";

  if (!provider.ok) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-dashed bg-muted/30 py-1 pl-1 pr-3">
        <span className={cn("flex h-5 items-center rounded-full px-2 text-[9px] font-extrabold uppercase tracking-wider text-white opacity-60", theme.badge)}>
          {provider.label}
        </span>
        <span className="text-[10px] italic text-muted-foreground/70">No data</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 shadow-sm ring-1 ring-inset transition-all hover:shadow-md",
      theme.ring,
    )}>
      <span className={cn(
        "flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm",
        theme.badge,
      )}>
        <Truck className="h-3 w-3" />
        {provider.label}
      </span>
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", barTone)} style={{ width: `${pct ?? 0}%` }} />
        </div>
        <span className={cn("text-sm font-extrabold tabular-nums leading-none", scoreTone)}>{pct == null ? "—" : `${pct}%`}</span>
      </div>
      <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
        {provider.success}/{provider.total}
      </span>
    </div>
  );
}