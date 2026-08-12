import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { Panel, EmptyState, ExportMenu, REPORT_QUERY_OPTS } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type AdRow = {
  ad_id: string; ad_name: string; adset_name: string; campaign_name: string; status: string;
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number;
  orders: number; delivered_orders: number; revenue: number; roas: number; cac: number;
};

export function AdsPanel({ args, enabled, rangeLabel }: { args: RpcArgs; enabled: boolean; rangeLabel?: string }) {
  const [search, setSearch] = useState("");
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const q = useQuery({
    queryKey: ["rpt-mkt-ads", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_marketing_ads", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as AdRow[];
    },
  });

  const term = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter(
    (r) => !term || `${r.ad_name} ${r.adset_name} ${r.campaign_name}`.toLowerCase().includes(term),
  );
  const head = ["Ad", "Ad set", "Campaign", "Status", "Spend", "Impressions", "Clicks", "CTR %", "CPC", "Orders", "Delivered", "Revenue", "ROAS", "CAC"];

  return (
    <Panel
      title="Ad-level performance"
      subtitle={`${rows.length} ads with spend or attributed orders · spend in BDT (FIFO dollar cost)`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad / adset / campaign" className="h-7 w-[200px] text-xs" />
          <ExportMenu
            title="Ad-level performance"
            rangeLabel={rangeLabel}
            filename="marketing-ads"
            aoa={() => [head, ...rows.map((r) => [r.ad_name, r.adset_name, r.campaign_name, r.status, r.spend, r.impressions, r.clicks, r.ctr, r.cpc, r.orders, r.delivered_orders, r.revenue, r.roas, r.cac])]}
            disabled={rows.length === 0}
          />
        </div>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : rows.length === 0 ? (
        <EmptyState text="No ad-level spend in this range." />
      ) : (
        <div className="max-h-[560px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <TableRow>
                <TableHead>Ad</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">CAC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.ad_id}>
                  <TableCell>
                    <div className="max-w-[280px] truncate font-medium">{r.ad_name}</div>
                    <div className="max-w-[280px] truncate text-[11px] text-muted-foreground">
                      {r.campaign_name} · {r.adset_name}
                    </div>
                    <Badge variant="outline" className="mt-0.5 text-[10px] uppercase">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(Number(r.spend))}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.clicks).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.ctr).toFixed(2)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.orders).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.delivered_orders).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(Number(r.revenue))}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${Number(r.roas) >= 2 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {Number(r.roas).toFixed(2)}x
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(Number(r.cac))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
