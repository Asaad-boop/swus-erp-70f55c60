import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { bdCourierQuotaFn, fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { saveAppSetting } from "@/lib/erp/settings/app-settings.functions";

export function BdCourierSettings() {
  const qc = useQueryClient();
  const quotaFn = useServerFn(bdCourierQuotaFn);
  const saveFn = useServerFn(saveAppSetting);
  const historyFn = useServerFn(fetchCourierHistoryFn);

  const [limit, setLimit] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  const { data: quota } = useQuery({
    queryKey: ["bdcourier-quota"],
    queryFn: () => quotaFn({ data: {} as never }),
    staleTime: 30_000,
  });

  const saveLimit = useMutation({
    mutationFn: async () => {
      const n = Number(limit);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Valid number din");
      await saveFn({ data: { key: "bdcourier_daily_limit", value: n } });
    },
    onSuccess: () => {
      toast.success("Daily limit save hoyeche");
      qc.invalidateQueries({ queryKey: ["bdcourier-quota"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: async () => {
      const res = await historyFn({ data: { phones: [testPhone], force: true } });
      return Object.values(res.results)[0];
    },
    onSuccess: (r: any) => {
      const rows = (r?.providers ?? []).filter((p: any) => p.name !== "pathao");
      setTestResult(
        rows.length === 0
          ? "Kono data ashe nai"
          : rows.map((p: any) => (p.ok ? `${p.label}: ${p.success}/${p.total} success` : `${p.label}: ${p.error}`)).join(" · "),
      );
      qc.invalidateQueries({ queryKey: ["bdcourier-quota"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const used = quota?.used ?? 0;
  const max = quota?.limit ?? 500;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">BDCourier (non-Pathao couriers)</CardTitle>
            <CardDescription>
              Steadfast, RedX, Paperfly, Sundarban ityadi courier-er success rate BDCourier API theke ase. Pathao amader nijer API theke.
            </CardDescription>
          </div>
          <Badge variant={quota?.configured ? "default" : "destructive"}>
            {quota?.configured ? "API key set" : "API key nei"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Ajker search use</span>
            <span className="font-medium tabular-nums">{used} / {max}</span>
          </div>
          <Progress value={Math.min(100, (used / Math.max(1, max)) * 100)} />
          <p className="text-xs text-muted-foreground">
            Ekta phone lookup = 1 search (sob courier ekshathe ase). Same phone 24 ghontar cache theke free ashe.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="bdc-limit" className="text-xs">Daily search limit</Label>
            <Input
              id="bdc-limit"
              inputMode="numeric"
              placeholder={String(max)}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <Button onClick={() => saveLimit.mutate()} disabled={saveLimit.isPending || !limit}>Save</Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="bdc-test" className="text-xs">Test lookup (phone)</Label>
            <Input
              id="bdc-test"
              placeholder="01XXXXXXXXX"
              maxLength={14}
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending || testPhone.replace(/\D/g, "").length < 11}
          >
            {test.isPending ? "Checking..." : "Test"}
          </Button>
        </div>
        {testResult && <p className="rounded-lg border bg-muted/40 p-3 text-xs">{testResult}</p>}
      </CardContent>
    </Card>
  );
}
