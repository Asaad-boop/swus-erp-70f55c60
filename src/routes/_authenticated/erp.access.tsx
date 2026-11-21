import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  Copy,
  Eye,
  KeyRound,
  LayoutGrid,
  Link2,
  Loader2,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrand } from "@/contexts/brand-context";
import { MY_ACCESS_QUERY_KEY } from "@/hooks/use-my-access-profile";
import { useCurrentRole } from "@/hooks/use-current-role";
import { SELF_SERVICE_PAGES } from "@/lib/erp/access";
import { staffAdmin, type AccessPayload, type StaffUser } from "@/lib/erp/access-admin";
import type { AppRole, BrandMode } from "@/lib/erp/access-profile.model";
import {
  GRANT_SAFE_PAGES,
  SECTORS,
  SECTOR_BY_KEY,
  extraRoles,
  groupPages,
  pageLabel,
  pagesPowered,
  rolesFor,
  sectorsFromRoles,
  type SectorKey,
} from "@/lib/erp/access-sectors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/access")({
  head: () => ({ meta: [{ title: "Staff & Access" }] }),
  component: AccessPage,
});

// ───────────────────────── draft model ─────────────────────────

type Draft = {
  displayName: string;
  sectors: SectorKey[];
  keepRoles: AppRole[];
  /** Selected pages among those the sectors power. */
  pages: string[];
  /** Older one-off page grants outside the sectors (kept until removed). */
  extras: string[];
  brandMode: BrandMode;
  brandIds: string[];
};

const SELF = new Set(SELF_SERVICE_PAGES);
const visiblePowered = (roles: string[]) => pagesPowered(roles).filter((p) => !SELF.has(p));

function draftFrom(u: StaffUser): Draft {
  const sectors = sectorsFromRoles(u.roles);
  const keepRoles = extraRoles(u.roles);
  const powered = visiblePowered(u.roles);
  const poweredSet = new Set(powered);
  const custom = u.pageMode === "custom";
  return {
    displayName: u.displayName ?? "",
    sectors,
    keepRoles,
    pages: custom ? u.allowedPages.filter((p) => poweredSet.has(p)) : powered,
    extras: custom ? u.allowedPages.filter((p) => !poweredSet.has(p) && !SELF.has(p)) : [],
    brandMode: u.brandMode,
    brandIds: u.brandIds,
  };
}

function toPayload(d: Draft): AccessPayload {
  const roles = rolesFor(d.sectors, d.keepRoles);
  const powered = visiblePowered(roles);
  const sel = new Set(d.pages);
  const all = powered.every((p) => sel.has(p)) && d.extras.length === 0;
  return {
    roles,
    brandMode: d.brandMode,
    brandIds: d.brandMode === "selected" ? d.brandIds : [],
    pageMode: all ? "role_default" : "custom",
    allowedPages: all ? [] : [...powered.filter((p) => sel.has(p)), ...d.extras],
  };
}

const sig = (d: Draft) =>
  JSON.stringify({ ...toPayload(d), roles: toPayload(d).roles.sort(), name: d.displayName.trim() });

function problems(d: Draft): string | null {
  if (rolesFor(d.sectors, d.keepRoles).length === 0) return "অন্তত একটা সেক্টর বেছে নিন";
  if (d.pages.length + d.extras.length === 0) return "অন্তত একটা পেজ রাখুন";
  if (d.brandMode === "selected" && d.brandIds.length === 0) return "অন্তত একটা ব্র্যান্ড বেছে নিন";
  return null;
}

function isDisabled(u: StaffUser) {
  return Boolean(
    u.bannedUntil && u.bannedUntil !== "none" && new Date(u.bannedUntil).getTime() > Date.now(),
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

function easyPassword() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `swus${n}`;
}

// ───────────────────────── page ─────────────────────────

function AccessPage() {
  const { isAdmin, isLoading: roleLoading } = useCurrentRole();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["staff-access"],
    queryFn: staffAdmin.list,
    enabled: isAdmin,
    staleTime: 30_000,
  });
  const users = useMemo(
    () =>
      [...(list.data?.users ?? [])].sort((a, b) =>
        (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""),
      ),
    [list.data],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const selected = users.find((u) => u.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && users[0]) setSelectedId(users[0].id);
  }, [selectedId, users]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.displayName ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)
    );
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["staff-access"] }),
      qc.invalidateQueries({ queryKey: MY_ACCESS_QUERY_KEY }),
    ]);
  };

  if (roleLoading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-10 text-center text-sm text-muted-foreground">
        শুধু admin স্টাফদের access দিতে পারবে।
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-3 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">স্টাফ ও Access</h1>
            <p className="text-xs text-muted-foreground">
              কে কোন সেক্টরে কাজ করবে, কোন পেজ দেখবে আর কোন ব্র্যান্ড — এক জায়গায়
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" /> নতুন স্টাফ
        </Button>
      </div>

      {list.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">স্টাফ লিস্ট লোড হয়নি</div>
            <div className="text-xs">{(list.error as Error).message}</div>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => list.refetch()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> আবার চেষ্টা
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* STAFF LIST */}
        <aside className={cn("space-y-2", mobileEditor && "hidden lg:block")}>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="নাম বা email খুঁজুন"
              className="pl-8"
            />
          </div>
          <div className="text-[11px] text-muted-foreground">{users.length} জন স্টাফ</div>
          {list.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((u) => (
                <StaffRow
                  key={u.id}
                  u={u}
                  active={u.id === selectedId}
                  onClick={() => {
                    setSelectedId(u.id);
                    setMobileEditor(true);
                  }}
                />
              ))}
            </ul>
          )}
        </aside>

        {/* EDITOR */}
        <main className={cn(!mobileEditor && "hidden lg:block")}>
          {selected ? (
            <Editor
              key={selected.id + (selected.updatedAt ?? "")}
              user={selected}
              onBack={() => setMobileEditor(false)}
              onChanged={refresh}
              onDeleted={async () => {
                setSelectedId(null);
                setMobileEditor(false);
                await refresh();
              }}
            />
          ) : (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              বাম পাশ থেকে একজন স্টাফ বেছে নিন
            </div>
          )}
        </main>
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (id) => {
          await refresh();
          setSelectedId(id);
          setMobileEditor(true);
        }}
      />
    </div>
  );
}

function StaffRow({ u, active, onClick }: { u: StaffUser; active: boolean; onClick: () => void }) {
  const sectors = sectorsFromRoles(u.roles);
  const name = u.displayName || u.email || "—";
  const off = isDisabled(u);
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors",
          active ? "border-primary/50 bg-primary/5" : "bg-card hover:bg-muted/40",
          off && "opacity-60",
        )}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold">
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{name}</span>
            {off && (
              <span className="rounded bg-rose-100 px-1 text-[9px] font-bold text-rose-700">
                বন্ধ
              </span>
            )}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{u.email}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {u.roles.includes("owner") && (
              <span className="rounded border border-zinc-400/40 px-1 text-[10px] font-medium">
                Owner
              </span>
            )}
            {sectors.map((k) => (
              <span
                key={k}
                className={cn("rounded border px-1 text-[10px] font-medium", SECTOR_BY_KEY[k].tone)}
              >
                {SECTOR_BY_KEY[k].title}
              </span>
            ))}
            {u.pageMode === "custom" && (
              <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                {u.allowedPages.length} পেজ
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

// ───────────────────────── editor ─────────────────────────

function Editor({
  user,
  onBack,
  onChanged,
  onDeleted,
}: {
  user: StaffUser;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const initial = useMemo(() => draftFrom(user), [user]);
  const [d, setD] = useState<Draft>(initial);
  const dirty = sig(d) !== sig(initial);
  const issue = problems(d);

  const save = useMutation({
    mutationFn: () =>
      staffAdmin.save(
        user.id,
        toPayload(d),
        d.displayName.trim() !== (user.displayName ?? "") ? d.displayName : undefined,
      ),
    onSuccess: async () => {
      toast.success("Access সেভ হয়েছে");
      await onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {initials(d.displayName || user.email || "?")}
        </span>
        <div className="min-w-0 flex-1">
          <Input
            value={d.displayName}
            onChange={(e) => setD({ ...d, displayName: e.target.value })}
            className="h-8 max-w-sm border-transparent px-1 text-base font-semibold shadow-none hover:border-input focus:border-input"
            placeholder="নাম"
          />
          <div className="truncate px-1 text-xs text-muted-foreground">
            {user.email} ·{" "}
            {user.lastSignInAt
              ? `শেষ login ${formatDistanceToNow(new Date(user.lastSignInAt), { addSuffix: true })}`
              : "কখনো login করেনি"}
          </div>
        </div>
      </div>

      <SectorPicker d={d} setD={setD} ownerLocked={user.roles.includes("owner")} />
      <PagePicker d={d} setD={setD} />
      <BrandPicker d={d} setD={setD} />
      <AccountPanel user={user} onChanged={onChanged} onDeleted={onDeleted} />

      {(dirty || save.isPending) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur lg:left-auto lg:right-6 lg:bottom-6 lg:w-[560px] lg:rounded-2xl lg:border lg:shadow-xl">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-xs">
              {issue ? (
                <span className="flex items-center gap-1 font-medium text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> {issue}
                </span>
              ) : (
                <Summary d={d} />
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setD(initial)}
              disabled={save.isPending}
            >
              বাতিল
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={!!issue || save.isPending}>
              {save.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              সেভ করুন
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ d }: { d: Draft }) {
  const p = toPayload(d);
  const n = p.pageMode === "custom" ? p.allowedPages.length : visiblePowered(p.roles).length;
  return (
    <span className="text-muted-foreground">
      <b className="text-foreground">{d.sectors.length}</b> সেক্টর ·{" "}
      <b className="text-foreground">{n}</b> পেজ ·{" "}
      {d.brandMode === "all" ? "সব ব্র্যান্ড" : `${d.brandIds.length} ব্র্যান্ড`}
    </span>
  );
}

function Section({
  step,
  title,
  hint,
  icon,
  right,
  children,
}: {
  step?: number;
  title: string;
  hint?: string;
  icon: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card">
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            {step ? <span className="mr-1 text-muted-foreground">{step}.</span> : null}
            {title}
          </h2>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SectorPicker({
  d,
  setD,
  ownerLocked,
  compact,
}: {
  d: Draft;
  setD: (d: Draft) => void;
  ownerLocked?: boolean;
  compact?: boolean;
}) {
  const toggle = (k: SectorKey) => {
    const on = d.sectors.includes(k);
    const sectors = on ? d.sectors.filter((x) => x !== k) : [...d.sectors, k];
    const roles = rolesFor(sectors, d.keepRoles);
    const powered = new Set(visiblePowered(roles));
    // Turning a sector on shows all its pages; turning one off drops pages nothing else powers.
    const added = on ? [] : visiblePowered([SECTOR_BY_KEY[k].role]);
    const promoted = d.extras.filter((p) => powered.has(p));
    const pages = [...new Set([...d.pages, ...added, ...promoted])].filter((p) => powered.has(p));
    setD({ ...d, sectors, pages, extras: d.extras.filter((p) => !powered.has(p)) });
  };

  const grid = (
    <div
      className={cn(
        "grid gap-2",
        compact ? "grid-cols-1 sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {SECTORS.map((s) => {
        const on = d.sectors.includes(s.key);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
              on ? s.tone : "bg-background hover:bg-muted/40",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                on ? "border-current bg-current" : "border-muted-foreground/40",
              )}
            >
              {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm font-semibold", !on && "text-foreground")}>
                {s.title}
              </span>
              <span className="block text-[11px] leading-snug text-muted-foreground">{s.hint}</span>
              {on && s.caution && (
                <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-rose-600">
                  <AlertTriangle className="h-3 w-3" /> {s.caution}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (compact) return grid;
  return (
    <Section
      step={1}
      icon={<Users className="h-4 w-4" />}
      title="কোন কাজ করবে? — সেক্টর"
      hint="সেক্টর দিলে ওই কাজের পেজ আর ডেটা দুটোই খুলে যায়। একাধিক বেছে নেওয়া যায়।"
    >
      {ownerLocked && (
        <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
          এই account-টা <b>Owner</b> — owner অবস্থা আলাদাভাবে রাখা আছে, সেক্টর বদলালেও owner থাকবে।
        </p>
      )}
      {grid}
    </Section>
  );
}

function PagePicker({ d, setD }: { d: Draft; setD: (d: Draft) => void }) {
  const roles = rolesFor(d.sectors, d.keepRoles);
  const powered = visiblePowered(roles);
  const groups = groupPages(powered);
  const sel = new Set(d.pages);
  const allOn = powered.length > 0 && powered.every((p) => sel.has(p));

  const setPages = (pages: string[]) => setD({ ...d, pages });
  const togglePage = (p: string) =>
    setPages(sel.has(p) ? d.pages.filter((x) => x !== p) : [...d.pages, p]);
  const toggleGroup = (paths: string[]) => {
    const every = paths.every((p) => sel.has(p));
    setPages(
      every ? d.pages.filter((p) => !paths.includes(p)) : [...new Set([...d.pages, ...paths])],
    );
  };

  return (
    <Section
      step={2}
      icon={<LayoutGrid className="h-4 w-4" />}
      title="কোন পেজ দেখবে"
      hint="টিক তুলে দিলে ওই পেজ ওর মেনুতে দেখাবে না। সেক্টরের বাইরের পেজ এখানে আসে না।"
      right={
        powered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPages(allOn ? [] : powered)}
          >
            {allOn ? "সব তুলে দিন" : "সব পেজ দিন"}
          </Button>
        )
      }
    >
      {powered.length === 0 ? (
        <p className="text-sm text-muted-foreground">আগে উপরে একটা সেক্টর বেছে নিন।</p>
      ) : (
        <div className="space-y-3">
          <div className="text-[11px] text-muted-foreground">
            {d.pages.length}/{powered.length} পেজ দেখবে
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map((g) => {
              const paths = g.pages.map((p) => p.path);
              const on = paths.filter((p) => sel.has(p)).length;
              return (
                <div key={g.section} className="rounded-xl border p-3">
                  <label className="mb-2 flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={on === paths.length ? true : on === 0 ? false : "indeterminate"}
                      onCheckedChange={() => toggleGroup(paths)}
                    />
                    <span className="text-xs font-bold uppercase tracking-wide">{g.section}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {on}/{paths.length}
                    </span>
                  </label>
                  <div className="space-y-1.5 pl-1">
                    {g.pages.map((p) => (
                      <label
                        key={p.path}
                        className="flex cursor-pointer items-center gap-2 text-[13px]"
                      >
                        <Checkbox
                          checked={sel.has(p.path)}
                          onCheckedChange={() => togglePage(p.path)}
                        />
                        <span
                          className={cn(!sel.has(p.path) && "text-muted-foreground line-through")}
                        >
                          {p.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {d.extras.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> আগে আলাদা করে দেওয়া পেজ (সেক্টরের বাইরে)
          </div>
          <p className="mb-2 text-[11px] text-amber-800/80">
            এগুলোর ডেটা ঠিকমতো লোড নাও হতে পারে। দরকার হলে উপরে মানানসই সেক্টর দিন, তারপর এগুলো সরিয়ে
            দিন।
          </p>
          <div className="flex flex-wrap gap-1.5">
            {d.extras.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-[11px]"
              >
                {pageLabel(p)}
                {GRANT_SAFE_PAGES.has(p) && (
                  <span className="text-emerald-600" title="এটা কাজ করে">
                    ✓
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setD({ ...d, extras: d.extras.filter((x) => x !== p) })}
                  className="text-muted-foreground hover:text-rose-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function BrandPicker({
  d,
  setD,
  compact,
}: {
  d: Draft;
  setD: (d: Draft) => void;
  compact?: boolean;
}) {
  const { brands } = useBrand();
  const toggle = (id: string) => {
    const ids = d.brandIds.includes(id) ? d.brandIds.filter((x) => x !== id) : [...d.brandIds, id];
    setD({ ...d, brandMode: "selected", brandIds: ids });
  };
  const chips = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setD({ ...d, brandMode: "all", brandIds: [] })}
        className={cn(
          "rounded-full border px-3 py-1.5 text-sm font-medium",
          d.brandMode === "all"
            ? "border-primary bg-primary text-primary-foreground"
            : "hover:bg-muted",
        )}
      >
        সব ব্র্যান্ড
      </button>
      {brands.map((b) => {
        const on = d.brandMode === "selected" && d.brandIds.includes(b.id);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => toggle(b.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            {on && <Check className="mr-1 inline h-3.5 w-3.5" />}
            {b.name}
          </button>
        );
      })}
    </div>
  );
  if (compact) return chips;
  return (
    <Section
      step={3}
      icon={<Building2 className="h-4 w-4" />}
      title="কোন ব্র্যান্ডের কাজ"
      hint="শুধু বেছে নেওয়া ব্র্যান্ডের অর্ডার আর ডেটা দেখবে"
    >
      {chips}
    </Section>
  );
}

function AccountPanel({
  user,
  onChanged,
  onDeleted,
}: {
  user: StaffUser;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [pw, setPw] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const off = isDisabled(user);

  const setPassword = useMutation({
    mutationFn: () => staffAdmin.setPassword(user.id, pw),
    onSuccess: () => {
      toast.success(`নতুন password সেট হয়েছে: ${pw}`);
      setPw("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ban = useMutation({
    mutationFn: () => staffAdmin.setBan(user.id, !off),
    onSuccess: async () => {
      toast.success(off ? "Account আবার চালু হয়েছে" : "Account বন্ধ করা হয়েছে");
      await onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const link = useMutation({
    mutationFn: () => staffAdmin.loginLink(user.email ?? "", "magiclink"),
    onSuccess: async ({ url }) => {
      if (!url) return toast.error("Link পাওয়া যায়নি");
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Login link কপি হয়েছে — স্টাফকে পাঠিয়ে দিন");
      } catch {
        window.prompt("Login link", url);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => staffAdmin.remove(user.id),
    onSuccess: async () => {
      toast.success("Staff account delete হয়েছে");
      setConfirmDelete(false);
      await onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      icon={<KeyRound className="h-4 w-4" />}
      title="Account"
      hint="Password, login link, বন্ধ বা delete"
    >
      <div className="space-y-4">
        <div>
          <Label className="text-xs">নতুন password</Label>
          <div className="mt-1 flex gap-2">
            <Input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="কমপক্ষে ৬ অক্ষর"
              className="max-w-xs"
            />
            <Button
              variant="outline"
              size="icon"
              title="সহজ password বানান"
              onClick={() => setPw(easyPassword())}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setPassword.mutate()}
              disabled={pw.length < 6 || setPassword.isPending}
            >
              {setPassword.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              সেট করুন
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => link.mutate()}
            disabled={link.isPending || !user.email}
          >
            <Link2 className="mr-1 h-3.5 w-3.5" /> Login link কপি
          </Button>
          <Button variant="outline" size="sm" onClick={() => ban.mutate()} disabled={ban.isPending}>
            <Power className="mr-1 h-3.5 w-3.5" /> {off ? "আবার চালু করুন" : "Account বন্ধ করুন"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-rose-600 hover:text-rose-700"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{user.displayName || user.email} — delete করবেন?</DialogTitle>
            <DialogDescription>
              Login একেবারে মুছে যাবে। পুরনো অর্ডার আর হাজিরার রেকর্ড থাকবে। শুধু কিছুদিন আটকাতে চাইলে
              “Account বন্ধ করুন” ব্যবহার করুন।
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              না
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              হ্যাঁ, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ───────────────────────── create ─────────────────────────

function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const blank = (): Draft & { email: string; password: string } => ({
    displayName: "",
    email: "",
    password: easyPassword(),
    sectors: [],
    keepRoles: [],
    pages: [],
    extras: [],
    brandMode: "all",
    brandIds: [],
  });
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (open) setF(blank());
  }, [open]);

  const issue = !f.displayName.trim()
    ? "নাম দিন"
    : !/^\S+@\S+\.\S+$/.test(f.email.trim())
      ? "সঠিক email দিন"
      : f.password.length < 6
        ? "Password কমপক্ষে ৬ অক্ষর"
        : problems({ ...f, pages: visiblePowered(rolesFor(f.sectors, [])) });

  const create = useMutation({
    mutationFn: () =>
      staffAdmin.create({
        email: f.email.trim(),
        password: f.password,
        displayName: f.displayName.trim(),
        ...toPayload({ ...f, pages: visiblePowered(rolesFor(f.sectors, [])) }),
      }),
    onSuccess: async ({ id }) => {
      toast.success(`${f.displayName} তৈরি হয়েছে · email: ${f.email} · password: ${f.password}`, {
        duration: 15000,
      });
      onOpenChange(false);
      await onCreated(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLogin = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${f.email.trim()}\nPassword: ${f.password}`);
      toast.success("Login তথ্য কপি হয়েছে");
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>নতুন স্টাফ</DialogTitle>
          <DialogDescription>
            Login বানান, কোন কাজ করবে বেছে দিন — বাকি পরে ঠিক করা যাবে।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">নাম</Label>
              <Input
                value={f.displayName}
                onChange={(e) => setF({ ...f, displayName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Password</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setF({ ...f, password: easyPassword() })}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyLogin}
                  title="Login কপি"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">কোন কাজ করবে?</div>
            <SectorPicker d={f} setD={(d) => setF({ ...f, ...d })} compact />
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">কোন ব্র্যান্ড</div>
            <BrandPicker d={f} setD={(d) => setF({ ...f, ...d })} compact />
          </div>

          {f.sectors.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-[11px] text-muted-foreground">
              <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                দেখবে: {visiblePowered(rolesFor(f.sectors, [])).map(pageLabel).join(", ")}। তৈরি
                করার পর কোনো পেজ লুকাতে চাইলে editor থেকে টিক তুলে দিন।
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2">
          {issue && <span className="mr-auto text-xs text-rose-600">{issue}</span>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            বাতিল
          </Button>
          <Button onClick={() => create.mutate()} disabled={!!issue || create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            তৈরি করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
