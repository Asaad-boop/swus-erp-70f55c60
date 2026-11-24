import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ImagePlus,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandBadge } from "@/components/erp/brand-badge";
import { useBrand } from "@/contexts/brand-context";
import { cn } from "@/lib/utils";
import {
  deleteAdAutoReply,
  fetchAdAutoReplies,
  fetchAdReport,
  fetchBrandAds,
  saveAdAutoReply,
  uploadInboxMedia,
  type AdAutoReply,
  type AdReportRow,
} from "@/lib/erp/inbox/inbox";

type Range = "today" | "yesterday" | "7d" | "30d";
const RANGES: Array<{ key: Range; label: string }> = [
  { key: "today", label: "Aaj" },
  { key: "yesterday", label: "Gotokal" },
  { key: "7d", label: "7 din" },
  { key: "30d", label: "30 din" },
];

/** Range in Dhaka days (UTC+6, no DST). */
function rangeBounds(r: Range): { from: Date; to: Date } {
  const DHAKA = 6 * 3_600_000;
  const now = Date.now();
  const startToday = new Date(Math.floor((now + DHAKA) / 86_400_000) * 86_400_000 - DHAKA);
  const day = 86_400_000;
  switch (r) {
    case "today":
      return { from: startToday, to: new Date(now + 60_000) };
    case "yesterday":
      return { from: new Date(startToday.getTime() - day), to: startToday };
    case "7d":
      return { from: new Date(startToday.getTime() - 6 * day), to: new Date(now + 60_000) };
    case "30d":
      return { from: new Date(startToday.getTime() - 29 * day), to: new Date(now + 60_000) };
  }
}

const bdt = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;
const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US")}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const mins = (m: number | null) =>
  m == null ? "—" : m < 1 ? "<1m" : m < 60 ? `${Math.round(m)}m` : `${(m / 60).toFixed(1)}h`;

export function AdsView({
  brandIds,
  showBrand,
  onOpenAdQueue,
}: {
  brandIds: string[];
  showBrand: boolean;
  onOpenAdQueue: () => void;
}) {
  const [range, setRange] = useState<Range>("7d");
  const bounds = useMemo(() => rangeBounds(range), [range]);
  const reportQ = useQuery({
    queryKey: ["inbox", "ad-report", brandIds, range],
    queryFn: () => fetchAdReport(brandIds, bounds.from, bounds.to),
    enabled: brandIds.length > 0,
    refetchInterval: 60_000,
  });
  const rows = reportQ.data ?? [];

  const t = rows.reduce(
    (a, r) => ({
      chats: a.chats + r.chats,
      meta: a.meta + r.meta_chats,
      replied: a.replied + r.replied,
      unreplied: a.unreplied + r.unreplied,
      orders: a.orders + r.orders,
      revenue: a.revenue + r.revenue,
      spend: a.spend + r.spend,
    }),
    { chats: 0, meta: 0, replied: 0, unreplied: 0, orders: 0, revenue: 0, spend: 0 },
  );
  const medians = rows.filter((r) => r.median_reply_min != null && r.chats > 0);
  const replyMedian =
    medians.length === 0
      ? null
      : medians.reduce((s, r) => s + r.median_reply_min! * r.chats, 0) /
        medians.reduce((s, r) => s + r.chats, 0);
  const slow = replyMedian != null && replyMedian > 15;

  return (
    <div className="ib-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3 md:px-3">
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div>
            <h2 className="text-[15px] font-semibold">Message ad report</h2>
            <p className="ib-ink-2 text-[12.5px]">
              Kon ad theke koto chat ashlo, koto taratari reply hoilo, koyta order hoilo.
            </p>
          </div>
          <div className="ib-seg ml-auto flex items-center gap-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                data-on={range === r.key}
                onClick={() => setRange(r.key)}
                className="ib-ink-2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:text-[var(--ib-ink)]"
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric
            label="Ad theke chat"
            value={t.chats.toLocaleString()}
            sub={t.meta > 0 ? `Meta bolse ${t.meta.toLocaleString()}` : "Inbox e ashche"}
          />
          <Metric
            label="Prothom reply (median)"
            value={mins(replyMedian)}
            sub={`${pct(t.replied, t.chats)} chat e reply`}
            tone={slow ? "warn" : replyMedian != null ? "good" : undefined}
          />
          <Metric
            label="Order"
            value={t.orders.toLocaleString()}
            sub={`${pct(t.orders, t.chats)} chat → order · ${bdt(t.revenue)}`}
          />
          <Metric
            label="Khoroch"
            value={usd(t.spend)}
            sub={`${t.chats ? usd(t.spend / t.chats) : "—"}/chat · ${t.orders ? usd(t.spend / t.orders) : "—"}/order`}
          />
        </div>

        {(t.unreplied > 0 || slow) && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/25 bg-[var(--ib-amber-soft)] px-3.5 py-2.5 text-[13px]">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1">
              {t.unreplied > 0 && (
                <>
                  <b className="tabular">{t.unreplied}</b> ta ad chat ekhono reply pay nai.{" "}
                </>
              )}
              {slow && (
                <>
                  Ad chat e prothom reply gorpore <b>{mins(replyMedian)}</b> lagche — ad customer 5
                  minute er beshi opekkha kore na. Niche auto-reply chalu rakho.
                </>
              )}
            </span>
            {t.unreplied > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 bg-[var(--ib-panel)]"
                onClick={onOpenAdQueue}
              >
                Ad chat gula dekhao
              </Button>
            )}
          </div>
        )}

        {/* Per-ad table */}
        <div className="ib-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="ib-ink-3 border-b border-[var(--ib-line)] text-left text-[11.5px]">
                  <th className="px-3 py-2.5 font-medium">Ad</th>
                  <th className="px-2 py-2.5 text-right font-medium">Chat</th>
                  <th className="px-2 py-2.5 text-right font-medium">Reply</th>
                  <th className="px-2 py-2.5 text-right font-medium">Order</th>
                  <th className="px-2 py-2.5 text-right font-medium">Bikri</th>
                  <th className="px-2 py-2.5 text-right font-medium">Khoroch</th>
                  <th className="px-2 py-2.5 text-right font-medium">Per chat</th>
                  <th className="px-3 py-2.5 text-right font-medium">Per order</th>
                </tr>
              </thead>
              <tbody>
                {reportQ.isLoading && (
                  <tr>
                    <td colSpan={8} className="ib-ink-3 px-3 py-10 text-center">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </td>
                  </tr>
                )}
                {!reportQ.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="ib-ink-2 px-3 py-12 text-center">
                      Ei shomoye kono message ad er chat nai. Message ad chalu thakle notun chat
                      ekhane ashbe.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <AdRow
                    key={`${r.brand_id}:${r.ad_id ?? r.ad_name}`}
                    r={r}
                    showBrand={showBrand}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="ib-ink-3 border-t border-[var(--ib-line)] px-3 py-2 text-[11.5px]">
            Chat = ad e click kore message dise emon customer. Order = oi chat er customer er order
            (chat theke banano, ba phone number mile gele). Khoroch Meta ad account er currency te.
          </p>
        </div>

        <AutoReplies brandIds={brandIds} />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="ib-panel px-3.5 py-3">
      <div className="ib-ink-2 text-[12px]">{label}</div>
      <div
        className={cn(
          "tabular mt-0.5 text-[22px] font-semibold leading-7 tracking-tight",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </div>
      <div className="ib-ink-3 mt-0.5 truncate text-[11.5px]">{sub}</div>
    </div>
  );
}

function AdRow({ r, showBrand }: { r: AdReportRow; showBrand: boolean }) {
  const gap = r.meta_chats > 0 && r.chats < r.meta_chats * 0.7;
  return (
    <tr className="border-b border-[var(--ib-line)] last:border-0 hover:bg-[var(--ib-hover)]">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          {r.thumbnail ? (
            <img src={r.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="ib-ink-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--ib-canvas)]">
              <Megaphone className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="max-w-[280px] truncate font-medium">{r.ad_name}</div>
            <div className="ib-ink-3 flex items-center gap-1.5 text-[11.5px]">
              {showBrand && <BrandBadge brandId={r.brand_id} variant="compact" />}
              <span className="max-w-[240px] truncate">{r.campaign_name ?? "—"}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="tabular px-2 py-2.5 text-right">
        <div className="font-medium">{r.chats}</div>
        {r.meta_chats > 0 && (
          <div
            className={cn("text-[11px]", gap ? "text-amber-600" : "ib-ink-3")}
            title="Meta Ads Manager er 'messaging conversations started'"
          >
            Meta {r.meta_chats}
          </div>
        )}
      </td>
      <td className="tabular px-2 py-2.5 text-right">
        <div>{pct(r.replied, r.chats)}</div>
        <div
          className={cn(
            "text-[11px]",
            (r.median_reply_min ?? 0) > 15 ? "text-amber-600" : "ib-ink-3",
          )}
        >
          {mins(r.median_reply_min)}
        </div>
      </td>
      <td className="tabular px-2 py-2.5 text-right">
        <div className="font-medium">{r.orders}</div>
        <div className="ib-ink-3 text-[11px]">{pct(r.orders, r.chats)}</div>
      </td>
      <td className="tabular px-2 py-2.5 text-right">{r.revenue ? bdt(r.revenue) : "—"}</td>
      <td className="tabular px-2 py-2.5 text-right">{r.spend ? usd(r.spend) : "—"}</td>
      <td className="tabular px-2 py-2.5 text-right">
        {r.spend && r.chats ? usd(r.spend / r.chats) : "—"}
      </td>
      <td className="tabular px-3 py-2.5 text-right font-medium">
        {r.spend && r.orders ? usd(r.spend / r.orders) : "—"}
      </td>
    </tr>
  );
}

// ── instant auto-reply for ad chats ─────────────────────────────────────
type Draft = Partial<AdAutoReply> & { brand_id: string; body: string };

const STARTER = `আসসালামু আলাইকুম {name} 🌸
আমাদের অ্যাড দেখে মেসেজ দেওয়ার জন্য ধন্যবাদ!

💰 দাম: ___ টাকা
🚚 সারা দেশে ক্যাশ অন ডেলিভারি

অর্ডার করতে আপনার নাম, মোবাইল নাম্বার আর পূর্ণ ঠিকানা দিন 🙏`;

function AutoReplies({ brandIds }: { brandIds: string[] }) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const rulesQ = useQuery({
    queryKey: ["inbox", "ad-autoreplies", brandIds],
    queryFn: () => fetchAdAutoReplies(brandIds),
    enabled: brandIds.length > 0,
  });
  const adsQ = useQuery({
    queryKey: ["inbox", "brand-ads", draft?.brand_id],
    queryFn: () => fetchBrandAds(draft!.brand_id),
    enabled: !!draft?.brand_id,
    staleTime: 5 * 60_000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["inbox", "ad-autoreplies"] });
  const save = useMutation({
    mutationFn: (d: Draft) => saveAdAutoReply(d),
    onSuccess: () => {
      invalidate();
      setDraft(null);
      toast.success("Auto-reply save hoyeche");
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("duplicate") ? "Ei ad er jonno auto-reply age thekei ache" : e.message,
      ),
  });
  const toggle = useMutation({
    mutationFn: (r: AdAutoReply) => saveAdAutoReply({ ...r, is_active: !r.is_active }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteAdAutoReply(id),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const onImage = async (file: File | undefined) => {
    if (!file || !draft) return;
    setUploading(true);
    try {
      const r = await uploadInboxMedia(file, draft.brand_id);
      if (r.type !== "image") throw new Error("Shudhu photo dewa jabe");
      setDraft({ ...draft, image_url: r.url });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const rules = rulesQ.data ?? [];
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "";

  return (
    <div className="ib-panel p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ib-accent-soft)] text-primary">
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold">Ad chat e instant auto-reply</h3>
          <p className="ib-ink-2 text-[12.5px]">
            Ad e click kore prothom message dilei sathe sathe ei reply jabe — staff online na
            thakleo. Pore staff jodi age reply dey, auto-reply jabe na. Customer er naam boshate{" "}
            <span className="font-mono">{"{name}"}</span> likho.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setDraft({ brand_id: brandIds[0] ?? "", body: STARTER, is_active: true })}
          disabled={brandIds.length === 0}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Notun
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {rules.length === 0 && !rulesQ.isLoading && (
          <div className="ib-ink-2 rounded-lg border border-dashed border-[var(--ib-line)] px-3 py-5 text-center text-[13px]">
            Ekhono kono auto-reply nai. "Notun" chapo — brand er shob ad er jonno ekta dilei hobe.
          </div>
        )}
        {rules.map((r) => (
          <div
            key={r.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border border-[var(--ib-line)] px-3 py-2.5",
              !r.is_active && "opacity-60",
            )}
          >
            {r.image_url && (
              <img
                src={r.image_url}
                alt=""
                className="h-12 w-12 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <BrandBadge brandId={r.brand_id} variant="compact" />
                <span className="font-medium">
                  {r.ad_id ? (r.ad_name ?? r.ad_id) : `${brandName(r.brand_id)} — shob ad`}
                </span>
                <span className="ib-ink-3 tabular">· {r.sent_count} bar gese</span>
              </div>
              <p className="ib-ink-2 mt-1 line-clamp-2 whitespace-pre-line text-[12.5px]">
                {r.body}
              </p>
            </div>
            <Switch
              checked={r.is_active}
              onCheckedChange={() => toggle.mutate(r)}
              aria-label="Chalu / bondho"
            />
            <button
              type="button"
              className="ib-ink-3 rounded p-1 hover:text-[var(--ib-ink)]"
              onClick={() => setDraft({ ...r })}
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="ib-ink-3 rounded p-1 hover:text-rose-600"
              onClick={() => {
                if (window.confirm("Ei auto-reply muche felbo?")) del.mutate(r.id);
              }}
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Auto-reply edit" : "Notun ad auto-reply"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              {brands.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Brand</Label>
                  <Select
                    value={draft.brand_id}
                    onValueChange={(v) =>
                      setDraft({ ...draft, brand_id: v, ad_id: null, ad_name: null })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {brands
                        .filter((b) => brandIds.includes(b.id))
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Kon ad</Label>
                <Select
                  value={draft.ad_id ?? "__all"}
                  onValueChange={(v) => {
                    const ad = adsQ.data?.find((a) => a.external_id === v);
                    setDraft({
                      ...draft,
                      ad_id: v === "__all" ? null : v,
                      ad_name: v === "__all" ? null : (ad?.name ?? null),
                    });
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__all">Shob ad (default)</SelectItem>
                    {draft.ad_id && !adsQ.data?.some((a) => a.external_id === draft.ad_id) && (
                      <SelectItem value={draft.ad_id}>{draft.ad_name ?? draft.ad_id}</SelectItem>
                    )}
                    {(adsQ.data ?? []).map((a) => (
                      <SelectItem key={a.external_id} value={a.external_id}>
                        {a.name ?? a.external_id}
                        {a.effective_status === "ACTIVE" ? " · active" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="ib-ink-3 text-[11.5px]">
                  Nirdishto ad er reply thakle oita jabe, na thakle "Shob ad" er ta.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Message</Label>
                <Textarea
                  rows={8}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Photo (optional — message er age jabe)</Label>
                {draft.image_url ? (
                  <div className="flex items-center gap-2">
                    <img src={draft.image_url} alt="" className="h-16 w-16 rounded object-cover" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft({ ...draft, image_url: null })}
                    >
                      Shorao
                    </Button>
                  </div>
                ) : (
                  <label className="ib-ink-2 flex h-16 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--ib-line)] text-[12.5px] hover:bg-[var(--ib-hover)]">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    Photo dao
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void onImage(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Batil
            </Button>
            <Button
              disabled={!draft?.body.trim() || !draft?.brand_id || save.isPending}
              onClick={() => draft && save.mutate(draft)}
            >
              {save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
