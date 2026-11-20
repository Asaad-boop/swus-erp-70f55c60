import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { db, inboxApi, type InboxConversation } from "@/lib/erp/inbox/inbox";
import { suggestProductsForImageFn } from "@/lib/erp/inbox/inbox-ai.functions";

export type PriceImage = {
  messageId: string;
  attachmentIndex: number;
  url: string;
  /** customer text sent with/near the photo — helps the AI */
  hint?: string | null;
};

type Product = {
  id: string;
  title: string;
  price: number | null;
  old_price: number | null;
  image: string | null;
  sku: string | null;
  available_stock: number | null;
  is_preorder: boolean | null;
};

const PRODUCT_COLS = "id, title, price, old_price, image, sku, available_stock, is_preorder";
const TEMPLATE_KEY = "inbox.priceTemplate";
const DEFAULT_TEMPLATE = "✅ {title}\n💰 দাম: {price} টাকা{old}{stock}";

const tk = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function render(tpl: string, p: Product, prefix: string) {
  const old =
    p.old_price && p.price && Number(p.old_price) > Number(p.price)
      ? ` (আগে ${tk(p.old_price)} টাকা)`
      : "";
  const stock = p.is_preorder
    ? "\n📦 প্রি-অর্ডার"
    : p.available_stock != null && p.available_stock <= 0
      ? "\n⚠️ এই মুহূর্তে স্টক শেষ"
      : "";
  return (
    prefix +
    tpl
      .replaceAll("{title}", p.title)
      .replaceAll("{price}", tk(p.price))
      .replaceAll("{old}", old)
      .replaceAll("{stock}", stock)
      .replaceAll("{sku}", p.sku ?? "")
  );
}

/** Reply to each customer photo with the matching product's price, quoting the photo. */
export function PriceReplyDialog({
  open,
  onOpenChange,
  conversation: c,
  images,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conversation: InboxConversation;
  images: PriceImage[];
}) {
  const qc = useQueryClient();
  const [picks, setPicks] = useState<Record<number, Product | null>>({});
  const [ai, setAi] = useState<Record<number, { loading: boolean; ids: string[]; note?: string }>>(
    {},
  );
  const [active, setActive] = useState(0);
  const [template, setTemplate] = useState(() => {
    try {
      return localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE;
    } catch {
      return DEFAULT_TEMPLATE;
    }
  });
  const [editTpl, setEditTpl] = useState(false);
  const [withTotal, setWithTotal] = useState(true);
  const [sending, setSending] = useState(false);
  const imagesKey = images.map((i) => `${i.messageId}:${i.attachmentIndex}`).join("|");

  // Reset + ask the AI for every photo when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setPicks({});
    setActive(0);
    const init: Record<number, { loading: boolean; ids: string[] }> = {};
    images.forEach((_, i) => (init[i] = { loading: true, ids: [] }));
    setAi(init);
    images.forEach((img, i) => {
      suggestProductsForImageFn({
        data: { imageUrl: img.url, brandId: c.brand_id, hint: img.hint ?? undefined },
      })
        .then((r) => {
          setAi((a) => ({
            ...a,
            [i]: { loading: false, ids: r.ids, note: r.reason ?? undefined },
          }));
        })
        .catch(() => setAi((a) => ({ ...a, [i]: { loading: false, ids: [], note: "AI error" } })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imagesKey, c.brand_id]);

  const suggestedIds = useMemo(
    () => Array.from(new Set(Object.values(ai).flatMap((a) => a.ids))),
    [ai],
  );
  const suggestedQ = useQuery({
    queryKey: ["inbox", "products-by-id", suggestedIds],
    enabled: suggestedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from("products").select(PRODUCT_COLS).in("id", suggestedIds);
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const byId = useMemo(
    () => new Map((suggestedQ.data ?? []).map((p) => [p.id, p])),
    [suggestedQ.data],
  );

  // Auto-pick the AI's top match if the staff hasn't chosen yet.
  useEffect(() => {
    setPicks((cur) => {
      let changed = false;
      const next = { ...cur };
      images.forEach((_, i) => {
        const top = ai[i]?.ids?.[0];
        if (next[i] === undefined && top && byId.get(top)) {
          next[i] = byId.get(top)!;
          changed = true;
        }
      });
      return changed ? next : cur;
    });
  }, [ai, byId, images]);

  const multi = images.length > 1;
  const chosen = images.map((_, i) => picks[i] ?? null);
  const ready = chosen.filter(Boolean).length;
  const total = chosen.reduce((s, p) => s + (p?.price ? Number(p.price) : 0), 0);

  const saveTemplate = (v: string) => {
    setTemplate(v);
    try {
      localStorage.setItem(TEMPLATE_KEY, v);
    } catch {
      /* storage blocked */
    }
  };

  const sendAll = async () => {
    setSending(true);
    let sent = 0;
    try {
      for (let i = 0; i < images.length; i++) {
        const p = chosen[i];
        if (!p) continue;
        const img = images[i]!;
        // Several photos in one customer message → say which one.
        const sameMsg = images.filter((x) => x.messageId === img.messageId).length > 1;
        const prefix = sameMsg ? `ছবি ${img.attachmentIndex + 1}:\n` : "";
        await inboxApi("send", {
          conversationId: c.id,
          text: render(template, p, prefix),
          replyToMessageId: img.messageId,
          meta: { product_id: p.id, attachment_index: img.attachmentIndex },
        });
        sent++;
      }
      if (withTotal && multi && sent > 1) {
        await inboxApi("send", {
          conversationId: c.id,
          text: `🧾 ${sent}টা প্রোডাক্ট মিলিয়ে মোট: ${tk(total)} টাকা\nঅর্ডার করতে নাম, ফোন নম্বর আর ঠিকানা দিন 🙏`,
        });
      }
      toast.success(`${sent}টা দামের রিপ্লাই গেছে`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message + (sent ? ` (${sent}টা গেছে)` : ""));
    } finally {
      setSending(false);
      qc.invalidateQueries({ queryKey: ["inbox", "messages", c.id] });
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            ছবি দেখে দাম রিপ্লাই{" "}
            {multi && <span className="text-muted-foreground">· {images.length}টা ছবি</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {images.map((img, i) => (
            <div
              key={`${img.messageId}:${img.attachmentIndex}`}
              className={cn(
                "flex gap-3 rounded-xl border p-2 transition-colors",
                active === i ? "border-primary/60 bg-primary/5" : "border-border",
              )}
              onClick={() => setActive(i)}
            >
              <a href={img.url} target="_blank" rel="noreferrer" className="shrink-0">
                <img
                  src={img.url}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-20 w-20 rounded-lg bg-muted object-cover"
                />
              </a>
              <div className="min-w-0 flex-1 space-y-1.5">
                {chosen[i] ? (
                  <PickedRow
                    p={chosen[i]!}
                    onClear={() => setPicks((s) => ({ ...s, [i]: null }))}
                  />
                ) : (
                  <div className="text-xs text-muted-foreground">Product select koro ↓</div>
                )}
                <SuggestChips
                  state={ai[i]}
                  products={
                    (ai[i]?.ids ?? []).map((id) => byId.get(id)).filter(Boolean) as Product[]
                  }
                  selectedId={chosen[i]?.id}
                  onPick={(p) => setPicks((s) => ({ ...s, [i]: p }))}
                />
                {active === i && (
                  <ProductSearch
                    brandId={c.brand_id}
                    onPick={(p) => {
                      setPicks((s) => ({ ...s, [i]: p }));
                      if (i < images.length - 1) setActive(i + 1);
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-xl bg-muted/50 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            Preview
            <button type="button" className="underline" onClick={() => setEditTpl((v) => !v)}>
              {editTpl ? "Done" : "Message style bodlao"}
            </button>
          </div>
          {editTpl && (
            <div className="space-y-1">
              <Textarea
                value={template}
                onChange={(e) => saveTemplate(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                {"{title} {price} {old} {stock} {sku}"}
                <button
                  type="button"
                  className="underline"
                  onClick={() => saveTemplate(DEFAULT_TEMPLATE)}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            {chosen.map((p, i) =>
              p ? (
                <div
                  key={i}
                  className="whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                >
                  {render(template, p, "")}
                </div>
              ) : null,
            )}
            {withTotal && multi && ready > 1 && (
              <div className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                🧾 {ready}টা প্রোডাক্ট মিলিয়ে মোট: {tk(total)} টাকা
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {multi ? (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={withTotal} onCheckedChange={(v) => setWithTotal(!!v)} />
              Sheshe mot dam + order er kotha
            </label>
          ) : (
            <span />
          )}
          <Button onClick={sendAll} disabled={sending || ready === 0} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {ready > 1 ? `${ready}টা রিপ্লাই পাঠাও` : "রিপ্লাই পাঠাও"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickedRow({ p, onClear }: { p: Product; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {p.image && <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{p.title}</div>
        <div className="text-xs text-muted-foreground">
          ৳{tk(p.price)}
          {p.available_stock != null && (
            <span className={cn("ml-2", p.available_stock <= 0 && "text-destructive")}>
              stock {p.available_stock}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        className="rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SuggestChips({
  state,
  products,
  selectedId,
  onPick,
}: {
  state: { loading: boolean; ids: string[]; note?: string } | undefined;
  products: Product[];
  selectedId?: string;
  onPick: (p: Product) => void;
}) {
  if (!state) return null;
  if (state.loading)
    return (
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3 animate-pulse text-violet-500" /> AI chobi dekhe khujche…
      </div>
    );
  if (!products.length)
    return state.note ? (
      <div className="text-[11px] text-muted-foreground">AI: {state.note}</div>
    ) : null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Sparkles className="h-3 w-3 text-violet-500" />
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPick(p);
          }}
          className={cn(
            "inline-flex max-w-[220px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
            selectedId === p.id
              ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
              : "hover:bg-muted",
          )}
        >
          {selectedId === p.id && <Check className="h-3 w-3" />}
          <span className="truncate">{p.title}</span>
          <span className="shrink-0 text-muted-foreground">৳{tk(p.price)}</span>
        </button>
      ))}
    </div>
  );
}

function ProductSearch({ brandId, onPick }: { brandId: string; onPick: (p: Product) => void }) {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDeb(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const res = useQuery({
    queryKey: ["inbox", "product-search", brandId, deb],
    queryFn: async () => {
      let qy = db
        .from("products")
        .select(PRODUCT_COLS)
        .eq("brand_id", brandId)
        .eq("is_active", true)
        .neq("product_kind", "component")
        .limit(12);
      const s = deb.replace(/[%,()]/g, "");
      qy = s
        ? qy.or(`title.ilike.%${s}%,sku.ilike.%${s}%`)
        : qy.order("display_order", { ascending: true, nullsFirst: false });
      const { data, error } = await qy;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  return (
    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Product name / SKU…"
          className="h-8 pl-7 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && res.data?.[0]) {
              e.preventDefault();
              onPick(res.data[0]);
            }
          }}
        />
      </div>
      <div className="max-h-40 overflow-y-auto rounded-md border">
        {res.isLoading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (res.data ?? []).length === 0 ? (
          <div className="py-3 text-center text-xs text-muted-foreground">Kichu pai nai</div>
        ) : (
          res.data!.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              {p.image ? (
                <img src={p.image} alt="" className="h-7 w-7 rounded object-cover" />
              ) : (
                <span className="h-7 w-7 rounded bg-muted" />
              )}
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">৳{tk(p.price)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
