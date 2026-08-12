import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { Panel, EmptyState, ExportMenu, REPORT_QUERY_OPTS } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type CourierRow = {
  courier: string; shipped: number; delivered: number; returned: number; partial: number;
  in_transit: number; delivered_value: number; collected: number; courier_charge: number;
  avg_days: number; success_rate: number; return_rate: number; charge_per_parcel: number;
};

type AreaRow = {
  area: string; shipped: number; delivered: number; returned: number;
  delivered_value: number; courier_charge: number; avg_days: number;
  success_rate: number; return_rate: number;
};

function rateTone(v: number, goodAbove: number) {
  return v >= goodAbove ? "text-emerald-600 dark:text-emerald-400" : v >= goodAbove - 10 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
}

export function CourierPerformancePanel({ args, enabled, rangeLabel }: { args: RpcArgs; enabled: boolean; rangeLabel?: string }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const q = useQuery({
    queryKey: ["rpt-courier-perf", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_courier_performance", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as CourierRow[];
    },
  });
  const rows = q.data ?? [];
  const head = ["Courier", "Shipped", "Delivered", "Returned", "In transit", "Success %", "Return %", "Avg days", "Delivered value", "Collected", "Courier charge", "Charge / parcel"];

  return (
    <Panel
      title="Courier performance"
      subtitle="Success and return rate per courier, on parcels shipped in this range"
      action={
        <ExportMenu
          title="Courier performance"
          rangeLabel={rangeLabel}
          filename="courier-performance"
          aoa={() => [head, ...rows.map((r) => [r.courier, r.shipped, r.delivered, r.returned, r.in_transit, r.success_rate, r.return_rate, r.avg_days, r.delivered_value, r.collected, r.courier_charge, r.charge_per_parcel])]}
          disabled={rows.length === 0}
        />
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : rows.length === 0 ? (
        <EmptyState text="No parcels shipped in this range." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Courier</TableHead>
                <TableHead className="text-right">Shipped</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Returned</TableHead>
                <TableHead className="text-right">In transit</TableHead>
                <TableHead className="text-right">Success %</TableHead>
                <TableHead className="text-right">Return %</TableHead>
                <TableHead className="text-right">Avg days</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Charge / parcel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.courier}>
                  <TableCell className="font-medium capitalize">{r.courier}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.shipped).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.delivered).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{Number(r.returned).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.in_transit).toLocaleString()}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${rateTone(Number(r.success_rate), 90)}`}>{Number(r.success_rate).toFixed(2)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.return_rate).toFixed(2)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.avg_days).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(Number(r.collected))}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(Number(r.charge_per_parcel))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

export function DeliveryAreaPanel({ args, enabled, rangeLabel }: { args: RpcArgs; enabled: boolean; rangeLabel?: string }) {
  const [dim, setDim] = useState<"zone" | "city">("zone");
  const [search, setSearch] = useState("");
  const [minShipped, setMinShipped] = useState(5);
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to, _dim: dim };

  const q = useQuery({
    queryKey: ["rpt-delivery-areas", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_delivery_areas", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as AreaRow[];
    },
  });

  const term = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter(
    (r) => Number(r.shipped) >= minShipped && (!term || (r.area ?? "").toLowerCase().includes(term)),
  );
  const head = ["Area", "Shipped", "Delivered", "Returned", "Success %", "Return %", "Avg days", "Delivered value", "Courier charge"];

  return (
    <Panel
      title="Delivery area performance"
      subtitle={`${rows.length} ${dim === "zone" ? "zones" : "cities"} · weak areas are where return % is high`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={dim} onValueChange={(v) => setDim(v as "zone" | "city")}>
            <TabsList className="h-7">
              <TabsTrigger value="zone" className="h-6 px-2.5 text-xs">Zone</TabsTrigger>
              <TabsTrigger value="city" className="h-6 px-2.5 text-xs">City</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            type="number"
            min={1}
            value={minShipped}
            onChange={(e) => setMinShipped(Math.max(1, Number(e.target.value) || 1))}
            className="h-7 w-[74px] text-xs"
            title="Minimum parcels shipped"
          />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Area" className="h-7 w-[150px] text-xs" />
          <ExportMenu
            title="Delivery area performance"
            rangeLabel={rangeLabel}
            filename={`delivery-${dim}`}
            aoa={() => [head, ...rows.map((r) => [r.area, r.shipped, r.delivered, r.returned, r.success_rate, r.return_rate, r.avg_days, r.delivered_value, r.courier_charge])]}
            disabled={rows.length === 0}
          />
        </div>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : rows.length === 0 ? (
        <EmptyState text="No area has this many parcels in the range." />
      ) : (
        <div className="max-h-[520px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <TableRow>
                <TableHead>{dim === "zone" ? "Zone" : "City"}</TableHead>
                <TableHead className="text-right">Shipped</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Returned</TableHead>
                <TableHead className="text-right">Success %</TableHead>
                <TableHead className="text-right">Avg days</TableHead>
                <TableHead className="text-right">Delivered value</TableHead>
                <TableHead className="text-right">Courier charge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.area}>
                  <TableCell className="font-medium">
                    {r.area}
                    {Number(r.return_rate) >= 25 && (
                      <Badge variant="outline" className="ml-2 border-rose-500/40 text-[10px] text-rose-600 dark:text-rose-400">
                        high return
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.shipped).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.delivered).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{Number(r.returned).toLocaleString()}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${rateTone(Number(r.success_rate), 90)}`}>{Number(r.success_rate).toFixed(2)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.avg_days).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(Number(r.delivered_value))}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(Number(r.courier_charge))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
