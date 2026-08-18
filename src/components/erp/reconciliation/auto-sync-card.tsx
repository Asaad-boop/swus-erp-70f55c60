import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Loader2, Zap, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getPathaoAutoSyncStatusFn,
  setPathaoAutoSyncConfigFn,
  runPathaoAutoSyncNowFn,
} from "@/lib/erp/pathao-autosync.functions";

function timeAgo(iso: string | null) {
  if (!iso) return "kokhono na";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ekhoni";
  if (mins < 60) return `${mins} min age`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} ghonta age`;
  return `${Math.round(h / 24)} din age`;
}

export function AutoSyncCard({ onSynced }: { onSynced?: () => void }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getPathaoAutoSyncStatusFn);
  const setFn = useServerFn(setPathaoAutoSyncConfigFn);
  const runFn = useServerFn(runPathaoAutoSyncNowFn);

  const q = useQuery({
    queryKey: ["pathao-autosync-status"],
    queryFn: () => statusFn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const cfg = q.data;

  const save = useMutation({
    mutationFn: (patch: { enabled?: boolean; autoApply?: boolean }) => setFn({ data: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pathao-autosync-status"] });
      toast.success("Auto-sync setting save hoyeche");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: () => runFn({ data: {} }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["pathao-autosync-status"] });
      onSynced?.();
      if (!r?.ok) toast.error(r?.errors?.[0] ?? "Sync failed");
      else if (!r.runs?.length) toast.success("Notun kono invoice nei — sob up to date");
      else
        toast.success(
          `${r.runs.length} invoice sync holo · ${r.runs.reduce((s: number, x: any) => s + x.applied, 0)} order applied`,
        );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const err = cfg?.lastStatus === "error";

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${err ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              <Zap className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-sm flex items-center gap-2">
                Auto-sync
                {cfg?.enabled ? (
                  <Badge variant="secondary" className="h-5 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> On
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-5">Off</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {cfg
                  ? `Last run ${timeAgo(cfg.lastRunAt)} · ${cfg.lastInvoices} invoice · ${cfg.lastApplied} order applied`
                  : "Loading…"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 ml-auto flex-wrap">
            <div className="flex items-center gap-2">
              <Switch
                checked={!!cfg?.enabled}
                disabled={!cfg || save.isPending}
                onCheckedChange={(v) => save.mutate({ enabled: v })}
              />
              <Label className="text-xs">Background sync</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={!!cfg?.autoApply}
                disabled={!cfg || save.isPending}
                onCheckedChange={(v) => save.mutate({ autoApply: v })}
              />
              <Label className="text-xs">Auto apply</Label>
            </div>
            <Button size="sm" className="gap-2" disabled={run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync now
            </Button>
          </div>
        </div>

        {err && cfg?.lastMessage ? (
          <p className="mt-3 text-[11px] text-destructive flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> {cfg.lastMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
