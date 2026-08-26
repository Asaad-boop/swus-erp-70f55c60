import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Boxes, Download, Moon, PackageSearch, Plus, Sun, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentRole } from "@/hooks/use-current-role";
import {
  DataPanel,
  DataTable,
  EmptyState,
  ErpPageHeader,
  SkeletonBlock,
  StatCard,
  StatPill,
  StatusBadge,
  Toolbar,
  type Density,
  type DataTableColumn,
  type StatusVariant,
  type StatusVisual,
} from "@/components/erp/ui";

export const Route = createFileRoute("/uipreview")({
  head: () => ({
    meta: [
      { title: "UI Kit v2 — Quiet Precision | SyncWithUs ERP" },
      {
        name: "description",
        content:
          "Living reference for the SyncWithUs ERP design system: tokens, status scale, elevation, density and shared data primitives.",
      },
      { property: "og:title", content: "UI Kit v2 — Quiet Precision" },
      { property: "og:description", content: "The shared ERP design system reference: tokens, primitives and states." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UiPreview,
});

const STATUSES: StatusVariant[] = ["success", "warning", "danger", "info", "neutral"];
const VISUALS: StatusVisual[] = ["solid", "soft", "outline"];

type Row = { id: string; sku: string; product: string; qty: number; value: number; state: StatusVariant };

const ROWS: Row[] = [
  { id: "1", sku: "HOB-CUBOFO-0004", product: "Foldable Hair Brush with Mirror", qty: 128, value: 41280, state: "success" },
  { id: "2", sku: "HOB-KIDPRA-0011", product: "Kids Prayer Gift Set", qty: 14, value: 12600, state: "warning" },
  { id: "3", sku: "HOB-ROCLAU-0002", product: "Rocket Launcher Toy", qty: 0, value: 0, state: "danger" },
  { id: "4", sku: "HOB-DESORG-0019", product: "Desk Organizer Rack", qty: 62, value: 18600, state: "info" },
  { id: "5", sku: "HOB-BOWCLI-0007", product: "Bow Hair Clip Set", qty: 340, value: 27200, state: "neutral" },
];

const bdt = (n: number) => `৳${n.toLocaleString("en-BD")}`;

function UiPreview() {
  const { isAdmin } = useCurrentRole();
  const [density, setDensity] = useState<Density>("default");
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState<string[]>(["active"]);
  const [dark, setDark] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isAdmin && !import.meta.env.DEV) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <EmptyState
          icon={<PackageSearch className="h-5 w-5" />}
          title="UI kit is admin-only"
          description="This reference page is limited to administrators."
        />
      </main>
    );
  }

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const columns: DataTableColumn<Row>[] = [
    { key: "sku", header: "SKU", cell: (r) => <span className="font-mono text-caption-v2">{r.sku}</span>, width: "180px" },
    { key: "product", header: "Product", cell: (r) => <span className="font-medium">{r.product}</span> },
    { key: "state", header: "Status", cell: (r) => <StatusBadge variant={r.state} dot>{r.state}</StatusBadge>, width: "130px" },
    { key: "qty", header: "Qty", numeric: true, cell: (r) => r.qty.toLocaleString(), width: "90px" },
    { key: "value", header: "Stock value", numeric: true, cell: (r) => bdt(r.value), width: "140px" },
  ];

  const filtered = ROWS.filter((r) =>
    search ? (r.product + r.sku).toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <main data-density={density} className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <ErpPageHeader
          breadcrumb="Design system / v2"
          title="Quiet Precision — UI kit"
          subtitle="Every style used in Phases 2–6 must appear on this page first."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={toggleDark}>
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {dark ? "Light" : "Dark"}
              </Button>
              <Button size="sm">
                <Plus className="h-4 w-4" /> Primary action
              </Button>
            </>
          }
        />

        {/* Status scale */}
        <DataPanel title="Status scale" description="5 tones × 3 visuals — the only status colours in the app.">
          <div className="space-y-3">
            {VISUALS.map((v) => (
              <div key={v} className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-caption-v2 uppercase tracking-wider text-muted-foreground">{v}</span>
                {STATUSES.map((s) => (
                  <StatusBadge key={s} variant={s} visual={v} dot>
                    {s}
                  </StatusBadge>
                ))}
              </div>
            ))}
          </div>
        </DataPanel>

        {/* Elevation */}
        <DataPanel title="Elevation" description="Exactly three levels — flat, raised, overlay.">
          <div className="grid gap-4 sm:grid-cols-3">
            {(["flat", "raised", "overlay"] as const).map((e) => (
              <div
                key={e}
                className={`rounded-xl border border-border bg-card p-4 text-small-v2 elevation-${e}`}
              >
                <div className="text-h5">{e}</div>
                <p className="mt-1 text-muted-foreground">--elevation-{e}</p>
              </div>
            ))}
          </div>
        </DataPanel>

        {/* Typography */}
        <DataPanel title="Typography" description="Sora for h1–h3, Manrope for h4–h5 and body.">
          <div className="space-y-2">
            <div className="text-h1">Heading one — ৳12,45,880</div>
            <div className="text-h2">Heading two — order pipeline</div>
            <div className="text-h3">Heading three — panel title</div>
            <div className="text-h4">Heading four — section label</div>
            <div className="text-h5">Heading five — table group</div>
            <p className="text-body-v2">Body — সব amount tabular-nums দিয়ে দেখানো হয়।</p>
            <p className="text-small-v2 text-muted-foreground">Small — supporting copy.</p>
            <p className="text-caption-v2 uppercase tracking-wider text-muted-foreground">Caption — meta line</p>
          </div>
        </DataPanel>

        {/* Stat cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Delivered revenue" value={bdt(1245880)} delta={12.4} hint="vs previous 30 days" icon={<Boxes className="h-3.5 w-3.5" />} />
          <StatCard label="Return rate" value="8.2%" delta={2.1} invertDelta hint="lower is better" />
          <StatCard label="Net profit" value={bdt(208430)} delta={-4.7} hint="after ads & COGS" />
          <StatCard label="Open orders" value="342" delta={0} hint="flat week on week" />
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <StatPill label="Pending" value="128" hint="awaiting confirm" tone="warning" />
          <StatPill label="In transit" value="76" hint="courier scanned" tone="primary" />
          <StatPill label="Cancelled" value="9" hint="today" tone="danger" />
        </section>

        {/* Toolbar + table */}
        <DataPanel
          flush
          title="DataTable + Toolbar"
          description="Sticky header, no zebra, hover row actions, density-aware."
          actions={
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setShowEmpty((v) => !v)}>
                {showEmpty ? "Show rows" : "Show empty"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLoading((v) => !v)}>
                {loading ? "Stop loading" : "Show loading"}
              </Button>
            </div>
          }
          footer={<span className="text-muted-foreground">{filtered.length} rows · density {density}</span>}
        >
          <div className="px-4">
            <Toolbar
              chips={[
                { value: "active", label: "Active", count: 5 },
                { value: "low", label: "Low stock", count: 2 },
                { value: "archived", label: "Archived", count: 0 },
              ]}
              selected={chips}
              onToggleChip={(v) => setChips((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search SKU or product…"
              density={density}
              onDensityChange={setDensity}
              actions={
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4" /> Export
                </Button>
              }
            />
          </div>
          <DataTable
            columns={columns}
            rows={showEmpty ? [] : filtered}
            rowKey={(r) => r.id}
            loading={loading}
            containerClassName="max-h-[420px]"
            rowActions={() => (
              <>
                <Button variant="ghost" size="sm">Edit</Button>
                <Button variant="ghost" size="sm" className="text-[var(--danger-text)]">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            empty={
              <EmptyState
                compact
                icon={<PackageSearch className="h-5 w-5" />}
                title="No products match"
                description="Filter বদলে আবার চেষ্টা করো।"
                action={<Button size="sm" variant="outline" onClick={() => setShowEmpty(false)}>Reset filters</Button>}
              />
            }
          />
        </DataPanel>

        {/* Skeletons */}
        <DataPanel title="Skeletons" description="Shimmer normally; fades under reduced motion.">
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonBlock height={72} rounded="lg" />
            <div className="space-y-2">
              <SkeletonBlock height={14} className="w-1/3" />
              <SkeletonBlock height={10} />
              <SkeletonBlock height={10} className="w-4/5" />
            </div>
          </div>
        </DataPanel>
      </div>
    </main>
  );
}
