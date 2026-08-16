import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, CheckCircle2, GitBranch, Github, RefreshCw, Rocket, XCircle, HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { checkDeploySync } from "@/lib/erp/deploy-sync.functions";

export const Route = createFileRoute("/_authenticated/erp/deploy-sync")({
  head: () => ({
    meta: [
      { title: "Deploy Sync — GitHub ⇄ Vercel status" },
      { name: "description", content: "Check whether the latest commits on the watched branch are actually live on Vercel." },
      { property: "og:title", content: "Deploy Sync — GitHub ⇄ Vercel status" },
      { property: "og:description", content: "Warns when commits are not reaching the branch Vercel deploys." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeploySyncPage,
});

const LS_KEY = "erp.deploy-sync.urls";
const DEFAULT_URLS = ["https://swus-erp.lovable.app"];

function short(s: string | null | undefined) {
  return s ? s.slice(0, 7) : "—";
}
function when(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }); } catch { return s; }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value}</span>
    </div>
  );
}

function DeploySyncPage() {
  const fn = useServerFn(checkDeploySync);
  const [urls, setUrls] = useState<string[]>(DEFAULT_URLS);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setUrls(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    setDraft(urls.join("\n"));
  }, [urls]);

  const q = useQuery({
    queryKey: ["deploy-sync", urls],
    queryFn: () => fn({ data: { urls } } as any),
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });

  const d = q.data as any;
  const level: string = d?.verdict?.level ?? "unknown";
  const tone =
    level === "ok" ? "border-emerald-400/60 bg-emerald-500/5"
    : level === "warn" ? "border-amber-400/60 bg-amber-500/5"
    : level === "error" ? "border-red-400/60 bg-red-500/5"
    : "border-border";
  const Icon = level === "ok" ? CheckCircle2 : level === "warn" ? AlertTriangle : level === "error" ? XCircle : HelpCircle;
  const iconTone =
    level === "ok" ? "text-emerald-600" : level === "warn" ? "text-amber-600"
    : level === "error" ? "text-red-600" : "text-muted-foreground";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deploy Sync</h1>
          <p className="text-sm text-muted-foreground">
            GitHub-এর শেষ commit আর Vercel-এর live deployment মিলছে কিনা — auto check (প্রতি ৫ মিনিটে)।
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} /> Re-check
        </Button>
      </div>

      <Card className={tone}>
        <CardContent className="p-5 flex items-start gap-3">
          <Icon className={`h-6 w-6 mt-0.5 shrink-0 ${iconTone}`} />
          <div className="space-y-1.5">
            <div className="font-semibold">
              {q.isLoading ? "চেক করা হচ্ছে…" : q.error ? "চেক করা যায়নি" : d?.verdict?.headline}
            </div>
            {q.error && (
              <div className="text-xs font-mono text-red-600">{(q.error as any)?.message}</div>
            )}
            {(d?.verdict?.details ?? []).map((t: string, i: number) => (
              <div key={i} className="text-sm text-muted-foreground">• {t}</div>
            ))}
            {d?.checkedAt && (
              <div className="text-[11px] text-muted-foreground pt-1">Last checked: {when(d.checkedAt)}</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Github className="h-4 w-4" /> GitHub
              <Badge variant={d?.github?.ok ? "default" : "secondary"} className="ml-auto">
                {d?.github?.ok ? "connected" : "not configured"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Row label="Repo" value={d?.config?.repo ?? "—"} />
            <Row label="Watched branch" value={<span className="inline-flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" />{d?.config?.branch ?? "—"}</span>} />
            <Row label="Latest commit" value={<code>{short(d?.github?.sha)}</code>} />
            <Row label="Message" value={d?.github?.message ?? "—"} />
            <Row label="Committed" value={when(d?.github?.committedAt)} />
            {d?.github?.error && <Row label="Error" value={<span className="text-red-600">{d.github.error}</span>} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Rocket className="h-4 w-4" /> Vercel
              <Badge variant={d?.vercel?.ok ? "default" : "secondary"} className="ml-auto">
                {d?.vercel?.state ?? (d?.vercel?.ok ? "ok" : "not configured")}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Row label="Deployment" value={d?.vercel?.deploymentUrl ?? "—"} />
            <Row label="Deployed branch" value={d?.vercel?.branch ?? "—"} />
            <Row label="Deployed commit" value={<code>{short(d?.vercel?.sha)}</code>} />
            <Row label="Created" value={when(d?.vercel?.createdAt)} />
            {d?.vercel?.error && <Row label="Error" value={<span className="text-red-600">{d.vercel.error}</span>} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live URL probes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            প্রতিটা URL-এর <code>/api/public/build-info</code> থেকে commit পড়ে দেখা হয় — token ছাড়াও কাজ করে।
            নতুন build deploy না হলে এখানে ধরা পড়বে।
          </p>
          {(d?.targets ?? []).map((t: any) => (
            <div key={t.url} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{t.url}</div>
                <div className="text-xs text-muted-foreground">
                  {t.reachable
                    ? `commit ${short(t.commit)} · branch ${t.branch ?? "?"} · booted ${when(t.bootedAt)}`
                    : t.error}
                </div>
              </div>
              {t.reachable && d?.github?.sha ? (
                t.commit === d.github.sha
                  ? <Badge className="shrink-0">up to date</Badge>
                  : <Badge variant="destructive" className="shrink-0">stale</Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0">{t.reachable ? "live" : "no data"}</Badge>
              )}
            </div>
          ))}
          <div className="space-y-2 pt-1">
            <div className="text-xs font-medium text-muted-foreground">URLs (এক লাইনে একটা)</div>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://your-app.vercel.app"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = draft.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
                setUrls(next);
                try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
              }}
            >
              Save & re-check
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Setup</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <div>পুরো check চালু করতে এই secrets লাগবে (Admin only, কোথাও expose হয় না):</div>
          <div><code>GITHUB_TOKEN</code> — repo read scope · <code>GITHUB_REPO</code> — <code>owner/name</code> · <code>GITHUB_BRANCH</code> — default <code>main</code></div>
          <div><code>VERCEL_TOKEN</code> · <code>VERCEL_PROJECT_ID</code> · <code>VERCEL_TEAM_ID</code> (team হলে)</div>
        </CardContent>
      </Card>
    </div>
  );
}
