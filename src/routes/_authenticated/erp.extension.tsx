import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Chrome,
  Download,
  KeyRound,
  Copy,
  Ban,
  Sparkles,
  MousePointerClick,
  Layers,
  Keyboard,
  ShieldCheck,
  History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { createCaptureToken, fetchCaptureTokens } from "@/lib/erp/hub/hub-research";

export const Route = createFileRoute("/_authenticated/erp/extension")({
  head: () => ({
    meta: [
      { title: "Synq With Us — Browser Extension" },
      {
        name: "description",
        content:
          "Install the Synq With Us browser extension to capture products, rival pages and content inspiration from any website straight into the ERP.",
      },
      { property: "og:title", content: "Synq With Us — Browser Extension" },
      {
        property: "og:description",
        content: "One-click product, rival page and content capture from any website into your ERP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExtensionPage,
});

const FEATURES = [
  {
    icon: MousePointerClick,
    title: "যেকোনো সাইট থেকে এক ক্লিক",
    body: "Product page, supplier listing, Facebook/Instagram/TikTok ad — সব থেকে ছবি, দাম, SKU, variant, note সহ সরাসরি ERP-তে।",
  },
  {
    icon: Layers,
    title: "Bulk grab",
    body: "Listing/category page-এ থাকলে এক ক্লিকেই সব product একসাথে Product Pipeline-এ চলে যাবে।",
  },
  {
    icon: Sparkles,
    title: "Smart auto-detect",
    body: "JSON-LD থেকে দাম, currency, SKU, color/size variant; social profile হলে handle + follower ধরে নেয়।",
  },
  {
    icon: Keyboard,
    title: "Clip + shortcut",
    body: "🔖 clip বাটন drag করে যেকোনো জায়গায় রাখা, size বদলানো বা current site থেকে hide করা যায়। Alt+Shift+S shortcut-ও আছে।",
  },
  {
    icon: History,
    title: "Recent feed",
    body: "Popup-এর Recent ট্যাবে তোমার শেষ capture গুলো দেখা যায় — ডাবল সেভ হচ্ছে কিনা বুঝবে।",
  },
  {
    icon: ShieldCheck,
    title: "Login + device token",
    body: "ERP email/password দিয়ে login; প্রতি device-এর token আলাদা, চাইলে এখান থেকেই বাতিল করা যায়।",
  },
];

function ExtensionPage() {
  const { activeBrand } = useBrand();
  const qc = useQueryClient();
  const [newToken, setNewToken] = useState<string | null>(null);

  const tokensQ = useQuery({ queryKey: ["hub-capture-tokens"], queryFn: fetchCaptureTokens });

  const makeToken = useMutation({
    mutationFn: () => createCaptureToken("My browser", activeBrand?.id ?? null),
    onSuccess: (t) => {
      setNewToken(t);
      qc.invalidateQueries({ queryKey: ["hub-capture-tokens"] });
      toast.success("Token তৈরি হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("hub_capture_tokens")
        .update({ is_active: false } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Device বাতিল হয়েছে");
      qc.invalidateQueries({ queryKey: ["hub-capture-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rawOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const liveExtensionOrigin =
    "https://project--ed6f058b-a815-45d2-bb71-e1fc12a02390-dev.lovable.app";
  const origin = rawOrigin.includes("localhost") ? rawOrigin : liveExtensionOrigin;
  const downloadUrl = `/api/public/hub/extension.zip?origin=${encodeURIComponent(origin)}${
    newToken ? `&token=${encodeURIComponent(newToken)}` : ""
  }`;
  const bookmarklet = newToken
    ? `javascript:(function(){var k=prompt('Type: idea / swipe / competitor','swipe');if(!k)return;var i=document.querySelector('meta[property="og:image"]');fetch('${origin}/api/public/hub/capture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'${newToken}',kind:k,title:document.title,url:location.href,image_url:i&&i.content,note:(window.getSelection()+'')||null})}).then(function(r){return r.json()}).then(function(d){alert(d.ok?'Saved ✅':'Failed: '+(d.error||''))}).catch(function(e){alert('Failed: '+e)})})();`
    : "";

  const tokens = tokensQ.data ?? [];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden border-primary/30">
        <div className="bg-gradient-to-br from-indigo-500/15 via-fuchsia-500/10 to-transparent p-6">
          <div className="flex flex-wrap items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xl font-extrabold text-white shadow-lg shadow-indigo-500/30">
              S
            </span>
            <div className="min-w-[240px] flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Synq With Us</h1>
                <Badge variant="secondary">v3.1</Badge>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                ERP-এর নিজস্ব browser extension — তিনটা কাজ: <b>Product</b> (ছবি, নাম, দাম — PKR/USD
                হলে অটো ৳-এ convert হয়ে Voting-এ), <b>Competitor</b> (page/website, niche, handle,
                follower সহ) আর <b>Content</b> (inspiration সেভ করে রাখা)। সব brand অনুযায়ী সেভ হয়।
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={downloadUrl}>
                  <Download className="mr-1.5 h-4 w-4" /> Download extension
                </a>
              </Button>
              <Button variant="outline" onClick={() => makeToken.mutate()} disabled={makeToken.isPending}>
                <KeyRound className="mr-1.5 h-4 w-4" /> নতুন device token
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Features */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <CardContent className="space-y-2 p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-4.5 w-4.5" />
              </span>
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{f.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Install */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Chrome className="h-4 w-4" /> Install (১ মিনিট)
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>উপরের <b>Download extension</b> চাপো → zip টা extract করো।</li>
            <li>
              Chrome/Edge-এ <code>chrome://extensions</code> খোলো → ডানে <b>Developer mode</b> ON।
            </li>
            <li>
              <b>Load unpacked</b> → extract করা ফোল্ডারটা select করো।
            </li>
            <li>
              Toolbar-এ <b>Synq</b> আইকনে ক্লিক → ERP <b>email/username + password</b> দিয়ে Login → brand
              সিলেক্ট। (token manually লাগবে না।)
            </li>
            <li>আগের version থাকলে chrome://extensions-এ গিয়ে <b>Reload</b> দাও।</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Capture গুলো দেখতে যাও{" "}
            <Link to="/erp/hub/products" className="text-primary underline">
              Product Pipeline
            </Link>{" "}
            বা{" "}
            <Link to="/erp/hub/rivals" className="text-primary underline">
              Competitors
            </Link>
            ।
          </p>
        </CardContent>
      </Card>

      {/* Devices */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Connected devices</p>
            <Button size="sm" variant="outline" onClick={() => makeToken.mutate()}>
              <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Token বানাও
            </Button>
          </div>

          {newToken && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-medium text-primary">
                Token একবারই দেখা যাবে — দরকার হলে কপি করে রাখো।
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                  {newToken}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(newToken);
                    toast.success("কপি হয়েছে");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {tokens.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              এখনো কোনো device connect করা নেই — extension-এ login করলেই এখানে দেখা যাবে।
            </p>
          ) : (
            <div className="space-y-1.5">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-xs"
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="text-muted-foreground">{t.token_hint}</span>
                  {!t.is_active && <Badge variant="outline">revoked</Badge>}
                  <span className="ml-auto text-muted-foreground">
                    {t.use_count} capture · {t.last_used_at?.slice(0, 10) ?? "unused"}
                  </span>
                  {t.is_active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive"
                      onClick={() => revoke.mutate(t.id)}
                    >
                      <Ban className="mr-1 h-3.5 w-3.5" /> Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bookmarklet fallback */}
      <Card>
        <CardContent className="space-y-2 p-5">
          <p className="text-sm font-semibold">Bookmarklet (মোবাইল / extension ছাড়া)</p>
          <p className="text-xs text-muted-foreground">
            Token বানানোর পর নিচের কোডটা bookmark-এর URL হিসেবে সেভ করো। যেকোনো পেজে ওই bookmark
            চাপলেই সেটা ERP-তে সেভ হবে।
          </p>
          {bookmarklet ? (
            <>
              <Textarea readOnly rows={4} value={bookmarklet} className="text-[10px]" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(bookmarklet);
                  toast.success("Bookmarklet কপি হয়েছে");
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy bookmarklet
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">আগে একটা token বানাও।</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
