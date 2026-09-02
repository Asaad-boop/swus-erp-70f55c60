import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Swords,
  Plus,
  Trash2,
  ExternalLink,
  Star,
  Copy,
  KeyRound,
  Download,
  Search,
  ImageOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { GrowthPageHeader } from "@/components/erp/growth/growth-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSET_TYPES,
  THREAT_LEVELS,
  createCaptureToken,
  faviconFor,
  fetchCaptureTokens,
  fetchCompetitorAssets,
  fetchCompetitors,
  hostOf,
  type HubCompetitor,
  type HubCompetitorAsset,
} from "@/lib/erp/hub/hub-research";

type CompDraft = {
  id?: string;
  name: string;
  website_url: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  niche: string;
  handle: string;
  followers: string;
  price_range: string;
  threat_level: string;
  note: string;
};
const emptyComp = (): CompDraft => ({
  name: "",
  website_url: "",
  facebook_url: "",
  instagram_url: "",
  tiktok_url: "",
  youtube_url: "",
  niche: "",
  handle: "",
  followers: "",
  price_range: "",
  threat_level: "medium",
  note: "",
});

type AssetDraft = {
  id?: string;
  competitor_id: string;
  asset_type: string;
  platform: string;
  title: string;
  url: string;
  image_url: string;
  price: string;
  offer: string;
  note: string;
};
const emptyAsset = (): AssetDraft => ({
  competitor_id: "none",
  asset_type: "ad",
  platform: "facebook",
  title: "",
  url: "",
  image_url: "",
  price: "",
  offer: "",
  note: "",
});

const THREAT_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  high: "bg-destructive/15 text-destructive",
};

export function RivalsPage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();

  const [compOpen, setCompOpen] = useState(false);
  const [comp, setComp] = useState<CompDraft>(emptyComp());
  const [assetOpen, setAssetOpen] = useState(false);
  const [asset, setAsset] = useState<AssetDraft>(emptyAsset());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [newToken, setNewToken] = useState<string | null>(null);

  const compsQ = useQuery({
    queryKey: ["hub-competitors", brandIds],
    queryFn: () => fetchCompetitors(brandIds),
  });
  const assetsQ = useQuery({
    queryKey: ["hub-competitor-assets", brandIds],
    queryFn: () => fetchCompetitorAssets(brandIds),
  });
  const tokensQ = useQuery({ queryKey: ["hub-capture-tokens"], queryFn: fetchCaptureTokens });

  const comps = compsQ.data ?? [];
  const compName = (id: string | null) => comps.find((c) => c.id === id)?.name ?? null;

  const assets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (assetsQ.data ?? []).filter((a) => {
      if (typeFilter !== "all" && a.asset_type !== typeFilter) return false;
      if (!term) return true;
      return [a.title, a.url, a.offer, a.note, compName(a.competitor_id)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [assetsQ.data, search, typeFilter, comps]);

  const saveComp = useMutation({
    mutationFn: async (d: CompDraft) => {
      if (!d.name.trim()) throw new Error("Name লাগবে");
      const row = {
        brand_id: activeBrand?.id ?? null,
        name: d.name.trim(),
        website_url: d.website_url.trim() || null,
        facebook_url: d.facebook_url.trim() || null,
        instagram_url: d.instagram_url.trim() || null,
        tiktok_url: d.tiktok_url.trim() || null,
        youtube_url: d.youtube_url.trim() || null,
        niche: d.niche.trim() || null,
        handle: d.handle.trim() || null,
        followers: d.followers.trim() || null,
        page_type: d.website_url.trim() ? "website" : "social",
        favicon_url: faviconFor(d.website_url || d.facebook_url),
        price_range: d.price_range.trim() || null,
        threat_level: d.threat_level,
        note: d.note.trim() || null,
      };
      if (d.id) {
        const { error } = await supabase.from("hub_competitors").update(row as never).eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hub_competitors").insert(row as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Competitor সেভ হয়েছে");
      setCompOpen(false);
      qc.invalidateQueries({ queryKey: ["hub-competitors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delComp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_competitors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hub-competitors"] }),
  });

  const saveAsset = useMutation({
    mutationFn: async (d: AssetDraft) => {
      if (!d.title.trim() && !d.url.trim()) throw new Error("Title বা URL লাগবে");
      const price = Number(d.price);
      const row = {
        brand_id: activeBrand?.id ?? null,
        competitor_id: d.competitor_id === "none" ? null : d.competitor_id,
        asset_type: d.asset_type,
        platform: d.platform || null,
        title: d.title.trim() || null,
        url: d.url.trim() || null,
        image_url: d.image_url.trim() || null,
        price: Number.isFinite(price) && price > 0 ? price : null,
        offer: d.offer.trim() || null,
        note: d.note.trim() || null,
      };
      if (d.id) {
        const { error } = await supabase
          .from("hub_competitor_assets")
          .update(row as never)
          .eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hub_competitor_assets").insert(row as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Swipe সেভ হয়েছে");
      setAssetOpen(false);
      qc.invalidateQueries({ queryKey: ["hub-competitor-assets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delAsset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_competitor_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hub-competitor-assets"] }),
  });

  const favAsset = useMutation({
    mutationFn: async (a: HubCompetitorAsset) => {
      const { error } = await supabase
        .from("hub_competitor_assets")
        .update({ is_favorite: !a.is_favorite } as never)
        .eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hub-competitor-assets"] }),
  });

  const makeToken = useMutation({
    mutationFn: () => createCaptureToken("My browser", activeBrand?.id ?? null),
    onSuccess: (t) => {
      setNewToken(t);
      qc.invalidateQueries({ queryKey: ["hub-capture-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const bookmarklet = newToken
    ? `javascript:(function(){var k=prompt('Type: idea / swipe / competitor','swipe');if(!k)return;var i=document.querySelector('meta[property="og:image"]');fetch('${origin}/api/public/hub/capture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'${newToken}',kind:k,title:document.title,url:location.href,image_url:i&&i.content,note:(window.getSelection()+'')||null})}).then(function(r){return r.json()}).then(function(d){alert(d.ok?'Saved to Growth Hub ✅':'Failed: '+(d.error||''))}).catch(function(e){alert('Failed: '+e)})})();`
    : "";

  return (
    <div className="space-y-5">
      <GrowthPageHeader
        icon={Swords}
        title="Competitors & Swipe File"
        subtitle={
          activeBrand
            ? `${activeBrand.name} — competitor tracking ও analysis`
            : "সব ব্র্যান্ড — competitor tracking ও analysis"
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setComp(emptyComp());
                setCompOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Competitor
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setAsset(emptyAsset());
                setAssetOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Swipe যোগ করো
            </Button>
          </>
        }
      />

      <Tabs defaultValue="swipe">
        <TabsList>
          <TabsTrigger value="swipe">Swipe file</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="capture">Browser capture</TabsTrigger>
        </TabsList>

        {/* ------------------------------ SWIPE ------------------------------ */}
        <TabsContent value="swipe" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="খোঁজো — title, offer, note…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সব type</SelectItem>
                {ASSET_TYPES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {assetsQ.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-56 rounded-xl" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                কিছু সেভ করা নেই। "Swipe যোগ করো" চাপো, বা Browser capture ট্যাব থেকে bookmarklet
                সেটআপ করে যেকোনো পেজ এক ক্লিকে সেভ করো।
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {assets.map((a) => (
                <Card key={a.id} className="group overflow-hidden">
                  <div className="relative aspect-[4/3] bg-muted">
                    {a.image_url ? (
                      <img
                        src={a.image_url}
                        alt={a.title ?? "Competitor creative"}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                    <button
                      onClick={() => favAsset.mutate(a)}
                      className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 backdrop-blur"
                      aria-label="Favorite"
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${a.is_favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                      />
                    </button>
                  </div>
                  <CardContent className="space-y-1.5 p-3">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {ASSET_TYPES.find((t) => t.key === a.asset_type)?.label ?? a.asset_type}
                      </Badge>
                      {a.price != null && (
                        <Badge variant="outline" className="text-[10px]">
                          ৳{Math.round(a.price).toLocaleString("en-BD")}
                        </Badge>
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs font-medium">{a.title ?? hostOf(a.url)}</p>
                    {a.offer && <p className="text-[11px] text-primary">{a.offer}</p>}
                    {a.note && (
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">{a.note}</p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="truncate text-[10px] text-muted-foreground">
                        {compName(a.competitor_id) ?? hostOf(a.url)}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {a.url && (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => delAsset.mutate(a.id)}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* --------------------------- COMPETITORS --------------------------- */}
        <TabsContent value="competitors" className="mt-4">
          {compsQ.isLoading ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : comps.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                কোনো competitor add করা নেই।
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {comps.map((c: HubCompetitor) => (
                <Card key={c.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start gap-2.5">
                      {c.favicon_url ? (
                        <img
                          src={c.favicon_url}
                          alt={`${c.name} logo`}
                          className="mt-0.5 h-8 w-8 rounded-md border border-border/60 bg-background object-contain p-1"
                        />
                      ) : (
                        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setComp({
                            id: c.id,
                            name: c.name,
                            website_url: c.website_url ?? "",
                            facebook_url: c.facebook_url ?? "",
                            instagram_url: c.instagram_url ?? "",
                            tiktok_url: c.tiktok_url ?? "",
                            youtube_url: c.youtube_url ?? "",
                            niche: c.niche ?? "",
                            handle: c.handle ?? "",
                            followers: c.followers ?? "",
                            price_range: c.price_range ?? "",
                            threat_level: c.threat_level,
                            note: c.note ?? "",
                          });
                          setCompOpen(true);
                        }}
                      >
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.handle ?? hostOf(c.website_url ?? c.facebook_url ?? c.instagram_url)}
                        </p>
                      </button>
                      <Badge className={`text-[10px] ${THREAT_STYLE[c.threat_level] ?? ""}`}>
                        {c.threat_level}
                      </Badge>
                    </div>
                    {c.note && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{c.note}</p>
                    )}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {c.niche && (
                        <Badge variant="outline" className="text-[10px]">
                          {c.niche}
                        </Badge>
                      )}
                      {c.followers && <span>{c.followers} followers</span>}
                      {c.price_range && <span>৳ {c.price_range}</span>}
                      <span className="ml-auto flex items-center gap-1">
                        {(c.website_url ?? c.facebook_url ?? c.instagram_url ?? c.tiktok_url ?? c.youtube_url) && (
                          <a
                            href={(c.website_url ?? c.facebook_url ?? c.instagram_url ?? c.tiktok_url ?? c.youtube_url)!}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => delComp.mutate(c.id)}
                          className="p-1 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------- CAPTURE ----------------------------- */}
        <TabsContent value="capture" className="mt-4">
          <Card className="overflow-hidden border-primary/30">
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-extrabold text-white">
                S
              </span>
              <div className="min-w-[220px] flex-1">
                <p className="text-sm font-semibold">Synq With Us — browser extension</p>
                <p className="text-xs text-muted-foreground">
                  Install, login, device token আর bookmarklet — সব এখন ERP-র নিজস্ব Extension
                  পেজে।
                </p>
              </div>
              <Button asChild size="sm">
                <Link to="/erp/extension">Extension পেজে যাও</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Competitor dialog */}
      <Dialog open={compOpen} onOpenChange={setCompOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{comp.id ? "Competitor edit" : "নতুন Competitor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={comp.name}
                onChange={(e) => setComp({ ...comp, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input
                value={comp.website_url}
                onChange={(e) => setComp({ ...comp, website_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Niche (কি নিয়ে কাজ করে)</Label>
              <Input
                value={comp.niche}
                onChange={(e) => setComp({ ...comp, niche: e.target.value })}
                placeholder="kids toys, gadgets, hobby…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Facebook page</Label>
              <Input
                value={comp.facebook_url}
                onChange={(e) => setComp({ ...comp, facebook_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Instagram</Label>
                <Input
                  value={comp.instagram_url}
                  onChange={(e) => setComp({ ...comp, instagram_url: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>TikTok</Label>
                <Input
                  value={comp.tiktok_url}
                  onChange={(e) => setComp({ ...comp, tiktok_url: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>YouTube</Label>
                <Input
                  value={comp.youtube_url}
                  onChange={(e) => setComp({ ...comp, youtube_url: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Handle / Followers</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={comp.handle}
                    onChange={(e) => setComp({ ...comp, handle: e.target.value })}
                    placeholder="@page"
                  />
                  <Input
                    value={comp.followers}
                    onChange={(e) => setComp({ ...comp, followers: e.target.value })}
                    placeholder="120K"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price range</Label>
                <Input
                  value={comp.price_range}
                  onChange={(e) => setComp({ ...comp, price_range: e.target.value })}
                  placeholder="800–2500"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Threat</Label>
                <Select
                  value={comp.threat_level}
                  onValueChange={(v) => setComp({ ...comp, threat_level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THREAT_LEVELS.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea
                rows={2}
                value={comp.note}
                onChange={(e) => setComp({ ...comp, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveComp.mutate(comp)} disabled={saveComp.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asset dialog */}
      <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Swipe যোগ করো</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={asset.asset_type}
                  onValueChange={(v) => setAsset({ ...asset, asset_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Competitor</Label>
                <Select
                  value={asset.competitor_id}
                  onValueChange={(v) => setAsset({ ...asset, competitor_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {comps.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={asset.title}
                onChange={(e) => setAsset({ ...asset, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input
                value={asset.url}
                onChange={(e) => setAsset({ ...asset, url: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Image URL</Label>
              <Input
                value={asset.image_url}
                onChange={(e) => setAsset({ ...asset, image_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price (৳)</Label>
                <Input
                  type="number"
                  value={asset.price}
                  onChange={(e) => setAsset({ ...asset, price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Offer</Label>
                <Input
                  value={asset.offer}
                  onChange={(e) => setAsset({ ...asset, offer: e.target.value })}
                  placeholder="Buy 1 Get 1"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>কেন ভালো লাগলো</Label>
              <Textarea
                rows={2}
                value={asset.note}
                onChange={(e) => setAsset({ ...asset, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveAsset.mutate(asset)} disabled={saveAsset.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
