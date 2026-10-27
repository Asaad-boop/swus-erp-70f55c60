import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Truck, ChevronDown, ChevronRight } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCargoAgentDashboard } from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_authenticated/erp/imports/agents")({
  head: () => ({ meta: [{ title: "Cargo Agents — Imports" }] }),
  component: CargoAgentsDashboard,
});

function CargoAgentsDashboard() {
  const { brandIds, isAllBrands, activeBrand } = useBrand();
  const dashFn = useServerFn(getCargoAgentDashboard);
  const { data = [], isLoading } = useQuery({
    queryKey: ["imp-cargo-dashboard", brandIds.join(",")],
    queryFn: () => dashFn({ data: { brandIds } }),
    enabled: brandIds.length > 0,
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Cargo Agents Dashboard</h2>
        <span className="ml-2 text-xs text-muted-foreground">
          {isAllBrands ? "All brands" : activeBrand?.name}
        </span>
      </div>

      {isLoading && <Card className="p-8 text-sm text-muted-foreground text-center">Loading…</Card>}
      {!isLoading && (data as any[]).length === 0 && (
        <Card className="p-8 text-sm text-muted-foreground text-center">
          No cargo agents yet. Add agents from Imports → Settings.
        </Card>
      )}

      <div className="space-y-3">
        {(data as any[]).map((row) => {
          const a = row.agent;
          const isOpen = !!open[a.id];
          return (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setOpen((s) => ({ ...s, [a.id]: !s[a.id] }))}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="font-semibold">{a.name}</div>
                    <Badge variant={a.is_active ? "outline" : "secondary"}>{a.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground ml-6">
                    {a.contact_person || "—"}{a.phone ? ` · ${a.phone}` : ""}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-right">
                  <Stat label="POs" value={String(row.po_count)} />
                  <Stat label="Pcs" value={Number(row.pcs_total ?? 0).toLocaleString()} />
                  <Stat label="Weight" value={`${Number(row.weight_total ?? 0).toLocaleString()} kg`} />
                  <Stat label="Buying" value={fmtBdt(row.buying_total)} />
                  <Stat label="Shipping" value={fmtBdt(row.shipping_total)} />
                  <Stat label="Total bill" value={fmtBdt(row.bill_total ?? row.grand_total)} />
                  <Stat label="Paid / Due" value={`${fmtBdt(row.paid_total)} / ${fmtBdt(row.due_total)}`} className={row.due_total > 0 ? "text-orange-600" : ""} />
                </div>
              </div>
              {isOpen && (
                <div className="mt-4 border-t border-border pt-3">
                  {row.pos.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No POs.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground">
                          <tr className="text-left">
                            <th className="py-1.5 pr-3">PO #</th>
                            <th className="py-1.5 pr-3">Date</th>
                            <th className="py-1.5 pr-3">Status</th>
                            <th className="py-1.5 pr-3 text-right">Grand total</th>
                            <th className="py-1.5 pr-3 text-right">Paid</th>
                            <th className="py-1.5 text-right">Due</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.pos.map((p: any) => (
                            <tr key={p.id} className="border-t border-border">
                              <td className="py-1.5 pr-3">
                                <Link
                                  to="/erp/imports/orders/$orderId"
                                  params={{ orderId: p.id }}
                                  className="text-primary hover:underline"
                                >
                                  {p.po_number}
                                </Link>
                              </td>
                              <td className="py-1.5 pr-3">{p.order_date}</td>
                              <td className="py-1.5 pr-3"><Badge variant="outline">{p.status}</Badge></td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{fmtBdt(p.grand_total_bdt)}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{fmtBdt(p.paid_bdt)}</td>
                              <td className={`py-1.5 text-right tabular-nums ${Number(p.due_bdt) > 0 ? "text-orange-600" : ""}`}>{fmtBdt(p.due_bdt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-semibold tabular-nums text-sm ${className}`}>{value}</div>
    </div>
  );
}